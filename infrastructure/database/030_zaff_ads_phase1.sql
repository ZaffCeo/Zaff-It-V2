-- 030 — W-Z2 Zaff Ads Phase 1: 4 formats, pricing config, prepaid payments,
-- auditable dedup events, sponsored store/home-banner serving, admin controls.
-- EXTENDS the live W4c schema (028) — no parallel tables, no duplicated backend.
-- Honest: spend stays 0 until founder sets CPC/CPM; prepaid day-rate = budget by construction.

-- ============================================================================
-- 1. ad_campaigns extensions (statuses, placements, banner slots, payments)
-- ============================================================================
ALTER TABLE public.ad_campaigns
    DROP CONSTRAINT IF EXISTS ad_campaigns_placement_type_check;
ALTER TABLE public.ad_campaigns
    ADD CONSTRAINT ad_campaigns_placement_type_check
    CHECK (placement_type = ANY (ARRAY[
        'search_keyword'::text, 'category_banner'::text,
        'sponsored_store'::text, 'home_banner'::text]));

ALTER TABLE public.ad_campaigns
    DROP CONSTRAINT IF EXISTS ad_campaigns_status_check;
ALTER TABLE public.ad_campaigns
    ADD CONSTRAINT ad_campaigns_status_check
    CHECK (status = ANY (ARRAY[
        'draft'::text, 'pending_review'::text, 'approved'::text, 'scheduled'::text,
        'active'::text, 'paused'::text, 'completed'::text, 'rejected'::text,
        'cancelled'::text, 'out_of_budget'::text]));

ALTER TABLE public.ad_campaigns
    DROP CONSTRAINT IF EXISTS ad_campaigns_payment_status_check;

ALTER TABLE public.ad_campaigns
    ADD COLUMN IF NOT EXISTS banner_slot SMALLINT CHECK (banner_slot BETWEEN 1 AND 3),
    ADD COLUMN IF NOT EXISTS planned_start TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS planned_end TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'not_required',
    ADD COLUMN IF NOT EXISTS rzp_order_id TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.ad_campaigns
    ADD CONSTRAINT ad_campaigns_payment_status_check
    CHECK (payment_status = ANY (ARRAY[
        'not_required'::text, 'pending'::text, 'paid'::text, 'refunded'::text]));

-- home_banner must carry a slot; other placements must not.
ALTER TABLE public.ad_campaigns
    DROP CONSTRAINT IF EXISTS ad_banner_slot_required;
ALTER TABLE public.ad_campaigns
    ADD CONSTRAINT ad_banner_slot_required
    CHECK (
        (placement_type = 'home_banner' AND banner_slot IS NOT NULL)
        OR (placement_type <> 'home_banner')
    );

-- Backfill existing W4c rows (they were free-booking era).
UPDATE public.ad_campaigns SET payment_status = 'not_required' WHERE payment_status IS NULL;

-- ============================================================================
-- 2. ad_pricing_config — admin-controlled, merchants read-only
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ad_pricing_config (
    pricing_key   TEXT PRIMARY KEY,
    price_paise   INTEGER NOT NULL CHECK (price_paise > 0),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    updated_by    UUID REFERENCES auth.users(id),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ad_pricing_config (pricing_key, price_paise, is_active)
VALUES
    ('sponsored_product_day', 9900,  true),
    ('sponsored_store_day',   9900,  true),
    ('search_ad_day',         9900,  true),
    ('category_banner_day',   9900,  true),
    ('banner_slot_1_day',     99900, true),
    ('banner_slot_2_day',     79900, true),
    ('banner_slot_3_day',     59900, true)
ON CONFLICT (pricing_key) DO NOTHING;

ALTER TABLE public.ad_pricing_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ad_pricing_config' AND policyname = 'ad_pricing_read_all_auth') THEN
        CREATE POLICY ad_pricing_read_all_auth ON public.ad_pricing_config
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
-- No write policies: pricing changes only via upsert_ad_pricing (admin + audit).

-- ============================================================================
-- 3. ad_transactions — prepaid campaign payments (webhook-verified only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ad_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
    rzp_order_id    TEXT UNIQUE,
    rzp_payment_id  TEXT UNIQUE,
    amount_paise    INTEGER NOT NULL CHECK (amount_paise > 0),
    currency        TEXT NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR')),
    status          TEXT NOT NULL DEFAULT 'created'
                    CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_tx_campaign ON public.ad_transactions (campaign_id, status);

ALTER TABLE public.ad_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ad_transactions' AND policyname = 'ad_tx_select_own_merchant') THEN
        CREATE POLICY ad_tx_select_own_merchant ON public.ad_transactions
            FOR SELECT TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.ad_campaigns c
                    WHERE c.id = campaign_id AND c.merchant_id = auth.uid()
                )
                OR public.is_admin()
            );
    END IF;
