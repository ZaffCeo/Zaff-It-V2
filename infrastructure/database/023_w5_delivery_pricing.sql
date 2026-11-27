-- ============================================================================
-- 023_w5_delivery_pricing.sql
-- W5 (doc §6 align): distance-slab delivery fees + handling fee + launch
-- free-delivery flag. Server-authoritative (create_checkout_order RPC);
-- cart-preview mirrors for estimates.
--
-- Doc rules implemented:
--   Delivery: 0-3 km ₹25 · 3-6 km ₹30 · 6-10 km ₹50 (store→address haversine;
--             >10 km rejected — doc delivery range 1-10 km).
--   Free delivery: cart ≥ zone free_delivery_threshold (₹199) OR
--             launch_free_delivery flag (doc: "First 1 month free delivery").
--   Handling: ₹5 cart < ₹199 · ₹10 cart ≥ ₹199 (per order; Pro frees later).
--   Total = subtotal + delivery + handling − discount. Razorpay amount and
--   webhook matching remain authoritative on total_paise (unchanged contract).
-- ============================================================================

-- 1) Schema: handling on orders, launch flag on zones
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS handling_fee_paise INTEGER NOT NULL DEFAULT 0
    CHECK (handling_fee_paise >= 0);

ALTER TABLE public.service_zones
    ADD COLUMN IF NOT EXISTS launch_free_delivery BOOLEAN NOT NULL DEFAULT false;

-- First month free delivery (doc §6). Founder flips to false after launch month.
UPDATE public.service_zones SET launch_free_delivery = true;

