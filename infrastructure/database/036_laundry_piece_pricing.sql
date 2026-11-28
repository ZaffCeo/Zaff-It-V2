-- 036_laundry_piece_pricing.sql — Laundry per-piece pricing (Makrana market model)
--
-- Founder pricing decision (2026-11-28): local laundries charge ₹50/pair; Zaff-It charges ₹40.
--   * Pair (2 kapdon ki jodi)  = ₹40  (wash + press INCLUDED)
--   * Single piece             = ₹20  (wash + press INCLUDED)
--   * Press only               = ₹10
--   * Special: Saree ₹40 · Bedsheet ₹40 · Blanket ₹80 (admin-editable later)
--   * No minimum order · free doorstep pickup (delivery_fee already 0)
--
-- Replaces the Wave-7 (033) per-kg model (`1500/kg`, weight_kg, final-weight reprice).
-- Laundry UI never shipped to customers → laundry_orders has no production rows;
-- weight columns are dropped outright.
--
-- 1. laundry_item_rates  — per-piece rate card (admin-editable, server-side pricing source)
-- 2. laundry_orders      — weight cols OUT, items_json + item_count IN, price cap ₹10,000
-- 3. ops_vertical_config — laundry row: unit_label 'per piece' (rates live in laundry_item_rates)
-- 4. create_laundry_order v2 — items JSONB in, server prices from laundry_item_rates (never client-trusted)
-- 5. set_laundry_status v2   — no final-weight reprice (piece pricing is fixed at creation)
-- 6. my_laundry_orders v2    — returns items_json + item_count
--
-- ROLLBACK (piece → kg model):
--   DROP TABLE public.laundry_item_rates;
--   ALTER TABLE public.laundry_orders
--     ADD COLUMN weight_kg NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (weight_kg > 0 AND weight_kg <= 50),
--     ADD COLUMN final_weight_kg NUMERIC(5,2);
--   ALTER TABLE public.laundry_orders DROP CONSTRAINT laundry_orders_price_cap;
--   UPDATE public.ops_vertical_config SET per_unit_paise = 1500, unit_label = 'per kg' WHERE vertical_key = 'laundry';
--   Recreate 033 versions of create_laundry_order/set_laundry_status/my_laundry_orders
--   (see 033_w7_verticals.sql §5) and purge piece-era rows:
--   DELETE FROM public.laundry_orders WHERE items_json <> '[]'::jsonb;
--
-- Env traps honored: DROP FUNCTION before changed-signature recreate; grants re-issued for new signatures.

-- ---------------------------------------------------------------------------
-- 1. laundry_item_rates (rate card — single source of truth for pricing)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.laundry_item_rates (
    item_key     TEXT PRIMARY KEY,
    label        TEXT NOT NULL,
    label_hi     TEXT NOT NULL,
    category     TEXT NOT NULL CHECK (category IN ('regular', 'press', 'special')),
    price_paise  INTEGER NOT NULL CHECK (price_paise > 0),
    sort_order   INTEGER NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    updated_by   UUID REFERENCES auth.users(id),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.laundry_item_rates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                   AND tablename = 'laundry_item_rates'
                   AND policyname = 'laundry_rates_read_auth') THEN
        CREATE POLICY laundry_rates_read_auth ON public.laundry_item_rates
            FOR SELECT TO authenticated
            USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                   AND tablename = 'laundry_item_rates'
                   AND policyname = 'laundry_rates_admin_all') THEN
        CREATE POLICY laundry_rates_admin_all ON public.laundry_item_rates
            FOR ALL TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin());
    END IF;
END $$;

-- Seed: file is source of truth — re-run refreshes rates (founder pricing, 2026-11-28)
INSERT INTO public.laundry_item_rates (item_key, label, label_hi, category, price_paise, sort_order, is_active)
VALUES
    ('pair',     'Pair — 2 kapde',      'जोड़ी — 2 कपड़े',        'regular', 4000, 10, true),
    ('single',   'Single kapda',        'सिंगल कपड़ा',           'regular', 2000, 20, true),
    ('press',    'Sirf press',          'सिर्फ़ प्रेस',           'press',   1000, 30, true),
    ('saree',    'Saree',               'साड़ी',                 'special', 4000, 40, true),
    ('bedsheet', 'Bedsheet',            'चादर (बेडशीट)',         'special', 4000, 50, true),
    ('blanket',  'Blanket',             'कंबल',                  'special', 8000, 60, true)
ON CONFLICT (item_key) DO UPDATE
    SET label = EXCLUDED.label,
        label_hi = EXCLUDED.label_hi,
        category = EXCLUDED.category,
        price_paise = EXCLUDED.price_paise,
        sort_order = EXCLUDED.sort_order,
        is_active = true,
        updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. laundry_orders: weight cols OUT → items_json + item_count IN
-- ---------------------------------------------------------------------------
ALTER TABLE public.laundry_orders DROP COLUMN IF EXISTS weight_kg;
ALTER TABLE public.laundry_orders DROP COLUMN IF EXISTS final_weight_kg;
ALTER TABLE public.laundry_orders ADD COLUMN IF NOT EXISTS items_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.laundry_orders ADD COLUMN IF NOT EXISTS item_count INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'laundry_orders_items_json_is_array'
                   AND conrelid = 'public.laundry_orders'::regclass) THEN
        ALTER TABLE public.laundry_orders
            ADD CONSTRAINT laundry_orders_items_json_is_array CHECK (jsonb_typeof(items_json) = 'array');
    END IF;
