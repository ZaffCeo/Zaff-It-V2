-- =============================================================================
-- ZAFF-IT V2 · 042_service_marketplace_ui.sql
-- Wave: Service Marketplace UI (#2) — Satisfy / No-Show lifecycle (doc §15)
-- Date: 2026-11-28
--
-- Adds the customer-side completion lifecycle to the 033 service marketplace:
--   · mark_service_satisfied(p_request_id)   — owner closes an accepted job,
--     stamps satisfied_at (escrow release marker; payment capture deferred).
--   · report_service_no_show(p_request_id)   — owner reports a provider no-show:
--     request flips back to 'open' for free rebooking, no_show_count++ and the
--     documented Rs.50 wallet compensation is credited via wallet_credit
--     (source_type 'refund', cap-clamped, reference-linked, audited).
--
-- Read-side only notes: the 24h auto-Satisfy rule is a display rule on top of
-- accepted_at/created_at (no cron dependency in Phase 1); 30-min quote window
-- and Rs.199 auto-assign fallback remain documented-not-implemented until a
-- scheduled worker exists (honest label in UI).
--
-- Depends on: 033_w7_verticals.sql (service_requests/service_quotes + RPCs),
--             025_w6_wallet_rules.sql (wallet_credit, wallet_ledger),
--             record_audit_log (00x backbone).
-- =============================================================================

-- 1) Columns ------------------------------------------------------------------
ALTER TABLE public.service_requests
    ADD COLUMN IF NOT EXISTS satisfied_at  TIMESTAMPTZ;
ALTER TABLE public.service_requests
    ADD COLUMN IF NOT EXISTS no_show_count INTEGER NOT NULL DEFAULT 0;

-- 1b) wallet_ledger.reference_type: allow 'service_request' links -------------
ALTER TABLE public.wallet_ledger
    DROP CONSTRAINT IF EXISTS wallet_ledger_reference_type_check;
ALTER TABLE public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_reference_type_check
    CHECK (reference_type = ANY (ARRAY['order'::text, 'review'::text,
        'referral'::text, 'redemption'::text, 'admin'::text, 'expiry'::text,
        'first500'::text, 'service_request'::text]));

-- 2) Satisfy (customer marks job complete) ------------------------------------
CREATE OR REPLACE FUNCTION public.mark_service_satisfied(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user UUID := auth.uid();
    v_req  public.service_requests%ROWTYPE;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;
    IF v_req.customer_id <> v_user THEN
        RAISE EXCEPTION 'Only the job owner can mark Satisfy';
    END IF;
    IF v_req.status <> 'accepted' THEN
        RAISE EXCEPTION 'Job not in accepted state (current: %)', v_req.status;
    END IF;
    IF v_req.satisfied_at IS NOT NULL THEN
        RAISE EXCEPTION 'Job already marked Satisfy';
    END IF;

    UPDATE public.service_requests
    SET status = 'closed', satisfied_at = now(), updated_at = now()
    WHERE id = p_request_id;

    PERFORM public.record_audit_log(
        v_user, 'customer', 'service_satisfied', 'service_requests', p_request_id,
        jsonb_build_object('status', 'accepted'),
        jsonb_build_object('accepted_price_paise', v_req.accepted_price_paise,
                           'no_show_count', v_req.no_show_count)
    );
    RETURN jsonb_build_object('ok', true, 'status', 'closed', 'satisfied_at', now());
END;
$function$;

-- 3) No-Show (customer reports provider absence) ------------------------------
CREATE OR REPLACE FUNCTION public.report_service_no_show(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user UUID := auth.uid();
    v_req  public.service_requests%ROWTYPE;
    v_coins INTEGER;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;
    IF v_req.customer_id <> v_user THEN
        RAISE EXCEPTION 'Only the job owner can report a no-show';
    END IF;
    IF v_req.status <> 'accepted' THEN
        RAISE EXCEPTION 'Job not in accepted state (current: %)', v_req.status;
    END IF;

    UPDATE public.service_requests
    SET status = 'open',                 -- free rebooking per doc §15
        accepted_quote_id = NULL,
        accepted_price_paise = NULL,
        no_show_count = v_req.no_show_count + 1,
        updated_at = now()
    WHERE id = p_request_id;

    UPDATE public.service_quotes
    SET status = 'declined'
    WHERE request_id = p_request_id AND status = 'accepted';

    -- Doc §15: customer gets Rs.50 wallet + free re-booking; provider gets the
    -- warning (provider-side strike policy lands with provider console).
    v_coins := public.wallet_credit(
        v_user, 500, 'refund', 'Service no-show compensation (Rs.50)',
        NULL, 'service_request', p_request_id, true
    );

    PERFORM public.record_audit_log(
        v_user, 'customer', 'service_no_show', 'service_requests', p_request_id,
        jsonb_build_object('status', 'accepted'),
        jsonb_build_object('no_show_count', v_req.no_show_count + 1,
                           'compensation_coins', v_coins)
    );
    RETURN jsonb_build_object('ok', true, 'status', 'open',
                              'no_show_count', v_req.no_show_count + 1,
                              'compensation_coins', v_coins);
END;
$function$;

-- 4) Grants (mutations via RPCs only; tables stay SELECT-only from 033) -------
REVOKE ALL ON FUNCTION public.mark_service_satisfied(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_service_satisfied(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.report_service_no_show(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.report_service_no_show(UUID) TO authenticated;

-- =============================================================================
-- ROLLBACK (exact, reverse order):
--   REVOKE EXECUTE ON FUNCTION public.report_service_no_show(UUID) FROM authenticated;
--   REVOKE EXECUTE ON FUNCTION public.mark_service_satisfied(UUID) FROM authenticated;
--   DROP FUNCTION public.report_service_no_show(UUID);
--   DROP FUNCTION public.mark_service_satisfied(UUID);
--   ALTER TABLE public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_reference_type_check;
--   ALTER TABLE public.wallet_ledger ADD CONSTRAINT wallet_ledger_reference_type_check
--     CHECK (reference_type = ANY (ARRAY['order'::text, 'review'::text, 'referral'::text,
--       'redemption'::text, 'admin'::text, 'expiry'::text, 'first500'::text]));
--   ALTER TABLE public.service_requests DROP COLUMN IF EXISTS no_show_count;
--   ALTER TABLE public.service_requests DROP COLUMN IF EXISTS satisfied_at;
-- =============================================================================
