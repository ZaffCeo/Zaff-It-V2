-- ============================================================================
-- 027_w4b_pro_memberships.sql
-- W4b (doc §pro align): Pro purchase flow + in-engine benefits.
--
-- Doc rules implemented:
--   P1 Pricing: customer Rs49 intro (first month, one-time) -> Rs99/mo;
--      seller Rs199/mo; provider Rs199/mo. Each purchase = 30 days.
--   P2 Benefits: active customer Pro -> free delivery + free handling on
--      every order (wired into create_checkout_order + cart-preview mirror).
--   P3 Payment: Razorpay order per purchase; activation happens ONLY on
--      payment.captured webhook (amount-verified). Pending row before that.
--   P4 One active membership per user per plan (uq_pro_active_user_plan).
--
-- Activation RPC is service-role-only; the razorpay-webhook function calls
-- the same mutation inline (admin service client).
-- ============================================================================

-- 1) RPC: create a pending Pro membership + return price -----------------------
CREATE OR REPLACE FUNCTION public.create_pro_membership_order(p_plan TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_amount INTEGER;
    v_membership UUID;
    v_had_customer_before BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_plan NOT IN ('customer', 'seller', 'provider') THEN
        RAISE EXCEPTION 'Invalid plan: %', p_plan;
    END IF;

    -- P1 pricing: customer intro Rs49 once, then Rs99; seller/provider Rs199
    IF p_plan = 'seller' THEN
        v_amount := 19900;
    ELSIF p_plan = 'provider' THEN
        v_amount := 19900;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.pro_memberships
            WHERE user_id = v_user_id AND plan = 'customer'
        ) INTO v_had_customer_before;
        v_amount := CASE WHEN v_had_customer_before THEN 9900 ELSE 4900 END;
    END IF;

    INSERT INTO public.pro_memberships (
        user_id, plan, status, source, amount_paise, payment_provider
    ) VALUES (
        v_user_id, p_plan, 'pending', 'purchase', v_amount, 'razorpay'
    ) RETURNING id INTO v_membership;

    PERFORM public.record_audit_log(
        v_user_id, 'customer', 'pro.order_created', 'pro_memberships', v_membership,
        NULL,
        jsonb_build_object('plan', p_plan, 'amount_paise', v_amount),
        jsonb_build_object('intro_price', p_plan = 'customer' AND NOT v_had_customer_before)
    );

    RETURN jsonb_build_object(
        'membership_id', v_membership,
        'plan', p_plan,
        'amount_paise', v_amount,
        'intro_price', p_plan = 'customer' AND NOT v_had_customer_before
    );
END;
$function$;