END $$;
-- Writes: service-role (edge fn + webhook) only. No merchant writes.

-- ============================================================================
-- 4. ad_events — auditable, deduplicated impression/click log (fraud trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ad_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id  UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
    viewer_key   TEXT NOT NULL DEFAULT 'anon',
    bucket_start TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- dedup: one count per viewer per 10-minute bucket per event type
    CONSTRAINT ad_events_unique_bucket UNIQUE (campaign_id, event_type, viewer_key, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_ad_events_campaign ON public.ad_events (campaign_id, created_at DESC);

ALTER TABLE public.ad_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ad_events' AND policyname = 'ad_events_admin_only') THEN
        CREATE POLICY ad_events_admin_only ON public.ad_events
            FOR SELECT TO authenticated
            USING (public.is_admin());
    END IF;
END $$;
-- No merchant/customer select of raw events (counters surface via campaigns);
-- writes only via record_ad_event SECURITY DEFINER.

-- ============================================================================
-- 5. PRICING RPCs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_ad_pricing()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'pricing_key', p.pricing_key,
            'price_paise', p.price_paise,
            'is_active', p.is_active
        ) ORDER BY p.pricing_key), '[]'::JSONB)
    FROM public.ad_pricing_config p
    WHERE p.is_active;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_ad_pricing(p_pricing_key TEXT, p_price_paise INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_admin BOOLEAN := public.is_admin();
    v_old   INTEGER;
BEGIN
    IF NOT v_admin THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    IF p_price_paise IS NULL OR p_price_paise <= 0 THEN
        RAISE EXCEPTION 'Price must be positive';
    END IF;

    SELECT price_paise INTO v_old FROM public.ad_pricing_config WHERE pricing_key = p_pricing_key;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown pricing key: %', p_pricing_key;
    END IF;

    UPDATE public.ad_pricing_config
    SET price_paise = p_price_paise, updated_by = auth.uid(), updated_at = now()
    WHERE pricing_key = p_pricing_key;

    PERFORM public.record_audit_log(
        auth.uid(), 'admin', 'ad_pricing_updated', 'ad_pricing_config', NULL,
        jsonb_build_object('pricing_key', p_pricing_key, 'price_paise', v_old),
        jsonb_build_object('pricing_key', p_pricing_key, 'price_paise', p_price_paise)
    );
    RETURN jsonb_build_object('ok', true, 'pricing_key', p_pricing_key, 'price_paise', p_price_paise);
END;
$function$;

-- ============================================================================
-- 6. create_ad_booking v2 (4 formats, server-side pricing, draft support)
--    Replaces the W4c 7-arg version — old signature dropped explicitly.
-- ============================================================================
DROP FUNCTION IF EXISTS public.create_ad_booking(UUID, TEXT, TEXT, TEXT, SMALLINT, INTEGER, UUID);

CREATE OR REPLACE FUNCTION public.create_ad_booking(
    p_store_id      UUID,
    p_placement_type TEXT,
    p_keyword       TEXT DEFAULT NULL,
    p_headline      TEXT DEFAULT NULL,
    p_days          SMALLINT DEFAULT 7,
    p_product_id    UUID DEFAULT NULL,
    p_banner_slot   SMALLINT DEFAULT NULL,
    p_planned_start TIMESTAMPTZ DEFAULT NULL,
    p_submit        BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user        UUID := auth.uid();
    v_owner       BOOLEAN;
    v_pricing_key TEXT;
    v_rate        INTEGER;
    v_paid_total  INTEGER;
    v_need_pay    BOOLEAN;
    v_status      TEXT;
    v_campaign    UUID;
    v_product_ok  BOOLEAN;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT public.is_merchant_owner_of_store(p_store_id) THEN
        RAISE EXCEPTION 'Store not owned by you';
    END IF;
    IF p_days < 1 OR p_days > 30 THEN
        RAISE EXCEPTION 'Days must be between 1 and 30';
    END IF;

    -- Asset ownership + format validation
    IF p_placement_type = 'search_keyword' THEN
        IF p_keyword IS NULL OR char_length(trim(p_keyword)) < 2 THEN
            RAISE EXCEPTION 'Keyword (2+ chars) required for search_keyword placement';
        END IF;
        IF p_product_id IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1 FROM public.store_products sp
                WHERE sp.store_id = p_store_id AND sp.product_id = p_product_id
            ) INTO v_product_ok;
            IF NOT v_product_ok THEN
                RAISE EXCEPTION 'Product does not belong to your store';
            END IF;
            v_pricing_key := 'sponsored_product_day';
        ELSE
            v_pricing_key := 'search_ad_day';
        END IF;
    ELSIF p_placement_type = 'category_banner' THEN
        v_pricing_key := 'category_banner_day';
    ELSIF p_placement_type = 'sponsored_store' THEN
        IF p_product_id IS NOT NULL OR p_keyword IS NOT NULL THEN
            RAISE EXCEPTION 'sponsored_store promotes your shop only (no product/keyword)';
        END IF;
        v_pricing_key := 'sponsored_store_day';
    ELSIF p_placement_type = 'home_banner' THEN
        IF p_banner_slot IS NULL OR p_banner_slot NOT BETWEEN 1 AND 3 THEN
            RAISE EXCEPTION 'home_banner requires banner_slot 1, 2 or 3';
        END IF;
        IF p_product_id IS NOT NULL OR p_keyword IS NOT NULL THEN
            RAISE EXCEPTION 'home_banner promotes your shop only (no product/keyword)';
        END IF;
        v_pricing_key := 'banner_slot_' || p_banner_slot::text || '_day';
    ELSE
        RAISE EXCEPTION 'Unknown placement_type: %', p_placement_type;
    END IF;

    IF p_headline IS NULL OR char_length(trim(p_headline)) < 3 OR char_length(trim(p_headline)) > 80 THEN
        RAISE EXCEPTION 'Headline must be 3-80 characters';
    END IF;

    -- Server-side pricing (client amounts are never trusted)
    SELECT price_paise, is_active INTO v_rate, v_need_pay
    FROM public.ad_pricing_config WHERE pricing_key = v_pricing_key;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pricing config missing for %', v_pricing_key;
    END IF;
    v_paid_total := v_rate * p_days::int;

    v_status := CASE WHEN p_submit THEN 'pending_review' ELSE 'draft' END;

    INSERT INTO public.ad_campaigns (
        merchant_id, store_id, placement_type, keyword, headline,
        days, budget_paise, product_id, status, banner_slot,
        planned_start, planned_end, payment_status
    ) VALUES (
        v_user, p_store_id, p_placement_type,
        CASE WHEN p_keyword IS NULL THEN NULL ELSE lower(trim(p_keyword)) END,
        trim(p_headline), p_days, v_paid_total, p_product_id, v_status,
        p_banner_slot, p_planned_start,
        CASE WHEN p_planned_start IS NULL THEN NULL ELSE p_planned_start + make_interval(days => p_days) END,
        CASE WHEN v_need_pay THEN 'pending' ELSE 'not_required' END
    )
    RETURNING id INTO v_campaign;

    -- W4c approvals-queue integration stays: submitted bookings are admin-gated.
    IF p_submit THEN
        INSERT INTO public.approvals (entity_type, entity_id, requested_by)
        VALUES ('ad', v_campaign, v_user);
    END IF;

    PERFORM public.record_audit_log(
        v_user, 'merchant', 'ad_campaign_created', 'ad_campaigns', v_campaign,
        NULL,
        jsonb_build_object(
            'placement_type', p_placement_type, 'days', p_days,
            'amount_paise', v_paid_total, 'status', v_status,
            'payment_status', CASE WHEN v_need_pay THEN 'pending' ELSE 'not_required' END
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'campaign_id', v_campaign,
        'status', v_status,
        'placement_type', p_placement_type,
        'days', p_days,
        'amount_paise', v_paid_total,
        'payment_status', CASE WHEN v_need_pay THEN 'pending' ELSE 'not_required' END,
        'review_sla', 'Admin review pending - SLA under 90 minutes'
    );
END;
$function$;

-- ============================================================================
-- 7. submit_ad_campaign (draft -> pending_review, into approvals queue)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_ad_campaign(p_campaign_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user UUID := auth.uid();
    v_row  public.ad_campaigns%ROWTYPE;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_row FROM public.ad_campaigns
    WHERE id = p_campaign_id AND merchant_id = v_user;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campaign not found or not yours';
    END IF;
    IF v_row.status <> 'draft' THEN
        RAISE EXCEPTION 'Only draft campaigns can be submitted (current: %)', v_row.status;
    END IF;

    UPDATE public.ad_campaigns SET status = 'pending_review', updated_at = now()
    WHERE id = p_campaign_id;

    INSERT INTO public.approvals (entity_type, entity_id, requested_by)
    VALUES ('ad', p_campaign_id, v_user);

    PERFORM public.record_audit_log(
        v_user, 'merchant', 'ad_campaign_submitted', 'ad_campaigns', p_campaign_id,
        jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'pending_review')
    );
    RETURN jsonb_build_object('ok', true, 'status', 'pending_review');
END;
$function$;

-- ============================================================================
-- 8. review_ad_booking v2 (payment-aware approve; reject path unchanged)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.review_ad_booking(
    p_campaign_id UUID,
    p_approve     BOOLEAN,
    p_note        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_row public.ad_campaigns%ROWTYPE;
    v_new TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    SELECT * INTO v_row FROM public.ad_campaigns WHERE id = p_campaign_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campaign not found';
    END IF;
    IF v_row.status NOT IN ('pending_review', 'approved') THEN
        RAISE EXCEPTION 'Campaign not in reviewable state: %', v_row.status;
    END IF;

    IF NOT p_approve THEN
        UPDATE public.ad_campaigns
        SET status = 'rejected', rejection_note = p_note, updated_at = now()
        WHERE id = p_campaign_id;
        UPDATE public.approvals
        SET status = 'rejected', decided_by = auth.uid(), decided_at = now(),
            note = p_note
        WHERE entity_type = 'ad' AND entity_id = p_campaign_id AND status = 'pending';
        PERFORM public.record_audit_log(
            auth.uid(), 'admin', 'ad_campaign_rejected', 'ad_campaigns', p_campaign_id,
            jsonb_build_object('status', v_row.status),
            jsonb_build_object('note', p_note)
        );
        RETURN jsonb_build_object('ok', true, 'status', 'rejected');
    END IF;

    -- Approved but payment pending -> hold at 'approved' until webhook verifies.
    IF v_row.payment_status = 'pending' THEN
        v_new := 'approved';
        UPDATE public.ad_campaigns
        SET status = 'approved', updated_at = now()
        WHERE id = p_campaign_id;
    -- Planned future start -> 'scheduled' (scheduler flips to active).
    ELSIF v_row.planned_start IS NOT NULL AND v_row.planned_start > now() THEN
        v_new := 'scheduled';
        UPDATE public.ad_campaigns
        SET status = 'scheduled',
            starts_at = v_row.planned_start,
            ends_at = v_row.planned_start + make_interval(days => v_row.days),
            updated_at = now()
        WHERE id = p_campaign_id;
    ELSE
        v_new := 'active';
        UPDATE public.ad_campaigns
        SET status = 'active',
            starts_at = now(),
            ends_at = now() + make_interval(days => v_row.days),
            updated_at = now()
        WHERE id = p_campaign_id;
    END IF;

    UPDATE public.approvals
    SET status = 'approved', decided_by = auth.uid(), decided_at = now()
    WHERE entity_type = 'ad' AND entity_id = p_campaign_id AND status = 'pending';

    PERFORM public.record_audit_log(
        auth.uid(), 'admin', 'ad_campaign_approved', 'ad_campaigns', p_campaign_id,
        jsonb_build_object('status', v_row.status),
        jsonb_build_object('status', v_new, 'payment_status', v_row.payment_status)
    );
    RETURN jsonb_build_object('ok', true, 'status', v_new);
END;
$function$;

-- ============================================================================
-- 9. set_ad_campaign_status — admin pause/resume/cancel/complete (+auto OOB)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_ad_campaign_status(
    p_campaign_id UUID,
    p_status      TEXT,
    p_note        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_row public.ad_campaigns%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    IF p_status NOT IN ('active', 'paused', 'cancelled', 'completed', 'rejected', 'out_of_budget') THEN
        RAISE EXCEPTION 'Status not admin-settable: %', p_status;
    END IF;

    SELECT * INTO v_row FROM public.ad_campaigns WHERE id = p_campaign_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campaign not found';
    END IF;

    UPDATE public.ad_campaigns
    SET status = p_status,
        rejection_note = p_note,
        updated_at = now()
    WHERE id = p_campaign_id;

    PERFORM public.record_audit_log(
        auth.uid(), 'admin', 'ad_campaign_status_set', 'ad_campaigns', p_campaign_id,
        jsonb_build_object('status', v_row.status),
        jsonb_build_object('status', p_status, 'note', p_note)
    );
    RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$function$;

-- ============================================================================
-- 10. SERVING ENGINE — sponsored stores + home banners (+ W4c search kept)
--     Filter active + paid/not_required + in-date + store live -> rank recent -> LIMIT.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_sponsored_stores(p_zone_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'campaign_id', c.id,
        'headline', c.headline,
        'store_id', s.id,
        'store_name', s.name,
        'prep_time_minutes', s.prep_time_minutes
    ) ORDER BY c.created_at DESC), '[]'::JSONB)
    FROM (
        SELECT * FROM public.ad_campaigns
        WHERE placement_type = 'sponsored_store'
          AND status = 'active'
          AND payment_status IN ('paid', 'not_required')
          AND now() BETWEEN starts_at AND ends_at
        ORDER BY created_at DESC
        LIMIT 3
    ) c
    JOIN public.stores s ON s.id = c.store_id
    WHERE s.is_active AND s.is_open
      AND (p_zone_id IS NULL OR s.service_zone_id = p_zone_id);
$function$;

CREATE OR REPLACE FUNCTION public.get_home_banner_ads(p_slot SMALLINT DEFAULT NULL, p_zone_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'campaign_id', c.id,
        'headline', c.headline,
        'banner_slot', c.banner_slot,
        'store_id', s.id,
        'store_name', s.name,
        'store_city', s.city
    ) ORDER BY c.banner_slot, c.created_at DESC), '[]'::JSONB)
    FROM (
        SELECT * FROM public.ad_campaigns
        WHERE placement_type = 'home_banner'
          AND status = 'active'
          AND payment_status IN ('paid', 'not_required')
          AND now() BETWEEN starts_at AND ends_at
          AND (p_slot IS NULL OR banner_slot = p_slot)
        ORDER BY banner_slot, created_at DESC
        LIMIT 3
    ) c
    JOIN public.stores s ON s.id = c.store_id
    WHERE s.is_active AND s.is_open
      AND (p_zone_id IS NULL OR s.service_zone_id = p_zone_id);
