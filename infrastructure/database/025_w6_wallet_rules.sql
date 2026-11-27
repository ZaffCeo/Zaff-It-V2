-- ============================================================================
-- 025_w6_wallet_rules.sql
-- W6 (doc §wallet align): closed-PPI wallet rules on top of wallet_ledger.
--
-- Coin valuation (consistent with app WalletScreen + earn rules):
--   10 coins = ₹1 (1 coin = 10 paise). "Har ₹10 kharch par 1 coin".
--
-- Doc rules implemented:
--   R1 Wallet usable ≤ 10% of product value per order (floor to whole coins).
--   R2 Max wallet balance ₹10,000 (= 100,000 coins) — grants beyond cap are
--      rejected; refunds clamp silently to cap (never fake money).
--   R3 Bonus/earn credits expire after 90 days; refund credits after 180 days.
--      Expiry sweep (pg_cron daily 00:10 IST) zeroes expired remaining and
--      writes negative 'expire' audit entries.
--   R4 ₹100 (= 1000 coins) bonus for first 500 users (counter-guarded RPC).
--   R5 Wallet NEVER pays delivery/handling: it debits only against product
--      payable (subtotal − coupon), and the free-delivery threshold is checked
--      on payable-after-wallet basis (doc §6 note).
--   R6 Cancelled orders refund wallet coins with 180-day expiry (cancel RPC).
-- ============================================================================

-- 1) wallet_ledger: expiry + remaining tracking ------------------------------
ALTER TABLE public.wallet_ledger
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'earn',
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS remaining_coins INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.wallet_ledger
    DROP CONSTRAINT IF EXISTS wallet_ledger_source_chk;
ALTER TABLE public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_source_chk
    CHECK (source_type IN ('earn', 'bonus', 'refund', 'redeem', 'expire', 'topup', 'adjust'));

ALTER TABLE public.wallet_ledger
    DROP CONSTRAINT IF EXISTS wallet_ledger_credit_chk;
ALTER TABLE public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_credit_chk
    CHECK (
        (source_type IN ('earn', 'bonus', 'refund', 'topup') AND coins > 0 AND remaining_coins BETWEEN 0 AND coins)
        OR (source_type IN ('redeem', 'expire', 'adjust') AND coins <= 0 AND remaining_coins = 0)
    );

-- Backfill existing earn rows: 90-day expiry from created_at
UPDATE public.wallet_ledger
SET source_type = 'earn',
    remaining_coins = coins,
    expires_at = created_at + INTERVAL '90 days'
WHERE source_type = 'earn' AND remaining_coins = 0 AND coins > 0;

-- 2) Spendable balance (unexpired remaining credits) -------------------------
CREATE OR REPLACE FUNCTION public.wallet_spendable(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT COALESCE(SUM(remaining_coins), 0)::INTEGER
    FROM public.wallet_ledger
    WHERE user_id = p_user_id
      AND source_type IN ('earn', 'bonus', 'refund', 'topup')
      AND (expires_at IS NULL OR expires_at > now())
$function$;

-- 3) Crediting helper (cap-aware) --------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_credit(
    p_user_id UUID,
    p_coins INTEGER,
    p_source_type TEXT,
    p_reason TEXT,
    p_expiry_days INTEGER DEFAULT NULL,
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_clamp_to_cap BOOLEAN DEFAULT false
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_balance INTEGER;
    v_credit INTEGER;
BEGIN
    IF p_coins <= 0 THEN
        RAISE EXCEPTION 'wallet_credit: coins must be positive';
    END IF;
    IF p_source_type NOT IN ('earn', 'bonus', 'refund', 'topup') THEN
        RAISE EXCEPTION 'wallet_credit: invalid source_type %', p_source_type;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 77));

    v_balance := public.wallet_spendable(p_user_id);
    v_credit := p_coins;

    -- R2: max balance ₹10,000 = 100,000 coins
    IF v_balance + v_credit > 100000 THEN
        IF p_clamp_to_cap THEN
            v_credit := GREATEST(0, 100000 - v_balance);
        ELSE
            RAISE EXCEPTION 'Wallet limit exceeded: max balance is 100000 coins';
        END IF;
    END IF;
    IF v_credit <= 0 THEN
        RETURN 0;
    END IF;

    INSERT INTO public.wallet_ledger (
        user_id, entry_type, source_type, coins, remaining_coins, reason,
        reference_type, reference_id, balance_after, expires_at
    ) VALUES (
        p_user_id, p_source_type, p_source_type, v_credit, v_credit, p_reason,
        p_reference_type, p_reference_id, v_balance + v_credit,
        CASE WHEN p_expiry_days IS NOT NULL
             THEN now() + make_interval(days => p_expiry_days)
             ELSE NULL END
    );

    RETURN v_credit;
END;
$function$;

