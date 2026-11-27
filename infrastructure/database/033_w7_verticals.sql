-- =============================================================================
-- 033_w7_verticals.sql — Wave 7: Verticals (Medicine fee / Laundry / Service Providers)
-- Zaff-It V2 · branch arena/565f9ef2-zaff-it-v2 · 2026-11-28
-- =============================================================================
-- APPLIED LIVE via Supabase SQL editor in 8 batches (all PASS, see
-- docs/database-migrations.md row 033). This file is the as-applied record.
--
-- Scope (honest):
--   * user_roles role widen: + 'service_provider'
--   * ops_vertical_config: grocery ₹0, medicine ₹69 day / ₹99 night (22:00–06:00 IST),
--     laundry ₹15/kg (per-unit pricing)
--   * resolve_vertical_delivery_fee() + admin set_vertical_config()
--   * orders.vertical_key hook (default 'grocery') for checkout v5 integration
--   * laundry_orders table + create/cancel (customer), set status + final-weight
--     reprice (admin), my_laundry_orders
--   * service_requests + service_quotes (provider quotes, owner-only accept,
--     auto-decline other open quotes), my_service_requests / open_service_requests
--
-- NOT in this migration (founder-blocked / deferred, documented in W7 report):
--   * medicine CHECKOUT integration (prescription upload, R2 + OCR) — checkout v5
--   * service payment escrow — escrow = contract-accept only; payment deferred
--   * laundry/service rider dispatch + payment capture
--
-- ROLLBACK (run in reverse order; keep vertical_key column — it is additive):
--   REVOKE EXECUTE ON ALL 11 fns ...; DROP FUNCTION each (see bottom list);
--   DROP TABLE public.service_quotes; DROP TABLE public.service_requests;
--   DROP TABLE public.laundry_orders;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS vertical_key;
--   DROP TABLE public.ops_vertical_config;
--   -- role widen revert ONLY if no service_provider rows exist:
--   -- DELETE FROM user_roles WHERE role='service_provider' THEN rebuild old CHECK
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Widen user_roles_role_check (+ service_provider)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
    CHECK (role = ANY (ARRAY['customer'::text, 'merchant'::text, 'rider'::text,
                             'admin'::text, 'service_provider'::text]));