$function$;

-- W4c get_sponsored_search upgraded: payment-aware serving filter.
CREATE OR REPLACE FUNCTION public.get_sponsored_search(p_query TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'campaign_id', c.id,
        'headline', c.headline,
        'store_id', s.id,
        'store_name', s.name,
        'product_id', p.id,
        'product_name', p.name,
        'unit_label', p.unit_label,
        'image_url', p.image_url,
        'mrp_paise', sp.mrp_paise,
        'selling_price_paise', sp.selling_price_paise,
        'available_to_sell', i.available_to_sell
    ) ORDER BY c.created_at DESC), '[]'::JSONB)
    FROM (
        SELECT * FROM public.ad_campaigns
        WHERE placement_type = 'search_keyword'
          AND status = 'active'
          AND payment_status IN ('paid', 'not_required')
          AND now() BETWEEN starts_at AND ends_at
          AND keyword ILIKE '%' || trim(p_query) || '%'
        ORDER BY created_at DESC
        LIMIT 2
    ) c
    JOIN public.stores s ON s.id = c.store_id AND s.is_active AND s.is_open
    JOIN public.store_products sp ON sp.store_id = s.id AND sp.product_id = c.product_id
    JOIN public.products p ON p.id = sp.product_id AND p.is_active
    JOIN public.inventory i ON i.store_product_id = sp.id AND i.available_to_sell > 0;