-- award_coins (existing signature, W3 callers) now routes through cap + 90d expiry
CREATE OR REPLACE FUNCTION public.award_coins(
    p_user_id UUID,
    p_coins INTEGER,
    p_reason TEXT,
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_credited INTEGER;
BEGIN
    v_credited := public.wallet_credit(
        p_user_id, p_coins, 'earn', p_reason, 90, p_reference_type, p_reference_id, false
    );
    RETURN public.wallet_spendable(p_user_id);
END;
$function$;

-- 4) FIFO redemption (earliest-expiring credits consumed first) --------------
CREATE OR REPLACE FUNCTION public.wallet_redeem(
    p_user_id UUID,
    p_coins INTEGER,
    p_reason TEXT,
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_avail INTEGER;
    v_need INTEGER;
    v_redeemed INTEGER := 0;
    v_take INTEGER;
    r RECORD;
BEGIN
    IF p_coins <= 0 THEN
        RAISE EXCEPTION 'wallet_redeem: coins must be positive';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 77));

    v_avail := public.wallet_spendable(p_user_id);
    v_need := LEAST(p_coins, v_avail);
    IF v_need <= 0 THEN
        RETURN 0;
    END IF;

    FOR r IN
        SELECT id, remaining_coins
        FROM public.wallet_ledger
        WHERE user_id = p_user_id
          AND source_type IN ('earn', 'bonus', 'refund', 'topup')
          AND (expires_at IS NULL OR expires_at > now())
          AND remaining_coins > 0
        ORDER BY expires_at NULLS LAST, created_at ASC
        FOR UPDATE
    LOOP
        EXIT WHEN v_need <= 0;
        v_take := LEAST(r.remaining_coins, v_need);
        UPDATE public.wallet_ledger
        SET remaining_coins = remaining_coins - v_take
        WHERE id = r.id;
        v_need := v_need - v_take;
        v_redeemed := v_redeemed + v_take;
    END LOOP;

    INSERT INTO public.wallet_ledger (
        user_id, entry_type, source_type, coins, remaining_coins, reason,
        reference_type, reference_id, balance_after
    ) VALUES (
        p_user_id, 'redeem', 'redeem', -v_redeemed, 0, p_reason,
        p_reference_type, p_reference_id, public.wallet_spendable(p_user_id)
    );

    RETURN v_redeemed;
END;
$function$;

-- 5) Daily expiry sweep (cron 00:10 IST = 18:40 UTC) --------------------------
CREATE OR REPLACE FUNCTION public.expire_wallet_credits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user RECORD;
    v_entry RECORD;
    v_expired_total INTEGER;
    v_users INTEGER := 0;
BEGIN
    FOR v_user IN
        SELECT DISTINCT user_id
        FROM public.wallet_ledger
        WHERE source_type IN ('earn', 'bonus', 'refund', 'topup')
          AND expires_at IS NOT NULL
          AND expires_at <= now()
          AND remaining_coins > 0
    LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended(v_user.user_id::TEXT, 77));
        v_expired_total := 0;

        FOR v_entry IN
            SELECT id, remaining_coins
            FROM public.wallet_ledger
            WHERE user_id = v_user.user_id
              AND source_type IN ('earn', 'bonus', 'refund', 'topup')
              AND expires_at IS NOT NULL
              AND expires_at <= now()
              AND remaining_coins > 0
            FOR UPDATE
        LOOP
            v_expired_total := v_expired_total + v_entry.remaining_coins;
            UPDATE public.wallet_ledger
            SET remaining_coins = 0
            WHERE id = v_entry.id;
        END LOOP;

        IF v_expired_total > 0 THEN
            INSERT INTO public.wallet_ledger (
                user_id, entry_type, source_type, coins, remaining_coins, reason, balance_after
            ) VALUES (
                v_user.user_id, 'expire', 'expire', -v_expired_total, 0,
                'Credits expired (' || v_expired_total || ' coins, 90/180-day rule)',
                public.wallet_spendable(v_user.user_id)
            );
            v_users := v_users + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('users_swept', v_users);
END;
$function$;

SELECT cron.unschedule('zaff-wallet-expiry')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zaff-wallet-expiry');

SELECT cron.schedule('zaff-wallet-expiry', '40 18 * * *',
    $$SELECT public.expire_wallet_credits();$$);

-- 6) First-500 ₹100 bonus (1000 coins, 90-day expiry) ------------------------
CREATE TABLE IF NOT EXISTS public.wallet_first500_grants (
    singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
    granted_count INTEGER NOT NULL DEFAULT 0
);
INSERT INTO public.wallet_first500_grants (singleton) VALUES (true)
ON CONFLICT DO NOTHING;