-- ---------------------------------------------------------------------------
-- 2. ops_vertical_config + seed (medicine day 6900 / night 9900, laundry 1500/kg)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ops_vertical_config (
    vertical_key        TEXT PRIMARY KEY,
    display_name        TEXT NOT NULL,
    delivery_fee_paise  INTEGER NOT NULL CHECK (delivery_fee_paise >= 0),
    per_unit_paise      INTEGER NOT NULL DEFAULT 0 CHECK (per_unit_paise >= 0),
    unit_label          TEXT NOT NULL DEFAULT '',
    is_enabled          BOOLEAN NOT NULL DEFAULT true,
    updated_by          UUID REFERENCES auth.users(id),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ops_vertical_config (vertical_key, display_name, delivery_fee_paise, per_unit_paise, unit_label, is_enabled)
VALUES
    ('grocery',        'Grocery',        0,    0,    '',       true),
    ('medicine',       'Medicine',       6900, 0,    '',       true),
    ('medicine_night', 'Medicine Night', 9900, 0,    '',       true),
    ('laundry',        'Laundry',        0,    1500, 'per kg', true)
ON CONFLICT (vertical_key) DO NOTHING;

ALTER TABLE public.ops_vertical_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                   AND tablename = 'ops_vertical_config'
                   AND policyname = 'vertical_config_read_auth') THEN
        CREATE POLICY vertical_config_read_auth ON public.ops_vertical_config
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Fee resolution — NIGHT WINDOW 22:00–05:59 IST (>=22 OR <6, both halves!)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_vertical_delivery_fee(p_vertical_key TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT CASE
        WHEN p_vertical_key = 'medicine'
             AND (extract(hour FROM (now() AT TIME ZONE 'Asia/Kolkata')) >= 22
                  OR extract(hour FROM (now() AT TIME ZONE 'Asia/Kolkata')) < 6)
          THEN (SELECT delivery_fee_paise FROM public.ops_vertical_config
                WHERE vertical_key = 'medicine_night')
        WHEN p_vertical_key = 'medicine'
          THEN (SELECT delivery_fee_paise FROM public.ops_vertical_config
                WHERE vertical_key = 'medicine')
        ELSE (SELECT delivery_fee_paise FROM public.ops_vertical_config
              WHERE vertical_key = p_vertical_key)
    END;
$function$;

CREATE OR REPLACE FUNCTION public.set_vertical_config(
    p_vertical_key       TEXT,
    p_delivery_fee_paise INTEGER DEFAULT NULL,
    p_per_unit_paise     INTEGER DEFAULT NULL,
    p_is_enabled         BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_old JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    SELECT to_jsonb(c) INTO v_old
    FROM public.ops_vertical_config c
    WHERE c.vertical_key = p_vertical_key;
    IF v_old IS NULL THEN
        RAISE EXCEPTION 'Unknown vertical: %', p_vertical_key;
    END IF;

    UPDATE public.ops_vertical_config
    SET delivery_fee_paise = COALESCE(p_delivery_fee_paise, delivery_fee_paise),
        per_unit_paise     = COALESCE(p_per_unit_paise, per_unit_paise),
        is_enabled         = COALESCE(p_is_enabled, is_enabled),
        updated_by         = auth.uid(),
        updated_at         = now()
    WHERE vertical_key = p_vertical_key;

    PERFORM public.record_audit_log(
        auth.uid(), 'admin', 'vertical_config_updated', 'ops_vertical_config', NULL,
        v_old,
        jsonb_build_object('vertical_key', p_vertical_key,
                           'delivery_fee_paise', p_delivery_fee_paise,
                           'per_unit_paise', p_per_unit_paise,
                           'is_enabled', p_is_enabled)
    );
    RETURN jsonb_build_object('ok', true, 'vertical_key', p_vertical_key);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. orders.vertical_key hook (additive; checkout v5 will read/resolve it)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vertical_key TEXT NOT NULL DEFAULT 'grocery';

-- ---------------------------------------------------------------------------
-- 5. laundry_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.laundry_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    service_zone_id UUID NOT NULL REFERENCES public.service_zones(id) ON DELETE RESTRICT,
    address_id      UUID REFERENCES public.addresses(id),
    pickup_slot     TEXT NOT NULL DEFAULT 'today_evening',
    weight_kg       NUMERIC(5,2) NOT NULL CHECK (weight_kg > 0 AND weight_kg <= 50),
    price_paise     INTEGER NOT NULL CHECK (price_paise > 0),
    status          TEXT NOT NULL DEFAULT 'pending_pickup'
                    CHECK (status IN ('pending_pickup', 'picked_up', 'in_wash',
                                      'out_for_delivery', 'delivered', 'cancelled')),
    final_weight_kg NUMERIC(5,2),
    rider_id        UUID REFERENCES auth.users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_laundry_orders_customer ON public.laundry_orders (customer_id, status);

ALTER TABLE public.laundry_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                   AND tablename = 'laundry_orders'
                   AND policyname = 'laundry_select_own_or_admin') THEN
        CREATE POLICY laundry_select_own_or_admin ON public.laundry_orders
            FOR SELECT TO authenticated
            USING (auth.uid() = customer_id OR public.is_admin());
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_laundry_order(
    p_service_zone_id UUID,
    p_address_id      UUID,
    p_weight_kg       NUMERIC,
    p_pickup_slot     TEXT DEFAULT 'today_evening',
    p_notes           TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user  UUID := auth.uid();
    v_rate  INTEGER;
    v_price INTEGER;
    v_id    UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ops_vertical_config
                   WHERE vertical_key = 'laundry' AND is_enabled) THEN
        RAISE EXCEPTION 'Laundry service is currently disabled';
    END IF;
    SELECT per_unit_paise INTO v_rate
    FROM public.ops_vertical_config WHERE vertical_key = 'laundry';

    IF p_weight_kg IS NULL OR p_weight_kg <= 0 OR p_weight_kg > 50 THEN
        RAISE EXCEPTION 'Weight must be between 0 and 50 kg';
    END IF;
    IF p_pickup_slot NOT IN ('today_evening', 'tomorrow_morning', 'tomorrow_evening') THEN
        RAISE EXCEPTION 'Invalid pickup slot';
    END IF;

    v_price := round(v_rate * p_weight_kg);
    IF v_price <= 0 THEN
        RAISE EXCEPTION 'Laundry price must be positive';
    END IF;

    INSERT INTO public.laundry_orders
        (customer_id, service_zone_id, address_id, pickup_slot, weight_kg, price_paise, notes)
    VALUES (v_user, p_service_zone_id, p_address_id, p_pickup_slot, p_weight_kg, v_price, p_notes)
    RETURNING id INTO v_id;

    PERFORM public.record_audit_log(
        v_user, 'customer', 'laundry_order_created', 'laundry_orders', v_id,
        NULL, jsonb_build_object('weight_kg', p_weight_kg, 'price_paise', v_price,
                                 'slot', p_pickup_slot)
    );
    RETURN jsonb_build_object('ok', true, 'laundry_order_id', v_id, 'price_paise', v_price,
                              'rate_per_kg_paise', v_rate, 'status', 'pending_pickup');
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_laundry_order(p_order_id UUID)
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
    UPDATE public.laundry_orders
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_order_id AND customer_id = v_user AND status = 'pending_pickup';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Laundry order not cancellable (not yours or already picked up)';
    END IF;
    PERFORM public.record_audit_log(
        v_user, 'customer', 'laundry_order_cancelled', 'laundry_orders', p_order_id,
        jsonb_build_object('status', 'pending_pickup'), jsonb_build_object('status', 'cancelled')
    );
    RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_laundry_status(
    p_order_id        UUID,
    p_status          TEXT,
    p_final_weight_kg NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_row  public.laundry_orders%ROWTYPE;
    v_rate INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    IF p_status NOT IN ('picked_up', 'in_wash', 'out_for_delivery', 'delivered') THEN
        RAISE EXCEPTION 'Status not admin-settable: %', p_status;
    END IF;

    SELECT * INTO v_row FROM public.laundry_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Laundry order not found';
    END IF;

    UPDATE public.laundry_orders
    SET status = p_status,
        final_weight_kg = COALESCE(p_final_weight_kg, final_weight_kg),
        updated_at = now()
    WHERE id = p_order_id;

    -- final-weight reprice on delivery: server-computed, never client-trusted
    IF p_status = 'delivered' AND p_final_weight_kg IS NOT NULL THEN
        SELECT per_unit_paise INTO v_rate
        FROM public.ops_vertical_config WHERE vertical_key = 'laundry';
        UPDATE public.laundry_orders
        SET price_paise = round(v_rate * p_final_weight_kg)
        WHERE id = p_order_id;
    END IF;

    PERFORM public.record_audit_log(
        auth.uid(), 'admin', 'laundry_status_set', 'laundry_orders', p_order_id,
        jsonb_build_object('status', v_row.status),
        jsonb_build_object('status', p_status, 'final_weight_kg', p_final_weight_kg)
    );
    RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_laundry_orders()
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
            'id', l.id, 'status', l.status, 'pickup_slot', l.pickup_slot,
            'weight_kg', l.weight_kg, 'final_weight_kg', l.final_weight_kg,
            'price_paise', l.price_paise, 'notes', l.notes,
            'created_at', l.created_at, 'updated_at', l.updated_at
        ) ORDER BY l.created_at DESC)
        FROM public.laundry_orders l
        WHERE l.customer_id = v_user
    ), '[]'::JSONB);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. service_requests + service_quotes (quotes escrow = contract-accept only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    service_zone_id   UUID REFERENCES public.service_zones(id),
    category          TEXT NOT NULL CHECK (category IN
                          ('repair', 'cleaning', 'appliance', 'tutoring', 'beauty', 'other')),
    title             TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 120),
    description       TEXT,
    status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'accepted', 'closed', 'cancelled')),
    accepted_quote_id UUID,
    accepted_price_paise INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_quotes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    price_paise INTEGER NOT NULL CHECK (price_paise > 0),
    note        TEXT CHECK (char_length(COALESCE(note, '')) <= 500),
    status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'accepted', 'declined', 'withdrawn')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT service_quotes_one_per_provider UNIQUE (request_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_service_requests_zone ON public.service_requests (service_zone_id, status);
CREATE INDEX IF NOT EXISTS idx_service_quotes_request ON public.service_quotes (request_id, status);

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_quotes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                   AND tablename = 'service_requests'
                   AND policyname = 'service_requests_select_own_or_admin') THEN
        CREATE POLICY service_requests_select_own_or_admin ON public.service_requests
            FOR SELECT TO authenticated
            USING (auth.uid() = customer_id OR public.is_admin()
                   OR EXISTS (SELECT 1 FROM public.user_roles ur
                              WHERE ur.user_id = auth.uid() AND ur.role = 'service_provider'
                                AND ur.is_active));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                   AND tablename = 'service_quotes'
                   AND policyname = 'service_quotes_select_involved') THEN
        CREATE POLICY service_quotes_select_involved ON public.service_quotes
            FOR SELECT TO authenticated
            USING (auth.uid() = provider_id
                   OR public.is_admin()
                   OR EXISTS (SELECT 1 FROM public.service_requests r
                              WHERE r.id = request_id AND r.customer_id = auth.uid()));
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_service_request(
    p_category        TEXT,
    p_title           TEXT,
    p_description     TEXT DEFAULT NULL,
    p_service_zone_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user UUID := auth.uid();
    v_id   UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF p_category NOT IN ('repair', 'cleaning', 'appliance', 'tutoring', 'beauty', 'other') THEN
        RAISE EXCEPTION 'Invalid service category';
    END IF;
    IF p_title IS NULL OR char_length(trim(p_title)) < 3 OR char_length(trim(p_title)) > 120 THEN
        RAISE EXCEPTION 'Title must be 3-120 characters';
    END IF;

    INSERT INTO public.service_requests (customer_id, service_zone_id, category, title, description)
    VALUES (v_user, p_service_zone_id, p_category, trim(p_title), p_description)
    RETURNING id INTO v_id;

    PERFORM public.record_audit_log(
        v_user, 'customer', 'service_request_created', 'service_requests', v_id,
        NULL, jsonb_build_object('category', p_category, 'title', trim(p_title))
    );
    RETURN jsonb_build_object('ok', true, 'request_id', v_id, 'status', 'open');
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_service_quote(
    p_request_id  UUID,
    p_price_paise INTEGER,
    p_note        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user UUID := auth.uid();
    v_id   UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = v_user AND ur.role = 'service_provider' AND ur.is_active) THEN
        RAISE EXCEPTION 'Service provider access required';
    END IF;
    IF p_price_paise IS NULL OR p_price_paise <= 0 THEN
        RAISE EXCEPTION 'Quote price must be positive';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.service_requests r
                   WHERE r.id = p_request_id AND r.status = 'open') THEN
        RAISE EXCEPTION 'Request not open for quotes';
    END IF;

    -- one quote per provider per request; re-quote = upsert back to open
    INSERT INTO public.service_quotes (request_id, provider_id, price_paise, note)
    VALUES (p_request_id, v_user, p_price_paise, p_note)
    ON CONFLICT (request_id, provider_id) DO UPDATE
        SET price_paise = EXCLUDED.price_paise,
            note        = EXCLUDED.note,
            status      = 'open'
    RETURNING id INTO v_id;

    PERFORM public.record_audit_log(
        v_user, 'service_provider', 'service_quote_submitted', 'service_quotes', v_id,
        NULL, jsonb_build_object('request_id', p_request_id, 'price_paise', p_price_paise)
    );
    RETURN jsonb_build_object('ok', true, 'quote_id', v_id, 'status', 'open');
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_service_quote(p_quote_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user  UUID := auth.uid();
    v_quote public.service_quotes%ROWTYPE;
    v_req   public.service_requests%ROWTYPE;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_quote FROM public.service_quotes WHERE id = p_quote_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quote not found';
    END IF;
    IF v_quote.status <> 'open' THEN
        RAISE EXCEPTION 'Quote not open (current: %)', v_quote.status;
    END IF;

    SELECT * INTO v_req FROM public.service_requests WHERE id = v_quote.request_id;
    IF v_req.customer_id <> v_user THEN
        RAISE EXCEPTION 'Only the request owner can accept quotes';
    END IF;
    IF v_req.status <> 'open' THEN
        RAISE EXCEPTION 'Request not open (current: %)', v_req.status;
    END IF;

    UPDATE public.service_quotes SET status = 'accepted' WHERE id = p_quote_id;
    UPDATE public.service_quotes SET status = 'declined'
    WHERE request_id = v_quote.request_id AND id <> p_quote_id AND status = 'open';

    UPDATE public.service_requests
    SET status = 'accepted',
        accepted_quote_id = p_quote_id,
        accepted_price_paise = v_quote.price_paise,
        updated_at = now()
    WHERE id = v_quote.request_id;

    PERFORM public.record_audit_log(
        v_user, 'customer', 'service_quote_accepted', 'service_requests', v_req.id,
        jsonb_build_object('status', 'open'),
        jsonb_build_object('quote_id', p_quote_id, 'price_paise', v_quote.price_paise)
    );
    -- escrow = contract-accept only; payment capture deferred (documented)
    RETURN jsonb_build_object('ok', true, 'request_status', 'accepted',
                              'price_paise', v_quote.price_paise,
                              'escrow', 'contract_accepted_payment_deferred');
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_service_requests()
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
            'id', r.id, 'category', r.category, 'title', r.title, 'status', r.status,
            'accepted_price_paise', r.accepted_price_paise,
            'quotes', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'id', q.id, 'provider_id', q.provider_id, 'price_paise', q.price_paise,
                    'note', q.note, 'status', q.status
                ) ORDER BY q.price_paise)
                FROM public.service_quotes q WHERE q.request_id = r.id
            ), '[]'::JSONB),
            'created_at', r.created_at
        ) ORDER BY r.created_at DESC)
        FROM public.service_requests r
        WHERE r.customer_id = v_user
    ), '[]'::JSONB);