$function$;

-- ============================================================================
-- 11. record_ad_event v2 — serving-guarded + deduped counting
-- ============================================================================
DROP FUNCTION IF EXISTS public.record_ad_event(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.record_ad_event(
    p_campaign_id UUID,
    p_event_type  TEXT,
    p_viewer_key  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user     UUID := auth.uid();
    v_serving  BOOLEAN;
    v_event_id UUID;
    v_counted  BOOLEAN := false;
    v_bucket   TIMESTAMPTZ := to_timestamp(floor(extract(epoch FROM now()) / 600) * 600);
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF p_event_type NOT IN ('impression', 'click') THEN
        RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
    END IF;
    IF NOT public.check_rate_limit('ad_event:' || v_user::text, 120, 60) THEN
        RAISE EXCEPTION 'Too many ad events - slow down';
    END IF;

    -- Serving guard: only count events for campaigns actually serving right now.
    SELECT true INTO v_serving
    FROM public.ad_campaigns
    WHERE id = p_campaign_id
      AND status = 'active'
      AND payment_status IN ('paid', 'not_required')
      AND now() BETWEEN starts_at AND ends_at;
    IF v_serving IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'campaign_not_serving', 'counted', false);
    END IF;

    -- Dedup insert: UNIQUE(campaign, type, viewer, 10-min bucket)
    INSERT INTO public.ad_events (campaign_id, event_type, viewer_key, bucket_start)
    VALUES (
        p_campaign_id, p_event_type,
        COALESCE(substr(replace(p_viewer_key, E'\n', ''), 1, 64), 'user:' || v_user::text),
        v_bucket
    )
    ON CONFLICT (campaign_id, event_type, viewer_key, bucket_start) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NOT NULL THEN
        v_counted := true;
        UPDATE public.ad_campaigns
        SET impressions = impressions + (CASE WHEN p_event_type = 'impression' THEN 1 ELSE 0 END),
            clicks = clicks + (CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END),
            updated_at = now()
        WHERE id = p_campaign_id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'counted', v_counted);