ALTER TABLE public.wallet_first500_grants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_first500_bonus()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_credited INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.wallet_ledger
        WHERE user_id = v_user_id
          AND source_type = 'bonus'
          AND reference_type = 'first500'
    ) THEN
        RAISE EXCEPTION 'First 500 bonus already claimed';
    END IF;

    -- R4: strictly first 500 users (atomic counter)
    UPDATE public.wallet_first500_grants
    SET granted_count = granted_count + 1
    WHERE singleton AND granted_count < 500;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'First 500 bonus fully claimed';
    END IF;

    v_credited := public.wallet_credit(
        v_user_id, 1000, 'bonus', 'First 500 users bonus (Rs100)',
        90, 'first500', v_user_id, false
    );

    PERFORM public.record_audit_log(
        v_user_id,
        'customer',
        'wallet.first500_claim',
        'wallet_ledger',
        NULL,
        NULL,
        jsonb_build_object('credited_coins', v_credited),
        jsonb_build_object('source', 'first500')
    );

    RETURN jsonb_build_object(
        'ok', true,
        'credited_coins', v_credited,
        'balance_coins', public.wallet_spendable(v_user_id)
    );
END;
$function$;

-- 7) orders: wallet usage columns --------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS wallet_coins_used INTEGER NOT NULL DEFAULT 0
        CHECK (wallet_coins_used >= 0),
    ADD COLUMN IF NOT EXISTS wallet_discount_paise INTEGER NOT NULL DEFAULT 0
        CHECK (wallet_discount_paise >= 0);

-- 8) create_checkout_order v3: wallet rules (R1/R5) ---------------------------
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

    -- Coupon (product value basis)
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

    -- W6 wallet (R1 <= 10% of product value; R5 product payable only).
    -- 10 coins = Rs1 -> 10% of subtotal in coins = subtotal_paise / 100.
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

    -- Distance slabs (doc §6); free threshold on PAYABLE products (after wallet)
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

    IF v_zone.launch_free_delivery THEN
        v_delivery_fee_paise := 0; -- doc: first month free delivery
    ELSIF v_payable_products >= v_zone.free_delivery_threshold_paise THEN
        v_delivery_fee_paise := 0;
    ELSIF v_distance_m IS NULL THEN
        v_delivery_fee_paise := v_zone.base_delivery_fee_paise;
    ELSIF v_distance_m <= 3000 THEN
        v_delivery_fee_paise := 2500; -- 0-3 km Rs25
    ELSIF v_distance_m <= 6000 THEN
        v_delivery_fee_paise := 3000; -- 3-6 km Rs30
    ELSE
        v_delivery_fee_paise := 5000; -- 6-10 km Rs50
    END IF;

    -- Handling (doc §6): Rs5 cart < Rs199 / Rs10 >= Rs199 — never wallet-paid
    v_handling_fee_paise := CASE WHEN v_subtotal_paise < 19900 THEN 500 ELSE 1000 END;

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

    -- Wallet debit in the same transaction (rollback-safe); FIFO by expiry
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

    -- Link redeem entries to the order
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
            'wallet_coins_used', v_wallet_coins
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
        'total_paise', v_total_paise
    );
END;
$function$;

-- 9) cancel_order_and_release_stock v2: wallet refund (R6, 180-day) -----------
CREATE OR REPLACE FUNCTION public.cancel_order_and_release_stock(p_order_id uuid, p_reason text DEFAULT 'customer_cancelled'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_order public.orders%ROWTYPE;
    v_payment public.payments%ROWTYPE;
    v_item RECORD;
    v_next_status TEXT;
    v_actor_role TEXT;
    v_wallet_refund_coins INTEGER := 0;
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

    -- W6 R6: wallet coins return with 180-day expiry (clamped to Rs10k cap)
    IF v_order.wallet_coins_used > 0 THEN
        v_wallet_refund_coins := public.wallet_credit(
            v_order.customer_id,
            v_order.wallet_coins_used,
            'refund',
            'Order ' || v_order.order_number || ' cancelled refund',
            180,
            'order',
            v_order.id,
            true
        );
    END IF;

    PERFORM public.record_audit_log(
        v_user_id,
        v_actor_role,
        'order.cancel',
        'orders',
        v_order.id,
        jsonb_build_object('status', v_order.status),
        jsonb_build_object('status', v_next_status, 'cancellation_reason', p_reason, 'wallet_refund_coins', v_wallet_refund_coins),
        '{}'::jsonb
    );

    RETURN jsonb_build_object(
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'previous_status', v_order.status,
        'status', v_next_status,
        'wallet_refund_coins', v_wallet_refund_coins
    );
END;
$function$;

-- 10) Grants -------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.wallet_spendable(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wallet_spendable(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.wallet_credit(UUID, INTEGER, TEXT, TEXT, INTEGER, TEXT, UUID, BOOLEAN) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_redeem(UUID, INTEGER, TEXT, TEXT, UUID) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_wallet_credits() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_coins(UUID, INTEGER, TEXT, TEXT, UUID) FROM public, anon;

REVOKE ALL ON FUNCTION public.claim_first500_bonus() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_first500_bonus() TO authenticated;