-- 2) Authoritative RPC: replace fee block + handling + total + columns
CREATE OR REPLACE FUNCTION public.create_checkout_order(
    p_cart_id uuid,
    p_delivery_address_id uuid,
    p_payment_method text,
    p_idempotency_key text,
    p_coupon_code text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_existing_order public.orders%ROWTYPE;
    v_cart public.carts%ROWTYPE;
    v_store public.stores%ROWTYPE;
    v_zone public.service_zones%ROWTYPE;
    v_addr public.addresses%ROWTYPE;
    v_promo public.promotions%ROWTYPE;
    v_item RECORD;
    v_subtotal_paise INTEGER := 0;
    v_tax_paise INTEGER := 0;
    v_delivery_fee_paise INTEGER := 0;
    v_handling_fee_paise INTEGER := 0;
    v_distance_m NUMERIC;
    v_discount_paise INTEGER := 0;
    v_total_paise INTEGER := 0;
    v_line_total INTEGER;
    v_line_tax INTEGER;
    v_item_count INTEGER := 0;
    v_order_id UUID;
    v_order_number TEXT;
    v_initial_status TEXT;
    v_payment_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) < 8 THEN
        RAISE EXCEPTION 'Valid idempotency_key is required';
    END IF;

    IF p_payment_method NOT IN ('razorpay', 'cod') THEN
        RAISE EXCEPTION 'Invalid payment_method: %', p_payment_method;
    END IF;

    -- Idempotent replay check
    SELECT *
    INTO v_existing_order
    FROM public.orders
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_existing_order.customer_id <> v_user_id THEN
            RAISE EXCEPTION 'Idempotency key conflict';
        END IF;

        RETURN jsonb_build_object(
            'idempotent_replay', true,
            'order_id', v_existing_order.id,
            'order_number', v_existing_order.order_number,
            'status', v_existing_order.status,
            'total_paise', v_existing_order.total_paise
        );
    END IF;

    -- Lock and validate active cart
    SELECT *
    INTO v_cart
    FROM public.carts
    WHERE id = p_cart_id
      AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND OR v_cart.status <> 'active' THEN
        RAISE EXCEPTION 'Active cart not found';
    END IF;

    -- Validate delivery address ownership
    SELECT *
    INTO v_addr
    FROM public.addresses
    WHERE id = p_delivery_address_id
      AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Delivery address not found';
    END IF;

    -- Validate store & service zone
    SELECT * INTO v_store FROM public.stores WHERE id = v_cart.store_id;
    IF NOT FOUND OR NOT v_store.is_active OR NOT v_store.is_open THEN
        RAISE EXCEPTION 'Store is currently unavailable or closed';
    END IF;

    SELECT * INTO v_zone FROM public.service_zones WHERE id = v_store.service_zone_id;
    IF NOT FOUND OR NOT v_zone.is_active THEN
        RAISE EXCEPTION 'Service zone is inactive';
    END IF;

    -- Lock cart items, store_products, and inventory in deterministic order to avoid deadlocks
    FOR v_item IN
        SELECT
            ci.id AS cart_item_id,
            ci.qty,
            sp.id AS store_product_id,
            sp.mrp_paise,
            sp.selling_price_paise,
            sp.max_qty_per_order,
            sp.is_available,
            p.id AS product_id,
            p.name AS product_name,
            p.unit_label,
            p.gst_bps,
            p.is_active AS product_active,
            inv.id AS inventory_id,
            inv.on_hand_qty,
            inv.reserved_qty,
            inv.available_to_sell
        FROM public.cart_items ci
        JOIN public.store_products sp ON sp.id = ci.store_product_id
        JOIN public.products p ON p.id = sp.product_id
        JOIN public.inventory inv ON inv.store_product_id = sp.id
        WHERE ci.cart_id = v_cart.id
        ORDER BY ci.store_product_id
        FOR UPDATE OF sp, inv
    LOOP
        v_item_count := v_item_count + 1;

        IF NOT v_item.is_available OR NOT v_item.product_active THEN
            RAISE EXCEPTION 'Product % is no longer available', v_item.product_name;
        END IF;

        IF v_item.qty > v_item.max_qty_per_order THEN
            RAISE EXCEPTION 'Quantity exceeds max limit (%) for %', v_item.max_qty_per_order, v_item.product_name;
        END IF;

        IF v_item.available_to_sell < v_item.qty THEN
            RAISE EXCEPTION 'Insufficient stock for % (available: %, requested: %)',
                v_item.product_name, v_item.available_to_sell, v_item.qty;
        END IF;

        v_line_total := v_item.selling_price_paise * v_item.qty;
        v_line_tax := ROUND((v_line_total::NUMERIC * v_item.gst_bps) / (10000 + v_item.gst_bps))::INTEGER;

        v_subtotal_paise := v_subtotal_paise + v_line_total;
        v_tax_paise := v_tax_paise + v_line_tax;
    END LOOP;

    IF v_item_count = 0 THEN
        RAISE EXCEPTION 'Cart is empty';
    END IF;

    IF v_subtotal_paise < v_store.min_order_paise THEN
        RAISE EXCEPTION 'Order subtotal (% paise) is below store minimum (% paise)',
            v_subtotal_paise, v_store.min_order_paise;
    END IF;

    -- W5: distance-slab delivery fee (store -> address haversine; doc §6 slabs)
    IF v_addr.lat IS NOT NULL AND v_addr.lng IS NOT NULL AND v_store.lat IS NOT NULL AND v_store.lng IS NOT NULL THEN
        v_distance_m := 6371000 * acos(LEAST(1::NUMERIC, GREATEST(-1::NUMERIC,
            cos(radians(v_store.lat::NUMERIC)) * cos(radians(v_addr.lat::NUMERIC))
              * cos(radians(v_addr.lng::NUMERIC) - radians(v_store.lng::NUMERIC))
            + sin(radians(v_store.lat::NUMERIC)) * sin(radians(v_addr.lat::NUMERIC))
        )));
    ELSE
        v_distance_m := NULL;
    END IF;

    IF v_distance_m IS NOT NULL AND v_distance_m > 10000 THEN
        RAISE EXCEPTION 'Address outside delivery range (>10 km)';
    END IF;

    IF v_zone.launch_free_delivery THEN
        v_delivery_fee_paise := 0; -- doc: first month free delivery
    ELSIF v_subtotal_paise >= v_zone.free_delivery_threshold_paise THEN
        v_delivery_fee_paise := 0;
    ELSIF v_distance_m IS NULL THEN
        v_delivery_fee_paise := v_zone.base_delivery_fee_paise;
    ELSIF v_distance_m <= 3000 THEN
        v_delivery_fee_paise := 2500; -- 0-3 km ₹25
    ELSIF v_distance_m <= 6000 THEN
        v_delivery_fee_paise := 3000; -- 3-6 km ₹30
    ELSE
        v_delivery_fee_paise := 5000; -- 6-10 km ₹50
    END IF;

    -- W5: handling fee (doc §6): ₹5 cart < ₹199 · ₹10 cart ≥ ₹199
    v_handling_fee_paise := CASE WHEN v_subtotal_paise < 19900 THEN 500 ELSE 1000 END;

    -- Server-side promotion validation
    IF p_coupon_code IS NOT NULL AND char_length(trim(p_coupon_code)) > 0 THEN
        SELECT *
        INTO v_promo
        FROM public.promotions
        WHERE upper(code) = upper(trim(p_coupon_code))
          AND is_active = true
          AND now() BETWEEN starts_at AND ends_at
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid or expired coupon code';
        END IF;

        IF v_promo.usage_limit IS NOT NULL AND v_promo.used_count >= v_promo.usage_limit THEN
            RAISE EXCEPTION 'Coupon usage limit reached';
        END IF;

        IF v_promo.service_zone_id IS NOT NULL AND v_promo.service_zone_id <> v_zone.id THEN
            RAISE EXCEPTION 'Coupon not valid in this service zone';
        END IF;

        IF v_promo.store_id IS NOT NULL AND v_promo.store_id <> v_store.id THEN
            RAISE EXCEPTION 'Coupon not valid for this store';
        END IF;

        IF v_subtotal_paise < v_promo.min_order_paise THEN
            RAISE EXCEPTION 'Minimum order not met for coupon';
        END IF;

        IF v_promo.discount_type = 'flat_paise' THEN
            v_discount_paise := v_promo.discount_value;
        ELSE
            v_discount_paise := ((v_subtotal_paise::BIGINT * v_promo.discount_value) / 10000)::INTEGER;
            IF v_promo.max_discount_paise IS NOT NULL THEN
                v_discount_paise := LEAST(v_discount_paise, v_promo.max_discount_paise);
            END IF;
        END IF;

        v_discount_paise := LEAST(v_discount_paise, v_subtotal_paise);

        UPDATE public.promotions
        SET used_count = used_count + 1
        WHERE id = v_promo.id;
    END IF;

    -- Selling prices are GST-inclusive in Indian retail MRP/selling price
    v_total_paise := GREATEST(0, v_subtotal_paise + v_delivery_fee_paise + v_handling_fee_paise - v_discount_paise);

    v_initial_status := CASE
        WHEN p_payment_method = 'cod' THEN 'placed'
        ELSE 'payment_pending'
    END;

    v_order_number := 'ZAF-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 6));

    INSERT INTO public.orders (
        order_number,
        customer_id,
        store_id,
        service_zone_id,
        delivery_address_id,
        delivery_address_snapshot,
        fulfillment_type,
        status,
        payment_method,
        subtotal_paise,
        tax_paise,
        delivery_fee_paise,
        handling_fee_paise,
        discount_paise,
        total_paise,
        coupon_code,
        idempotency_key,
        placed_at
    )
    VALUES (
        v_order_number,
        v_user_id,
        v_store.id,
        v_zone.id,
        v_addr.id,
        jsonb_build_object(
            'label', v_addr.label,
            'recipient_name', v_addr.recipient_name,
            'phone', v_addr.phone,
            'line1', v_addr.line1,
            'line2', v_addr.line2,
            'landmark', v_addr.landmark,
            'city', v_addr.city,
            'state', v_addr.state,
            'pincode', v_addr.pincode,
            'lat', v_addr.lat,
            'lng', v_addr.lng
        ),
        v_store.fulfillment_type,
        v_initial_status,
        p_payment_method,
        v_subtotal_paise,
        v_tax_paise,
        v_delivery_fee_paise,
        v_handling_fee_paise,
        v_discount_paise,
        v_total_paise,
        NULLIF(upper(trim(COALESCE(p_coupon_code, ''))), ''),
        p_idempotency_key,
        CASE WHEN p_payment_method = 'cod' THEN now() ELSE NULL END
    )
    RETURNING id INTO v_order_id;

    -- Insert order_items snapshots and reserve stock atomically
    FOR v_item IN
        SELECT
            ci.qty,
            sp.id AS store_product_id,
            sp.mrp_paise,
            sp.selling_price_paise,
            p.id AS product_id,
            p.name AS product_name,
            p.unit_label,
            p.gst_bps
        FROM public.cart_items ci
        JOIN public.store_products sp ON sp.id = ci.store_product_id
        JOIN public.products p ON p.id = sp.product_id
        WHERE ci.cart_id = v_cart.id
        ORDER BY ci.store_product_id
    LOOP
        v_line_total := v_item.selling_price_paise * v_item.qty;
        v_line_tax := ROUND((v_line_total::NUMERIC * v_item.gst_bps) / (10000 + v_item.gst_bps))::INTEGER;

        INSERT INTO public.order_items (
            order_id,
            store_product_id,
            product_id,
            product_name_snapshot,
            unit_label_snapshot,
            qty,
            mrp_paise,
            unit_price_paise,
            gst_bps,
            tax_paise,
            line_total_paise
        )
        VALUES (
            v_order_id,
            v_item.store_product_id,
            v_item.product_id,
            v_item.product_name,
            v_item.unit_label,
            v_item.qty,
            v_item.mrp_paise,
            v_item.selling_price_paise,
            v_item.gst_bps,
            v_line_tax,
            v_line_total
        );

        PERFORM public.reserve_inventory(
            v_item.store_product_id,
            v_item.qty,
            v_order_id,
            'checkout_reservation'
        );
    END LOOP;

    -- Create payment record
    INSERT INTO public.payments (
        order_id,
        customer_id,
        idempotency_key,
        provider,
        amount_paise,
        currency,
        status
    )
    VALUES (
        v_order_id,
        v_user_id,
        p_idempotency_key,
        p_payment_method,
        v_total_paise,
        'INR',
        'created'
    )
    RETURNING id INTO v_payment_id;

    -- Mark cart converted
    UPDATE public.carts
    SET status = 'converted'
    WHERE id = v_cart.id;

    PERFORM public.record_audit_log(
        v_user_id,
        'customer',
        'order.create',
        'orders',
        v_order_id,
        NULL,
        jsonb_build_object(
            'order_number', v_order_number,
            'status', v_initial_status,
            'total_paise', v_total_paise,
            'payment_method', p_payment_method
        ),
        jsonb_build_object('idempotency_key', p_idempotency_key, 'payment_id', v_payment_id)
    );

    RETURN jsonb_build_object(
        'idempotent_replay', false,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'payment_id', v_payment_id,
        'status', v_initial_status,
        'subtotal_paise', v_subtotal_paise,
        'tax_paise', v_tax_paise,
        'delivery_fee_paise', v_delivery_fee_paise,
        'handling_fee_paise', v_handling_fee_paise,
        'discount_paise', v_discount_paise,
        'total_paise', v_total_paise
    );
END;
$function$;