END;
$function$;

-- ============================================================================
-- 12. PAYMENTS — server-priced order RPC + webhook-verified activation
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_ad_campaign_order(p_campaign_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user  UUID := auth.uid();
    v_row   public.ad_campaigns%ROWTYPE;
    v_rate  INTEGER;
    v_total INTEGER;
    v_tx    UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_row FROM public.ad_campaigns
    WHERE id = p_campaign_id AND merchant_id = v_user;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campaign not found or not yours';
    END IF;
    IF v_row.payment_status <> 'pending' THEN
        RAISE EXCEPTION 'Campaign payment not pending (current: %)', v_row.payment_status;
    END IF;
    IF v_row.status NOT IN ('draft', 'pending_review', 'approved', 'scheduled') THEN
        RAISE EXCEPTION 'Campaign not payable in current status: %', v_row.status;
    END IF;

    -- Amount recomputed from pricing config (never client-passed)
    SELECT price_paise INTO v_rate FROM public.ad_pricing_config
    WHERE pricing_key = CASE
        WHEN v_row.placement_type = 'home_banner'
            THEN 'banner_slot_' || v_row.banner_slot::text || '_day'
        WHEN v_row.placement_type = 'search_keyword' AND v_row.product_id IS NOT NULL
            THEN 'sponsored_product_day'
        WHEN v_row.placement_type = 'search_keyword'
            THEN 'search_ad_day'
        ELSE v_row.placement_type || '_day'
    END;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pricing config missing for this placement';
    END IF;
    v_total := v_rate * v_row.days::int;

    INSERT INTO public.ad_transactions (campaign_id, amount_paise, status)
    VALUES (p_campaign_id, v_total, 'created')
    RETURNING id INTO v_tx;

    PERFORM public.record_audit_log(
        v_user, 'merchant', 'ad_payment_order_created', 'ad_transactions', v_tx,
        NULL, jsonb_build_object('campaign_id', p_campaign_id, 'amount_paise', v_total)
    );

    RETURN jsonb_build_object(
        'ok', true,
        'transaction_id', v_tx,
        'amount_paise', v_total,
        'currency', 'INR',
        'receipt', 'AD-' || substr(v_tx::text, 1, 8)
    );
END;
$function$;

-- Webhook-only activation (service_role grant; exact-amount verify; idempotent).
CREATE OR REPLACE FUNCTION public.activate_ad_campaign_payment(
    p_transaction_id UUID,
    p_rzp_order_id   TEXT,
    p_rzp_payment_id TEXT,
    p_amount_paise   INTEGER,
    p_paid           BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_tx    public.ad_transactions%ROWTYPE;
    v_new   TEXT;
BEGIN
    SELECT * INTO v_tx FROM public.ad_transactions WHERE id = p_transaction_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found';
    END IF;

    -- Idempotent: already paid -> report deduplicated.
    IF v_tx.status = 'paid' THEN
        RETURN jsonb_build_object('ok', true, 'deduplicated', true);
    END IF;

    IF NOT p_paid THEN
        UPDATE public.ad_transactions SET status = 'failed' WHERE id = p_transaction_id;
        RETURN jsonb_build_object('ok', true, 'status', 'failed');
    END IF;

    IF v_tx.rzp_order_id IS NOT NULL AND v_tx.rzp_order_id <> p_rzp_order_id THEN
        RAISE EXCEPTION 'Order id mismatch';
    END IF;
    IF p_amount_paise <> v_tx.amount_paise THEN
        RAISE EXCEPTION 'Amount mismatch: expected %, got %', v_tx.amount_paise, p_amount_paise;
    END IF;

    UPDATE public.ad_transactions
    SET status = 'paid', rzp_order_id = p_rzp_order_id,
        rzp_payment_id = p_rzp_payment_id, paid_at = now()
    WHERE id = p_transaction_id;

    -- Campaign: approved-waiting-payment -> scheduled/active (planned start aware)
    SELECT planned_start, days INTO v_new FROM public.ad_campaigns WHERE id = v_tx.campaign_id;
    UPDATE public.ad_campaigns
    SET payment_status = 'paid', updated_at = now()
    WHERE id = v_tx.campaign_id AND payment_status = 'pending';

    UPDATE public.ad_campaigns
    SET status = CASE
            WHEN planned_start IS NOT NULL AND planned_start > now() THEN 'scheduled'
            ELSE 'active'
        END,
        starts_at = CASE
            WHEN planned_start IS NULL THEN now() ELSE starts_at
        END,
        ends_at = CASE
            WHEN planned_start IS NULL
                THEN now() + make_interval(days => days) ELSE ends_at
        END,
        updated_at = now()
    WHERE id = v_tx.campaign_id AND status = 'approved';

    PERFORM public.record_audit_log(
        NULL, 'system', 'ad_payment_verified', 'ad_transactions', p_transaction_id,
        jsonb_build_object('status', 'created'),
        jsonb_build_object('rzp_order_id', p_rzp_order_id, 'rzp_payment_id', p_rzp_payment_id, 'amount_paise', p_amount_paise)
    );

    RETURN jsonb_build_object('ok', true, 'deduplicated', false);
END;
$function$;

-- Merchant payment history
CREATE OR REPLACE FUNCTION public.my_ad_transactions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', t.id,
            'campaign_id', t.campaign_id,
            'headline', c.headline,
            'status', t.status,
            'amount_paise', t.amount_paise,
            'rzp_order_id', t.rzp_order_id,
            'rzp_payment_id', t.rzp_payment_id,
            'paid_at', t.paid_at,
            'created_at', t.created_at
        ) ORDER BY t.created_at DESC)
        FROM public.ad_transactions t
        JOIN public.ad_campaigns c ON c.id = t.campaign_id
        WHERE c.merchant_id = v_user
    ), '[]'::JSONB);
