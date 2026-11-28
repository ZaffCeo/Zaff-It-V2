-- 031 — W-Seller: seller settlement engine (doc: flat ₹5-10/order seller fee,
-- UTR ledger, 8-10AM settlement window).
-- Builds on the EXISTING settlement_ledger (order_credit rows: gross/commission/net,
-- reconcile_settlements already validates net+commission=gross) — no new duplicate ledger.
-- Money math: seller earns order product subtotal minus the flat fee; delivery/handling/
-- wallet-discount are platform-side and never enter the seller's gross.

-- ============================================================================
-- 1. ops_seller_fee_config — single-row, admin-controlled, doc-range guarded
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ops_seller_fee_config (
    singleton           BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
    seller_fee_paise    INTEGER NOT NULL CHECK (seller_fee_paise BETWEEN 500 AND 1000), -- doc: ₹5-10 flat
    window_start_hour   SMALLINT NOT NULL DEFAULT 8,
    window_end_hour     SMALLINT NOT NULL DEFAULT 10,
    updated_by          UUID REFERENCES auth.users(id),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ops_seller_fee_config (singleton, seller_fee_paise, window_start_hour, window_end_hour)
VALUES (true, 700, 8, 10)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.ops_seller_fee_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_seller_fee_config' AND policyname = 'seller_fee_config_read_auth') THEN
        CREATE POLICY seller_fee_config_read_auth ON public.ops_seller_fee_config
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
-- Writes only via admin RPC below.

-- ============================================================================
-- 2. seller_settlements — payout batches grouped per store
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.seller_settlements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id       UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    merchant_id    UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
    order_count    INTEGER NOT NULL CHECK (order_count > 0),
    gross_paise    INTEGER NOT NULL CHECK (gross_paise > 0),
    commission_paise INTEGER NOT NULL CHECK (commission_paise >= 0),
    net_paise      INTEGER NOT NULL CHECK (net_paise > 0),
    period_start   TIMESTAMPTZ NOT NULL,
    period_end     TIMESTAMPTZ NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled')),
    utr            TEXT UNIQUE,
    settled_at     TIMESTAMPTZ,
    settled_by     UUID REFERENCES auth.users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT seller_settlement_period CHECK (period_end >= period_start),
    CONSTRAINT seller_settlement_utr_format CHECK (utr IS NULL OR utr ~ '^[A-Za-z0-9]{6,40}$')
);

CREATE INDEX IF NOT EXISTS idx_seller_settlements_store ON public.seller_settlements (store_id, status, created_at DESC);

ALTER TABLE public.seller_settlements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'seller_settlements' AND policyname = 'seller_settlements_select_own_or_admin') THEN
        CREATE POLICY seller_settlements_select_own_or_admin ON public.seller_settlements
            FOR SELECT TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.stores s
                    JOIN public.merchants m ON m.id = s.merchant_id
                    WHERE s.id = store_id AND m.owner_user_id = auth.uid()
                )
                OR public.is_admin()
            );
    END IF;
END $$;
-- No write policies: batching + settlement via SECURITY DEFINER RPCs only.

-- Link ledger rows to their batch (non-destructive column add).
ALTER TABLE public.settlement_ledger
    ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES public.seller_settlements(id);

-- ============================================================================
-- 3. Accrual trigger — delivered order earns exactly one order_credit row
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_seller_earnings_on_delivered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_fee     INTEGER;
    v_store   RECORD;
BEGIN
    IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
        -- Idempotent: never double-credit an order.
        IF EXISTS (SELECT 1 FROM public.settlement_ledger WHERE order_id = NEW.id AND entry_type = 'order_credit') THEN
            RETURN NULL;
        END IF;

        SELECT seller_fee_paise INTO v_fee FROM public.ops_seller_fee_config WHERE singleton = true;

        SELECT s.id AS store_id, s.merchant_id AS merchant_id
        INTO v_store
        FROM public.stores s
        WHERE s.id = NEW.store_id;

        INSERT INTO public.settlement_ledger (
            merchant_id, store_id, order_id, entry_type,
            gross_amount_paise, commission_paise, net_amount_paise, status
        ) VALUES (
            v_store.merchant_id, v_store.store_id, NEW.id, 'order_credit',
            NEW.subtotal_paise, v_fee, NEW.subtotal_paise - v_fee, 'pending'
        );
    END IF;
    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seller_earnings ON public.orders;
CREATE TRIGGER trg_seller_earnings
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_seller_earnings_on_delivered();

-- Backfill: delivered orders that pre-date the trigger (honest reconcile target).
INSERT INTO public.settlement_ledger (
    merchant_id, store_id, order_id, entry_type,
    gross_amount_paise, commission_paise, net_amount_paise, status
)
SELECT s.merchant_id, o.store_id, o.id, 'order_credit',
       o.subtotal_paise, c.seller_fee_paise, o.subtotal_paise - c.seller_fee_paise, 'pending'