END $$;

-- Sanity cap ₹10,000 per order (server-side pricing keeps this far below in practice)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'laundry_orders_price_cap'
                   AND conrelid = 'public.laundry_orders'::regclass) THEN
        ALTER TABLE public.laundry_orders
            ADD CONSTRAINT laundry_orders_price_cap CHECK (price_paise <= 1000000);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. ops_vertical_config: laundry row → per-piece display
-- ---------------------------------------------------------------------------
UPDATE public.ops_vertical_config
SET per_unit_paise = 0, unit_label = 'per piece', updated_at = now()
WHERE vertical_key = 'laundry';

-- ---------------------------------------------------------------------------
-- 4. create_laundry_order v2 — pieces in, price computed server-side
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_laundry_order(UUID, UUID, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_laundry_order(
    p_service_zone_id UUID,
    p_address_id      UUID,
    p_items           JSONB,
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
    v_item  JSONB;
    v_key   TEXT;
    v_qty   INTEGER;
    v_line  INTEGER;
    v_price INTEGER := 0;
    v_count INTEGER := 0;
    v_id    UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ops_vertical_config
                   WHERE vertical_key = 'laundry' AND is_enabled) THEN
        RAISE EXCEPTION 'Laundry service is currently disabled';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one laundry item is required';
    END IF;
    IF jsonb_array_length(p_items) > 100 THEN
        RAISE EXCEPTION 'Maximum 100 item lines per order';
    END IF;
    IF p_pickup_slot NOT IN ('today_evening', 'tomorrow_morning', 'tomorrow_evening') THEN
        RAISE EXCEPTION 'Invalid pickup slot';
    END IF;
    IF p_service_zone_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.service_zones
        WHERE id = p_service_zone_id AND is_active
    ) THEN
        RAISE EXCEPTION 'Invalid or inactive service zone';
    END IF;
    IF p_address_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.addresses
        WHERE id = p_address_id AND user_id = v_user
    ) THEN
        RAISE EXCEPTION 'Address not found (must be your own)';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_key := v_item->>'item_key';
        IF v_key IS NULL OR v_item->>'qty' IS NULL THEN
            RAISE EXCEPTION 'Each item needs item_key and qty';
        END IF;
        v_qty := (v_item->>'qty')::int;
        IF v_qty < 1 OR v_qty > 50 THEN
            RAISE EXCEPTION 'Item qty must be between 1 and 50';
        END IF;
        SELECT price_paise INTO v_line
        FROM public.laundry_item_rates
        WHERE item_key = v_key AND is_active;
        IF v_line IS NULL THEN
            RAISE EXCEPTION 'Invalid or unavailable laundry item: %', v_key;
        END IF;
        v_price := v_price + v_line * v_qty;
        v_count := v_count + v_qty;
    END LOOP;

    IF v_count > 150 THEN
        RAISE EXCEPTION 'Maximum 150 pieces per order (call us for bigger loads)';
    END IF;
    IF v_price <= 0 OR v_price > 1000000 THEN
        RAISE EXCEPTION 'Laundry price out of allowed range';
    END IF;

    INSERT INTO public.laundry_orders
        (customer_id, service_zone_id, address_id, pickup_slot, items_json, item_count, price_paise, notes)
    VALUES (v_user, p_service_zone_id, p_address_id, p_pickup_slot, p_items, v_count, v_price, p_notes)
    RETURNING id INTO v_id;

    PERFORM public.record_audit_log(
        v_user, 'customer', 'laundry_order_created', 'laundry_orders', v_id,
        NULL, jsonb_build_object('items', p_items, 'item_count', v_count,
                                 'price_paise', v_price, 'slot', p_pickup_slot)
    );
    RETURN jsonb_build_object('ok', true, 'laundry_order_id', v_id, 'price_paise', v_price,
                              'item_count', v_count, 'items', p_items, 'status', 'pending_pickup');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. set_laundry_status v2 — piece pricing fixed at creation (no weight reprice)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_laundry_status(UUID, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.set_laundry_status(
    p_order_id UUID,
    p_status   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_row public.laundry_orders%ROWTYPE;
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
    SET status = p_status, updated_at = now()
    WHERE id = p_order_id;

    PERFORM public.record_audit_log(
        auth.uid(), 'admin', 'laundry_status_set', 'laundry_orders', p_order_id,
        jsonb_build_object('status', v_row.status),
        jsonb_build_object('status', p_status)
    );
    RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. my_laundry_orders v2 — items_json + item_count (labels mapped client-side
--    from laundry_item_rates SELECT, which authenticated users can read)
-- ---------------------------------------------------------------------------
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
            'items_json', l.items_json, 'item_count', l.item_count,
            'price_paise', l.price_paise, 'notes', l.notes,
            'address_id', l.address_id,
            'created_at', l.created_at, 'updated_at', l.updated_at
        ) ORDER BY l.created_at DESC)
        FROM public.laundry_orders l
        WHERE l.customer_id = v_user
    ), '[]'::JSONB);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Grants (new signatures; cancel_laundry_order/my_laundry_orders unchanged
--    signatures keep their grants through OR REPLACE)
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.laundry_item_rates FROM anon, authenticated;
GRANT SELECT ON public.laundry_item_rates TO authenticated;

REVOKE ALL ON FUNCTION public.create_laundry_order(UUID, UUID, JSONB, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_laundry_order(UUID, UUID, JSONB, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.set_laundry_status(UUID, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_laundry_status(UUID, TEXT) TO authenticated;