END;
$function$;

-- ============================================================================
-- 13. SCHEDULER — scheduled->active / active->completed flips (pg_cron, 5 min)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.zaff_ads_schedule_sweep()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_activated INT;
    v_completed INT;
BEGIN
    UPDATE public.ad_campaigns
    SET status = 'active', updated_at = now()
    WHERE status = 'scheduled' AND starts_at IS NOT NULL AND starts_at <= now();
    GET DIAGNOSTICS v_activated = ROW_COUNT;

    UPDATE public.ad_campaigns
    SET status = 'completed', updated_at = now()
    WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at < now();
    GET DIAGNOSTICS v_completed = ROW_COUNT;

    RETURN v_activated + v_completed;
END;
$function$;

-- ============================================================================
-- 14. GRANTS
-- ============================================================================
REVOKE ALL ON public.ad_pricing_config FROM anon, authenticated;
GRANT SELECT ON public.ad_pricing_config TO authenticated;
REVOKE ALL ON public.ad_transactions FROM anon, authenticated;
GRANT SELECT ON public.ad_transactions TO authenticated;   -- own rows via RLS (+admin)
REVOKE ALL ON public.ad_events FROM anon, authenticated;
GRANT SELECT ON public.ad_events TO authenticated;         -- admin-only via RLS