END;
$function$;

CREATE OR REPLACE FUNCTION public.open_service_requests()
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
    IF NOT EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = v_user AND ur.role = 'service_provider' AND ur.is_active) THEN
        RAISE EXCEPTION 'Service provider access required';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', r.id, 'category', r.category, 'title', r.title,
            'description', r.description, 'created_at', r.created_at,
            'quote_count', (SELECT count(*) FROM public.service_quotes q WHERE q.request_id = r.id)
        ) ORDER BY r.created_at DESC)
        FROM public.service_requests r
        WHERE r.status = 'open'
    ), '[]'::JSONB);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Grants (tables: SELECT-only for authenticated; mutations via RPCs only)
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.ops_vertical_config FROM anon;
GRANT SELECT ON public.ops_vertical_config TO authenticated;
REVOKE ALL ON public.laundry_orders FROM anon, authenticated;
GRANT SELECT ON public.laundry_orders TO authenticated;
REVOKE ALL ON public.service_requests FROM anon, authenticated;
GRANT SELECT ON public.service_requests TO authenticated;
REVOKE ALL ON public.service_quotes FROM anon, authenticated;
GRANT SELECT ON public.service_quotes TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_vertical_delivery_fee(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_vertical_delivery_fee(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.set_vertical_config(TEXT, INTEGER, INTEGER, BOOLEAN) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_vertical_config(TEXT, INTEGER, INTEGER, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.create_laundry_order(UUID, UUID, NUMERIC, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_laundry_order(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_laundry_order(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_laundry_order(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.set_laundry_status(UUID, TEXT, NUMERIC) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_laundry_status(UUID, TEXT, NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION public.my_laundry_orders() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_laundry_orders() TO authenticated;
REVOKE ALL ON FUNCTION public.create_service_request(TEXT, TEXT, TEXT, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_service_request(TEXT, TEXT, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_service_quote(UUID, INTEGER, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_service_quote(UUID, INTEGER, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.accept_service_quote(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_service_quote(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.my_service_requests() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_service_requests() TO authenticated;
REVOKE ALL ON FUNCTION public.open_service_requests() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.open_service_requests() TO authenticated;

-- =============================================================================
-- ROLLBACK (exact, reverse order):
--   REVOKE EXECUTE ON FUNCTION public.resolve_vertical_delivery_fee(TEXT) FROM authenticated;
--   ... (revoke each grant above) ...
--   DROP FUNCTION public.resolve_vertical_delivery_fee(TEXT);
--   DROP FUNCTION public.set_vertical_config(TEXT, INTEGER, INTEGER, BOOLEAN);
--   DROP FUNCTION public.create_laundry_order(UUID, UUID, NUMERIC, TEXT, TEXT);
--   DROP FUNCTION public.cancel_laundry_order(UUID);
--   DROP FUNCTION public.set_laundry_status(UUID, TEXT, NUMERIC);
--   DROP FUNCTION public.my_laundry_orders();
--   DROP FUNCTION public.create_service_request(TEXT, TEXT, TEXT, UUID);
--   DROP FUNCTION public.submit_service_quote(UUID, INTEGER, TEXT);
--   DROP FUNCTION public.accept_service_quote(UUID);
--   DROP FUNCTION public.my_service_requests();
--   DROP FUNCTION public.open_service_requests();
--   DROP TABLE public.service_quotes;
--   DROP TABLE public.service_requests;
--   DROP TABLE public.laundry_orders;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS vertical_key;
--   DROP TABLE public.ops_vertical_config;
--   -- role widen revert (only after DELETE FROM user_roles WHERE role='service_provider'):
--   -- ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_role_check;
--   -- ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
--   --   CHECK (role = ANY (ARRAY['customer'::text,'merchant'::text,'rider'::text,'admin'::text]));
-- =============================================================================
