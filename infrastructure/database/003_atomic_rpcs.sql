-- ZAFF-IT Atomic PostgreSQL RPCs
-- Enforces SELECT ... FOR UPDATE locking, server-side paise calculation,
-- idempotency keys, atomic inventory reservation/release, and audit logging.

SET timezone = 'UTC';

-- ============================================================================
-- 1. AUDIT LOGGING HELPER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_audit_log(
    p_actor_id UUID,
    p_actor_role TEXT,
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_old_data JSONB DEFAULT NULL,
    p_new_data JSONB DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        old_data,
        new_data,
        metadata
    )
    VALUES (
        p_actor_id,
        p_actor_role,
        p_action,
        p_entity_type,
        p_entity_id,
        p_old_data,
        p_new_data,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- ============================================================================
-- 2. ATOMIC INVENTORY RESERVATION (SELECT ... FOR UPDATE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reserve_inventory(
    p_store_product_id UUID,
    p_qty INTEGER,
    p_order_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'order_reservation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_inv public.inventory%ROWTYPE;
    v_actor_id UUID := auth.uid();
    v_new_reserved INTEGER;
BEGIN
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RAISE EXCEPTION 'Quantity must be positive';
    END IF;

    SELECT *
    INTO v_inv
    FROM public.inventory
    WHERE store_product_id = p_store_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found for store_product_id %', p_store_product_id;
    END IF;

    IF v_inv.available_to_sell < p_qty THEN
        RAISE EXCEPTION 'Insufficient stock for store_product_id %: available %, requested %',
            p_store_product_id, v_inv.available_to_sell, p_qty;
    END IF;

    v_new_reserved := v_inv.reserved_qty + p_qty;

    UPDATE public.inventory
    SET reserved_qty = v_new_reserved
    WHERE id = v_inv.id;

    INSERT INTO public.inventory_movements (
        inventory_id,
        store_product_id,
        order_id,
        movement_type,
        qty_delta,
        on_hand_after,
        reserved_after,
        reason,
        actor_id
    )
    VALUES (
        v_inv.id,
        p_store_product_id,
        p_order_id,
        'reserve',
        -p_qty,
        v_inv.on_hand_qty,
        v_new_reserved,
        p_reason,
        v_actor_id
    );

    PERFORM public.record_audit_log(
        v_actor_id,
        'system',
        'inventory.reserve',
        'inventory',
        v_inv.id,
        jsonb_build_object('reserved_qty', v_inv.reserved_qty, 'available_to_sell', v_inv.available_to_sell),
        jsonb_build_object('reserved_qty', v_new_reserved, 'available_to_sell', v_inv.on_hand_qty - v_new_reserved),
        jsonb_build_object('order_id', p_order_id, 'qty', p_qty)
    );

    RETURN jsonb_build_object(
        'inventory_id', v_inv.id,
        'store_product_id', p_store_product_id,
        'on_hand_qty', v_inv.on_hand_qty,
        'reserved_qty', v_new_reserved,
        'available_to_sell', v_inv.on_hand_qty - v_new_reserved
    );
END;
$$;

-- ============================================================================
-- 3. ATOMIC INVENTORY RELEASE (SELECT ... FOR UPDATE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.release_inventory(
    p_store_product_id UUID,
    p_qty INTEGER,
    p_order_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'order_cancellation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_inv public.inventory%ROWTYPE;
    v_actor_id UUID := auth.uid();
    v_new_reserved INTEGER;
BEGIN
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RAISE EXCEPTION 'Quantity must be positive';
    END IF;

    SELECT *
    INTO v_inv
    FROM public.inventory
    WHERE store_product_id = p_store_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found for store_product_id %', p_store_product_id;
    END IF;

    IF v_inv.reserved_qty < p_qty THEN
        RAISE EXCEPTION 'Cannot release % units when only % reserved for store_product_id %',
            p_qty, v_inv.reserved_qty, p_store_product_id;
    END IF;

    v_new_reserved := v_inv.reserved_qty - p_qty;

    UPDATE public.inventory
    SET reserved_qty = v_new_reserved
    WHERE id = v_inv.id;

    INSERT INTO public.inventory_movements (
        inventory_id,
        store_product_id,
        order_id,
        movement_type,
        qty_delta,
        on_hand_after,
        reserved_after,
        reason,
        actor_id
    )
    VALUES (
        v_inv.id,
        p_store_product_id,
        p_order_id,
        'release',
        p_qty,
        v_inv.on_hand_qty,
        v_new_reserved,
        p_reason,
        v_actor_id
    );

    PERFORM public.record_audit_log(
        v_actor_id,
        'system',
        'inventory.release',
        'inventory',
        v_inv.id,
        jsonb_build_object('reserved_qty', v_inv.reserved_qty, 'available_to_sell', v_inv.available_to_sell),
        jsonb_build_object('reserved_qty', v_new_reserved, 'available_to_sell', v_inv.on_hand_qty - v_new_reserved),
        jsonb_build_object('order_id', p_order_id, 'qty', p_qty)
    );

    RETURN jsonb_build_object(
        'inventory_id', v_inv.id,
        'store_product_id', p_store_product_id,
        'on_hand_qty', v_inv.on_hand_qty,
        'reserved_qty', v_new_reserved,
        'available_to_sell', v_inv.on_hand_qty - v_new_reserved
    );
END;
$$;

-- ============================================================================
-- 4. ATOMIC CHECKOUT ORDER CREATION (SERVER-SIDE PRICING & IDEMPOTENCY)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_checkout_order(
    p_cart_id UUID,
    p_delivery_address_id UUID,
    p_payment_method TEXT,
    p_idempotency_key TEXT,
    p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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

    -- Server-side delivery fee calculation
    IF v_subtotal_paise >= v_zone.free_delivery_threshold_paise THEN
        v_delivery_fee_paise := 0;
    ELSE
        v_delivery_fee_paise := v_zone.base_delivery_fee_paise;
    END IF;

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
    v_total_paise := GREATEST(0, v_subtotal_paise + v_delivery_fee_paise - v_discount_paise);

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
        'discount_paise', v_discount_paise,
        'total_paise', v_total_paise
    );
END;
$$;

-- ============================================================================
-- 5. ATOMIC ORDER CANCELLATION WITH STOCK RELEASE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_order_and_release_stock(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'customer_cancelled'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_order public.orders%ROWTYPE;
    v_payment public.payments%ROWTYPE;
    v_item RECORD;
    v_next_status TEXT;
    v_actor_role TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT *
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF public.is_admin() THEN
        v_actor_role := 'admin';
    ELSIF public.is_merchant_owner_of_store(v_order.store_id) THEN
        v_actor_role := 'merchant';
    ELSIF v_order.customer_id = v_user_id THEN
        v_actor_role := 'customer';
    ELSE
        RAISE EXCEPTION 'Not authorized to cancel this order';
    END IF;

    IF v_order.status NOT IN ('created', 'payment_pending', 'placed', 'accepted', 'preparing', 'ready_for_pickup') THEN
        RAISE EXCEPTION 'Order in status % cannot be cancelled', v_order.status;
    END IF;

    IF v_actor_role = 'customer' AND v_order.status IN ('preparing', 'ready_for_pickup') THEN
        RAISE EXCEPTION 'Order already being prepared; contact support to cancel';
    END IF;

    -- Release reserved inventory in deterministic order
    FOR v_item IN
        SELECT store_product_id, qty
        FROM public.order_items
        WHERE order_id = v_order.id
        ORDER BY store_product_id
    LOOP
        PERFORM public.release_inventory(
            v_item.store_product_id,
            v_item.qty,
            v_order.id,
            COALESCE(p_reason, 'order_cancelled')
        );
    END LOOP;

    SELECT *
    INTO v_payment
    FROM public.payments
    WHERE order_id = v_order.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND AND v_payment.provider = 'razorpay' AND v_payment.status IN ('authorized', 'captured') THEN
        v_next_status := 'refund_pending';
        UPDATE public.payments
        SET status = 'refund_pending'
        WHERE id = v_payment.id;
    ELSE
        v_next_status := 'cancelled';
    END IF;

    UPDATE public.orders
    SET status = v_next_status,
        cancellation_reason = p_reason,
        cancelled_by = v_user_id,
        cancelled_at = now()
    WHERE id = v_order.id;

    UPDATE public.delivery_tasks
    SET status = 'cancelled'
    WHERE order_id = v_order.id
      AND status IN ('unassigned', 'assigned', 'accepted');

    PERFORM public.record_audit_log(
        v_user_id,
        v_actor_role,
        'order.cancel',
        'orders',
        v_order.id,
        jsonb_build_object('status', v_order.status),
        jsonb_build_object('status', v_next_status, 'cancellation_reason', p_reason),
        '{}'::jsonb
    );

    RETURN jsonb_build_object(
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'previous_status', v_order.status,
        'status', v_next_status
    );
END;
$$;

-- ============================================================================
-- 6. DARK STORE 500 ORDERS/DAY TRIGGER CHECK HELPER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_dark_store_readiness_metrics()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    WITH daily_orders AS (
        SELECT count(*)::INTEGER AS orders_last_24h
        FROM public.orders
        WHERE created_at >= now() - interval '24 hours'
          AND status NOT IN ('created', 'cancelled')
    ),
    flags AS (
        SELECT
            COALESCE(BOOL_OR(CASE WHEN key = 'dark_store_enabled' THEN is_enabled END), false) AS dark_store_enabled,
            COALESCE(MAX(CASE WHEN key = 'dark_store_daily_order_threshold' THEN int_value END), 500) AS threshold
        FROM public.feature_flags
    )
    SELECT jsonb_build_object(
        'orders_last_24h', d.orders_last_24h,
        'dark_store_daily_order_threshold', f.threshold,
        'dark_store_enabled', f.dark_store_enabled,
        'threshold_reached', d.orders_last_24h >= f.threshold
    )
    FROM daily_orders d, flags f;
$$;

REVOKE ALL ON FUNCTION public.record_audit_log(UUID, TEXT, TEXT, TEXT, UUID, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_inventory(UUID, INTEGER, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_inventory(UUID, INTEGER, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_checkout_order(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_and_release_stock(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dark_store_readiness_metrics() TO authenticated;