REVOKE ALL ON FUNCTION public.get_ad_pricing() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_ad_pricing() TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_ad_pricing(TEXT, INTEGER) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_ad_pricing(TEXT, INTEGER) TO authenticated;  -- admin-guarded inside
REVOKE ALL ON FUNCTION public.create_ad_booking(UUID, TEXT, TEXT, TEXT, SMALLINT, UUID, SMALLINT, TIMESTAMPTZ, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_ad_booking(UUID, TEXT, TEXT, TEXT, SMALLINT, UUID, SMALLINT, TIMESTAMPTZ, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_ad_campaign(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_ad_campaign(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.review_ad_booking(UUID, BOOLEAN, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_ad_booking(UUID, BOOLEAN, TEXT) TO authenticated;  -- admin-guarded inside
REVOKE ALL ON FUNCTION public.set_ad_campaign_status(UUID, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ad_campaign_status(UUID, TEXT, TEXT) TO authenticated;  -- admin-guarded inside
REVOKE ALL ON FUNCTION public.get_sponsored_stores(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_sponsored_stores(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_home_banner_ads(SMALLINT, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_home_banner_ads(SMALLINT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_sponsored_search(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_sponsored_search(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.record_ad_event(UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_ad_event(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.create_ad_campaign_order(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_ad_campaign_order(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.activate_ad_campaign_payment(UUID, TEXT, TEXT, INTEGER, BOOLEAN)
    FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_ad_campaign_payment(UUID, TEXT, TEXT, INTEGER, BOOLEAN)
    TO service_role;
REVOKE ALL ON FUNCTION public.my_ad_transactions() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_ad_transactions() TO authenticated;
REVOKE ALL ON FUNCTION public.zaff_ads_schedule_sweep() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zaff_ads_schedule_sweep() TO service_role;