FROM public.orders o
JOIN public.stores s ON s.id = o.store_id
CROSS JOIN public.ops_seller_fee_config c
WHERE o.status = 'delivered'
  AND NOT EXISTS (
    SELECT 1 FROM public.settlement_ledger sl
    WHERE sl.order_id = o.id AND sl.entry_type = 'order_credit'
  );

-- ============================================================================
-- 4. Admin config RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_seller_fee_config(
    p_fee_paise    INTEGER,
    p_window_start SMALLINT DEFAULT NULL,
    p_window_end   SMALLINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_old INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    IF p_fee_paise IS NULL OR p_fee_paise < 500 OR p_fee_paise > 1000 THEN
        RAISE EXCEPTION 'Seller fee must be Rs5-Rs10 per order (doc range)';
    END IF;

    SELECT seller_fee_paise INTO v_old FROM public.ops_seller_fee_config WHERE singleton = true;

    UPDATE public.ops_seller_fee_config
    SET seller_fee_paise = p_fee_paise,
        window_start_hour = COALESCE(p_window_start, window_start_hour),
        window_end_hour = COALESCE(p_window_end, window_end_hour),
        updated_by = auth.uid(),
        updated_at = now()
    WHERE singleton = true;

    PERFORM public.record_audit_log(
        auth.uid(), 'admin', 'seller_fee_config_updated', 'ops_seller_fee_config', NULL,
        jsonb_build_object('fee_paise', v_old),
        jsonb_build_object('fee_paise', p_fee_paise, 'window', COALESCE(p_window_start, 8) || '-' || COALESCE(p_window_end, 10))
    );
    RETURN jsonb_build_object('ok', true, 'seller_fee_paise', p_fee_paise);
END;
$function$;

-- ============================================================================
-- 5. build_seller_settlements — batch pending order_credit rows per store
--    (admin OR pg_cron service context; idempotent via settlement_id link)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.build_seller_settlements()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_batches   INT := 0;
    v_row       RECORD;
    v_settlement UUID;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    FOR v_row IN
        SELECT store_id, merchant_id,
               count(*) AS order_count,
               sum(gross_amount_paise) AS gross,
               sum(commission_paise) AS commission,
               sum(net_amount_paise) AS net,
               min(created_at) AS period_start,
               max(created_at) AS period_end
        FROM public.settlement_ledger
        WHERE entry_type = 'order_credit'
          AND status = 'pending'
          AND settlement_id IS NULL
        GROUP BY store_id, merchant_id
    LOOP
        INSERT INTO public.seller_settlements (
            store_id, merchant_id, order_count, gross_paise, commission_paise,
            net_paise, period_start, period_end, status
        ) VALUES (
            v_row.store_id, v_row.merchant_id, v_row.order_count, v_row.gross,
            v_row.commission, v_row.net, v_row.period_start, v_row.period_end, 'pending'
        )
        RETURNING id INTO v_settlement;

        UPDATE public.settlement_ledger
        SET settlement_id = v_settlement
        WHERE entry_type = 'order_credit' AND status = 'pending'
          AND settlement_id IS NULL
          AND store_id = v_row.store_id;

        v_batches := v_batches + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'batches_created', v_batches);
END;
$function$;

