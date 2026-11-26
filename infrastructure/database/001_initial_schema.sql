-- ZAFF-IT Canonical PostgreSQL Schema (Free-Tier & Supabase Compatible)
-- Developer Handoff v1.0 | Clean-Room Implementation
-- Rules: All money in INTEGER paise (never floats); all timestamps TIMESTAMPTZ in UTC.

SET timezone = 'UTC';

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. UTILITY FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at_utc()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. IDENTITY, ROLES & ADDRESSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 1),
    phone TEXT UNIQUE,
    email TEXT,
    avatar_url TEXT,
    preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'hi', 'hinglish')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('customer', 'merchant', 'rider', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT 'Home',
    recipient_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    line1 TEXT NOT NULL,
    line2 TEXT,
    landmark TEXT,
    city TEXT NOT NULL DEFAULT 'Makrana',
    state TEXT NOT NULL DEFAULT 'Rajasthan',
    pincode TEXT NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
    lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. SERVICE ZONES, MERCHANTS & STORES (MERCHANT + DARK STORE READY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.service_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'Rajasthan',
    center_lat DOUBLE PRECISION NOT NULL CHECK (center_lat BETWEEN -90 AND 90),
    center_lng DOUBLE PRECISION NOT NULL CHECK (center_lng BETWEEN -180 AND 180),
    radius_meters INTEGER NOT NULL CHECK (radius_meters > 0),
    geojson_polygon JSONB,
    base_delivery_fee_paise INTEGER NOT NULL DEFAULT 2000 CHECK (base_delivery_fee_paise >= 0),
    free_delivery_threshold_paise INTEGER NOT NULL DEFAULT 19900 CHECK (free_delivery_threshold_paise >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    business_name TEXT NOT NULL,
    legal_name TEXT,
    gstin TEXT,
    fssai_license TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    kyc_status TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'rejected', 'suspended')),
    commission_bps INTEGER NOT NULL DEFAULT 1000 CHECK (commission_bps BETWEEN 0 AND 10000),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
    service_zone_id UUID NOT NULL REFERENCES public.service_zones(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    fulfillment_type TEXT NOT NULL DEFAULT 'merchant' CHECK (fulfillment_type IN ('merchant', 'dark_store')),
    address_line1 TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT 'Makrana',
    state TEXT NOT NULL DEFAULT 'Rajasthan',
    pincode TEXT NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
    lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    phone TEXT NOT NULL,
    is_open BOOLEAN NOT NULL DEFAULT true,
    opens_at TIME NOT NULL DEFAULT '07:00:00',
    closes_at TIME NOT NULL DEFAULT '22:30:00',
    prep_time_minutes INTEGER NOT NULL DEFAULT 10 CHECK (prep_time_minutes >= 1),
    min_order_paise INTEGER NOT NULL DEFAULT 4900 CHECK (min_order_paise >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. CANONICAL CATALOG, STORE PRICING & ATOMIC INVENTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    icon_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    sku TEXT NOT NULL UNIQUE,
    barcode TEXT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    brand TEXT,
    description TEXT,
    unit_label TEXT NOT NULL,
    image_url TEXT,
    gst_bps INTEGER NOT NULL DEFAULT 0 CHECK (gst_bps BETWEEN 0 AND 2800),
    is_veg BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    mrp_paise INTEGER NOT NULL CHECK (mrp_paise > 0),
    selling_price_paise INTEGER NOT NULL CHECK (selling_price_paise > 0 AND selling_price_paise <= mrp_paise),
    max_qty_per_order INTEGER NOT NULL DEFAULT 10 CHECK (max_qty_per_order > 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_product_id UUID NOT NULL UNIQUE REFERENCES public.store_products(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    on_hand_qty INTEGER NOT NULL DEFAULT 0 CHECK (on_hand_qty >= 0),
    reserved_qty INTEGER NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0 AND reserved_qty <= on_hand_qty),
    available_to_sell INTEGER GENERATED ALWAYS AS (on_hand_qty - reserved_qty) STORED,
    low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    store_product_id UUID NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
    order_id UUID,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('restock', 'reserve', 'release', 'deduct', 'adjustment', 'return')),
    qty_delta INTEGER NOT NULL,
    on_hand_after INTEGER NOT NULL CHECK (on_hand_after >= 0),
    reserved_after INTEGER NOT NULL CHECK (reserved_after >= 0),
    reason TEXT,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. CARTS, ORDERS & ORDER ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    coupon_code TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'abandoned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- MVP guardrail: one active single-store basket per customer at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_carts_one_active_per_user
    ON public.carts (user_id)
    WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
    store_product_id UUID NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
    qty INTEGER NOT NULL CHECK (qty > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (cart_id, store_product_id)
);

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    service_zone_id UUID NOT NULL REFERENCES public.service_zones(id) ON DELETE RESTRICT,
    delivery_address_id UUID REFERENCES public.addresses(id) ON DELETE SET NULL,
    delivery_address_snapshot JSONB NOT NULL,
    fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('merchant', 'dark_store')),
    status TEXT NOT NULL DEFAULT 'created' CHECK (
        status IN (
            'created',
            'payment_pending',
            'placed',
            'accepted',
            'preparing',
            'ready_for_pickup',
            'rider_assigned',
            'picked_up',
            'out_for_delivery',
            'delivered',
            'cancelled',
            'refund_pending',
            'refunded'
        )
    ),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('razorpay', 'cod')),
    subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise >= 0),
    tax_paise INTEGER NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
    delivery_fee_paise INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_paise >= 0),
    discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
    total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
    coupon_code TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    placed_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    store_product_id UUID NOT NULL REFERENCES public.store_products(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name_snapshot TEXT NOT NULL,
    unit_label_snapshot TEXT NOT NULL,
    qty INTEGER NOT NULL CHECK (qty > 0),
    mrp_paise INTEGER NOT NULL CHECK (mrp_paise > 0),
    unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise > 0),
    gst_bps INTEGER NOT NULL DEFAULT 0 CHECK (gst_bps BETWEEN 0 AND 2800),
    tax_paise INTEGER NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
    line_total_paise INTEGER NOT NULL CHECK (line_total_paise >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. PAYMENTS, REFUNDS & SETTLEMENT LEDGER
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL CHECK (provider IN ('razorpay', 'cod')),
    razorpay_order_id TEXT UNIQUE,
    razorpay_payment_id TEXT UNIQUE,
    razorpay_signature TEXT,
    amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
    status TEXT NOT NULL DEFAULT 'created' CHECK (
        status IN ('created', 'authorized', 'captured', 'failed', 'refund_pending', 'refunded')
    ),
    webhook_verified BOOLEAN NOT NULL DEFAULT false,
    webhook_payload JSONB,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    razorpay_refund_id TEXT UNIQUE,
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
    idempotency_key TEXT NOT NULL UNIQUE,
    initiated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settlement_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    order_id UUID REFERENCES public.orders(id) ON DELETE RESTRICT,
    entry_type TEXT NOT NULL CHECK (
        entry_type IN ('order_credit', 'commission_debit', 'refund_debit', 'payout_debit', 'adjustment')
    ),
    gross_amount_paise INTEGER NOT NULL,
    commission_paise INTEGER NOT NULL DEFAULT 0 CHECK (commission_paise >= 0),
    net_amount_paise INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'reversed')),
    payout_reference TEXT,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 7. DELIVERY TASKS & RIDER TELEMETRY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.delivery_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    rider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'unassigned' CHECK (
        status IN (
            'unassigned',
            'assigned',
            'accepted',
            'arrived_store',
            'picked_up',
            'arrived_customer',
            'delivered',
            'failed',
            'cancelled'
        )
    ),
    pickup_otp TEXT,
    delivery_otp TEXT,
    distance_meters INTEGER CHECK (distance_meters IS NULL OR distance_meters >= 0),
    rider_payout_paise INTEGER NOT NULL DEFAULT 0 CHECK (rider_payout_paise >= 0),
    assigned_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rider_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    delivery_task_id UUID REFERENCES public.delivery_tasks(id) ON DELETE SET NULL,
    lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    heading REAL,
    speed_mps REAL,
    accuracy_meters REAL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 8. PROMOTIONS, SUPPORT, AUDIT LOGS & FEATURE FLAGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('flat_paise', 'percent_bps')),
    discount_value INTEGER NOT NULL CHECK (discount_value > 0),
    max_discount_paise INTEGER CHECK (max_discount_paise IS NULL OR max_discount_paise > 0),
    min_order_paise INTEGER NOT NULL DEFAULT 0 CHECK (min_order_paise >= 0),
    service_zone_id UUID REFERENCES public.service_zones(id) ON DELETE SET NULL,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    category TEXT NOT NULL CHECK (
        category IN ('order_issue', 'payment_refund', 'missing_item', 'delivery_delay', 'account_privacy', 'other')
    ),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feature_flags (
    key TEXT PRIMARY KEY,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    int_value INTEGER,
    text_value TEXT,
    json_value JSONB,
    description TEXT,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 9. INDEXES FOR FREE-TIER QUERY PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_merchants_owner_user_id ON public.merchants (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_stores_merchant_id ON public.stores (merchant_id);
CREATE INDEX IF NOT EXISTS idx_stores_zone_active ON public.stores (service_zone_id, is_active, is_open);
CREATE INDEX IF NOT EXISTS idx_categories_parent_sort ON public.categories (parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_category_active ON public.products (category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_store_products_store_avail ON public.store_products (store_id, is_available);
CREATE INDEX IF NOT EXISTS idx_inventory_store_id ON public.inventory (store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_inv_created ON public.inventory_movements (inventory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order_id ON public.inventory_movements (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items (cart_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON public.orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_store_status_created ON public.orders (store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_zone_created ON public.orders (service_zone_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON public.refunds (order_id);
CREATE INDEX IF NOT EXISTS idx_settlement_ledger_merchant_created ON public.settlement_ledger (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_tasks_rider_status ON public.delivery_tasks (rider_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_tasks_store_status ON public.delivery_tasks (store_id, status);
CREATE INDEX IF NOT EXISTS idx_rider_locations_rider_recorded ON public.rider_locations (rider_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_locations_task_recorded ON public.rider_locations (delivery_task_id, recorded_at DESC) WHERE delivery_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status ON public.support_tickets (user_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at DESC);

-- ============================================================================
-- 10. UPDATED_AT TRIGGERS
-- ============================================================================

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'profiles',
        'addresses',
        'service_zones',
        'merchants',
        'stores',
        'categories',
        'products',
        'store_products',
        'inventory',
        'carts',
        'cart_items',
        'orders',
        'payments',
        'refunds',
        'delivery_tasks',
        'promotions',
        'support_tickets',
        'feature_flags'
    ]
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;
             CREATE TRIGGER trg_%I_updated_at
             BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_utc();',
            tbl, tbl, tbl, tbl
        );
    END LOOP;
END;
$$;