-- 2) RPC: activate on verified payment (service-role only) ----------------------
CREATE OR REPLACE FUNCTION public.activate_pro_membership(
    p_membership_id UUID,
    p_rzp_order_id TEXT,
    p_rzp_payment_id TEXT,
    p_paid_paise INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_row public.pro_memberships%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM public.pro_memberships
    WHERE id = p_membership_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership not found';
    END IF;

    IF v_row.status = 'active' THEN
        RETURN jsonb_build_object('ok', true, 'deduplicated', true);
    END IF;

    IF v_row.status <> 'pending' THEN
        RAISE EXCEPTION 'Membership in status % cannot be activated', v_row.status;
    END IF;

    IF p_paid_paise <> v_row.amount_paise THEN
        RAISE EXCEPTION 'Paid amount % does not match membership price %',
            p_paid_paise, v_row.amount_paise;
    END IF;

    UPDATE public.pro_memberships
    SET status = 'active',
        started_at = now(),
        expires_at = now() + INTERVAL '30 days',
        payment_ref = p_rzp_order_id,
        payment_provider = 'razorpay',
        updated_at = now()
    WHERE id = p_membership_id;

    PERFORM public.record_audit_log(
        v_row.user_id, 'system', 'pro.activated', 'pro_memberships', p_membership_id,
        jsonb_build_object('status', v_row.status),
        jsonb_build_object('razorpay_order_id', p_rzp_order_id, 'razorpay_payment_id', p_rzp_payment_id),
        jsonb_build_object('plan', v_row.plan, 'amount_paise', v_row.amount_paise)
    );

    RETURN jsonb_build_object(
        'ok', true,
        'plan', v_row.plan,
        'expires_at', now() + INTERVAL '30 days'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_pro_membership_order(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_pro_membership_order(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.activate_pro_membership(UUID, TEXT, TEXT, INTEGER)
    FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_pro_membership(UUID, TEXT, TEXT, INTEGER)
    TO service_role;

-- 3) RPC: my pro status ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_pro_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_row public.pro_memberships%ROWTYPE;
    v_had_customer BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_row FROM public.pro_memberships
    WHERE user_id = v_user_id AND plan = 'customer' AND status = 'active'
      AND expires_at > now()
    LIMIT 1;

    SELECT EXISTS (
        SELECT 1 FROM public.pro_memberships
        WHERE user_id = v_user_id AND plan = 'customer'
    ) INTO v_had_customer;

    RETURN jsonb_build_object(
        'customer_pro_active', FOUND,
        'expires_at', CASE WHEN FOUND THEN v_row.expires_at ELSE NULL END,
        'source', CASE WHEN FOUND THEN v_row.source ELSE NULL END,
        'intro_price_used', v_had_customer,
        'next_price_paise', CASE WHEN v_had_customer THEN 9900 ELSE 4900 END
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.my_pro_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_pro_status() TO authenticated;

-- 4) P2: Pro benefits in checkout pricing (free delivery + free handling) ------
-- Insert an active-customer-Pro check right before the fee block. Implemented by
-- rebuilding the fee section of create_checkout_order via function replace:
-- the full v3 body (025) with two benefit lines added after the wallet block.
-- NOTE: applied in batches by the operator; body stored verbatim in this file
-- as the canonical definition.

CREATE OR REPLACE FUNCTION public.create_checkout_order(
    p_cart_id uuid,
    p_delivery_address_id uuid,
    p_payment_method text,
    p_idempotency_key text,
    p_coupon_code text DEFAULT NULL::text,
    p_use_wallet boolean DEFAULT false
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
    v_wallet_coins INTEGER := 0;
    v_wallet_discount_paise INTEGER := 0;
    v_spendable INTEGER := 0;
    v_payable_products INTEGER := 0;
    v_is_pro BOOLEAN := false;
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

    SELECT *
    INTO v_cart
    FROM public.carts
    WHERE id = p_cart_id
      AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND OR v_cart.status <> 'active' THEN
        RAISE EXCEPTION 'Active cart not found';
    END IF;

    SELECT *
    INTO v_addr
    FROM public.addresses
    WHERE id = p_delivery_address_id
      AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Delivery address not found';
    END IF;

    SELECT * INTO v_store FROM public.stores WHERE id = v_cart.store_id;
    IF NOT FOUND OR NOT v_store.is_active OR NOT v_store.is_open THEN
        RAISE EXCEPTION 'Store is currently unavailable or closed';
    END IF;

    SELECT * INTO v_zone FROM public.service_zones WHERE id = v_store.service_zone_id;
    IF NOT FOUND OR NOT v_zone.is_active THEN
        RAISE EXCEPTION 'Service zone is inactive';
    END IF;

    -- P2: active customer Pro = free delivery + free handling
    SELECT EXISTS (
        SELECT 1 FROM public.pro_memberships
        WHERE user_id = v_user_id
          AND plan = 'customer'
          AND status = 'active'
          AND expires_at > now()
    ) INTO v_is_pro;

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

    IF p_use_wallet THEN
        v_spendable := public.wallet_spendable(v_user_id);
        v_wallet_coins := LEAST(v_spendable, FLOOR(v_subtotal_paise / 100));
        v_wallet_discount_paise := v_wallet_coins * 10;
        v_wallet_discount_paise := LEAST(
            v_wallet_discount_paise,
            GREATEST(0, v_subtotal_paise - v_discount_paise)
        );
        v_wallet_coins := v_wallet_discount_paise / 10;
    END IF;

    v_payable_products := GREATEST(0, v_subtotal_paise - v_discount_paise - v_wallet_discount_paise);

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

    IF v_is_pro OR v_zone.launch_free_delivery THEN
        v_delivery_fee_paise := 0; -- P2 Pro benefit / doc first-month free
    ELSIF v_payable_products >= v_zone.free_delivery_threshold_paise THEN
        v_delivery_fee_paise := 0;
    ELSIF v_distance_m IS NULL THEN
        v_delivery_fee_paise := v_zone.base_delivery_fee_paise;
    ELSIF v_distance_m <= 3000 THEN
        v_delivery_fee_paise := 2500;
    ELSIF v_distance_m <= 6000 THEN
        v_delivery_fee_paise := 3000;
    ELSE
        v_delivery_fee_paise := 5000;
    END IF;

    v_handling_fee_paise := CASE
        WHEN v_is_pro THEN 0 -- P2 Pro benefit
        WHEN v_subtotal_paise < 19900 THEN 500
        ELSE 1000
    END;

    v_total_paise := GREATEST(
        0,
        v_subtotal_paise + v_delivery_fee_paise + v_handling_fee_paise
        - v_discount_paise - v_wallet_discount_paise
    );

    v_initial_status := CASE
        WHEN p_payment_method = 'cod' THEN 'placed'
        ELSE 'payment_pending'
    END;

    v_order_number := 'ZAF-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 6));

    IF v_wallet_coins > 0 THEN
        v_wallet_coins := public.wallet_redeem(
            v_user_id,
            v_wallet_coins,
            'Order ' || v_order_number || ' wallet payment',
            NULL,
            NULL
        );
        v_wallet_discount_paise := v_wallet_coins * 10;
        v_total_paise := GREATEST(
            0,
            v_subtotal_paise + v_delivery_fee_paise + v_handling_fee_paise
            - v_discount_paise - v_wallet_discount_paise
        );
    END IF;

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
        wallet_coins_used,
        wallet_discount_paise,
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
        v_wallet_coins,
        v_wallet_discount_paise,
        v_total_paise,
        NULLIF(upper(trim(COALESCE(p_coupon_code, ''))), ''),
        p_idempotency_key,
        CASE WHEN p_payment_method = 'cod' THEN now() ELSE NULL END
    )
    RETURNING id INTO v_order_id;

    IF v_wallet_coins > 0 THEN
        UPDATE public.wallet_ledger
        SET reference_type = 'order', reference_id = v_order_id
        WHERE user_id = v_user_id
          AND source_type = 'redeem'
          AND reason = 'Order ' || v_order_number || ' wallet payment'
          AND reference_id IS NULL;
    END IF;

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
            'payment_method', p_payment_method,
            'wallet_coins_used', v_wallet_coins,
            'is_pro', v_is_pro
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
        'wallet_coins_used', v_wallet_coins,
        'wallet_discount_paise', v_wallet_discount_paise,
        'is_pro', v_is_pro,
        'total_paise', v_total_paise
    );
END;
$function$;