-- ============================================================================
-- 6. settle_seller_batch — admin records bank UTR (8-10AM IST window, override
--    escape hatch audited); syncs ledger rows to settled + payout_reference
-- ============================================================================
CREATE OR REPLACE FUNCTION public.settle_seller_batch(
    p_settlement_id UUID,
    p_utr           TEXT,
    p_override      BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_row       public.seller_settlements%ROWTYPE;
    v_ist_hour  SMALLINT := (extract(hour FROM (now() AT TIME ZONE 'Asia/Kolkata')))::smallint;
    v_cfg       RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    IF p_utr IS NULL OR p_utr !~ '^[A-Za-z0-9]{6,40}$' THEN
        RAISE EXCEPTION 'UTR must be 6-40 alphanumeric characters';
    END IF;

    SELECT * INTO v_row FROM public.seller_settlements WHERE id = p_settlement_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement not found';
    END IF;
    IF v_row.status = 'settled' THEN
        RETURN jsonb_build_object('ok', true, 'deduplicated', true, 'utr', v_row.utr);
    END IF;
    -- Replay of the same batch with its own UTR is the dedup path (above);
    -- a *different* settlement reusing this UTR is a hard error.
    IF EXISTS (SELECT 1 FROM public.seller_settlements WHERE utr = p_utr AND id <> p_settlement_id) THEN
        RAISE EXCEPTION 'UTR already used by another settlement';
    END IF;

    SELECT window_start_hour, window_end_hour INTO v_cfg FROM public.ops_seller_fee_config WHERE singleton = true;
    IF NOT p_override AND (v_ist_hour < v_cfg.window_start_hour OR v_ist_hour >= v_cfg.window_end_hour) THEN
        RAISE EXCEPTION 'Outside settlement window (%:00-%:00 IST) - pass p_override=true to force (audited)',
            v_cfg.window_start_hour, v_cfg.window_end_hour;
    END IF;

    UPDATE public.seller_settlements
    SET status = 'settled', utr = p_utr, settled_at = now(), settled_by = auth.uid()
    WHERE id = p_settlement_id;

    UPDATE public.settlement_ledger
    SET status = 'settled', payout_reference = p_utr, settled_at = now()
    WHERE settlement_id = p_settlement_id AND status = 'pending';

    PERFORM public.record_audit_log(
        auth.uid(), 'admin', 'seller_batch_settled', 'seller_settlements', p_settlement_id,
        jsonb_build_object('status', 'pending'),
        jsonb_build_object('utr', p_utr, 'net_paise', v_row.net_paise, 'window_override', p_override)
    );

    RETURN jsonb_build_object('ok', true, 'status', 'settled', 'utr', p_utr, 'net_paise', v_row.net_paise);
END;
$function$;

-- ============================================================================
-- 7. my_seller_settlements — merchant summary (earnings / pending / settled)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.my_seller_settlements()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user UUID := auth.uid();
    v_pending_unbatched INTEGER;
    v_pending_batched   INTEGER;
    v_settled_total     INTEGER;
    v_fee               INTEGER;
    v_batches           JSONB;
    v_recent            JSONB;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT seller_fee_paise INTO v_fee FROM public.ops_seller_fee_config WHERE singleton = true;

    SELECT COALESCE(sum(sl.net_amount_paise), 0) INTO v_pending_unbatched
    FROM public.settlement_ledger sl
    JOIN public.merchants m ON m.id = sl.merchant_id
    WHERE m.owner_user_id = v_user
      AND sl.entry_type = 'order_credit' AND sl.status = 'pending' AND sl.settlement_id IS NULL;

    SELECT COALESCE(sum(ss.net_paise), 0) INTO v_pending_batched
    FROM public.seller_settlements ss
    JOIN public.merchants m ON m.id = ss.merchant_id
    WHERE m.owner_user_id = v_user AND ss.status = 'pending';

    SELECT COALESCE(sum(ss.net_paise), 0) INTO v_settled_total
    FROM public.seller_settlements ss
    JOIN public.merchants m ON m.id = ss.merchant_id
    WHERE m.owner_user_id = v_user AND ss.status = 'settled';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', ss.id, 'store_id', ss.store_id, 'order_count', ss.order_count,
        'gross_paise', ss.gross_paise, 'commission_paise', ss.commission_paise,
        'net_paise', ss.net_paise, 'status', ss.status, 'utr', ss.utr,
        'period_start', ss.period_start, 'period_end', ss.period_end,
        'settled_at', ss.settled_at, 'created_at', ss.created_at
    ) ORDER BY ss.created_at DESC), '[]'::JSONB)
    INTO v_batches
    FROM public.seller_settlements ss
    JOIN public.merchants m ON m.id = ss.merchant_id
    WHERE m.owner_user_id = v_user;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', sl.id, 'order_id', sl.order_id, 'entry_type', sl.entry_type,
        'gross_paise', sl.gross_amount_paise, 'commission_paise', sl.commission_paise,
        'net_paise', sl.net_amount_paise, 'status', sl.status,
        'payout_reference', sl.payout_reference, 'created_at', sl.created_at
    ) ORDER BY sl.created_at DESC), '[]'::JSONB)
    INTO v_recent
    FROM public.settlement_ledger sl
    JOIN public.merchants m ON m.id = sl.merchant_id
    WHERE m.owner_user_id = v_user AND sl.entry_type = 'order_credit';

    RETURN jsonb_build_object(
        'fee_paise', v_fee,
        'pending_unbatched_paise', v_pending_unbatched,
        'pending_batched_paise', v_pending_batched,
        'settled_total_paise', v_settled_total,
        'settlements', v_batches,
        'recent_earnings', v_recent
    );
END;
$function$;

-- ============================================================================
-- 8. GRANTS + cron (08:10 IST daily batching)
-- ============================================================================
REVOKE ALL ON public.ops_seller_fee_config FROM anon;
GRANT SELECT ON public.ops_seller_fee_config TO authenticated;
REVOKE ALL ON public.seller_settlements FROM anon, authenticated;
GRANT SELECT ON public.seller_settlements TO authenticated;  -- own-or-admin via RLS

REVOKE ALL ON FUNCTION public.set_seller_fee_config(INTEGER, SMALLINT, SMALLINT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_seller_fee_config(INTEGER, SMALLINT, SMALLINT) TO authenticated;
REVOKE ALL ON FUNCTION public.build_seller_settlements() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_seller_settlements() TO authenticated;
REVOKE ALL ON FUNCTION public.settle_seller_batch(UUID, TEXT, BOOLEAN) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_seller_batch(UUID, TEXT, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.my_seller_settlements() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_seller_settlements() TO authenticated;

SELECT cron.schedule('zaff-seller-settlement-batch', '40 2 * * *', 'SELECT public.build_seller_settlements()') AS job_id;
