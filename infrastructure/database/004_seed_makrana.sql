-- ZAFF-IT Makrana Pilot Seed Data
-- Merchant-fulfilled pilot first; Dark Store flag disabled until 500 orders/day.
-- All money in INTEGER paise; all timestamps in UTC.

SET timezone = 'UTC';

-- ============================================================================
-- 1. FEATURE FLAGS (500 ORDERS/DAY DARK STORE TRIGGER)
-- ============================================================================

INSERT INTO public.feature_flags (key, is_enabled, int_value, text_value, description)
VALUES
    ('dark_store_enabled', false, NULL, NULL, 'Activates ZAFF-IT dark store fulfillment once daily volume crosses threshold'),
    ('dark_store_daily_order_threshold', true, 500, NULL, 'Daily order threshold in Makrana to trigger dark store rollout'),
    ('makrana_pilot_mode', true, NULL, 'merchant_first', 'Makrana pilot runs merchant-fulfilled stores first'),
    ('cod_enabled', true, NULL, NULL, 'Allow Cash on Delivery at checkout'),
    ('razorpay_enabled', true, NULL, NULL, 'Allow Razorpay UPI/card payments at checkout')
ON CONFLICT (key) DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    int_value = EXCLUDED.int_value,
    text_value = EXCLUDED.text_value,
    description = EXCLUDED.description;

-- ============================================================================
-- 2. MAKRANA SERVICE ZONES
-- ============================================================================

INSERT INTO public.service_zones (
    id, code, name, city, state, center_lat, center_lng, radius_meters,
    base_delivery_fee_paise, free_delivery_threshold_paise, is_active
)
VALUES
    (
        '11111111-1111-4111-8111-111111111101',
        'MKN-CENTRAL',
        'Makrana Central & Railway Station',
        'Makrana',
        'Rajasthan',
        27.0378,
        74.7250,
        5000,
        2000,
        19900,
        true
    ),
    (
        '11111111-1111-4111-8111-111111111102',
        'MKN-BORAWAR-IND',
        'Makrana Borawar Road & Marble Mandi',
        'Makrana',
        'Rajasthan',
        27.0285,
        74.7420,
        6000,
        2500,
        24900,
        true
    )
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 3. SAMPLE MAKRANA MERCHANTS & STORES (MERCHANT-FULFILLED)
-- ============================================================================

INSERT INTO public.merchants (
    id, owner_user_id, business_name, legal_name, phone, kyc_status, commission_bps, is_active
)
VALUES
    (
        '22222222-2222-4222-8222-222222222201',
        NULL,
        'Makrana Super Kirana & Dairy',
        'Makrana Super Kirana Enterprises',
        '+919829000101',
        'verified',
        800,
        true
    ),
    (
        '22222222-2222-4222-8222-222222222202',
        NULL,
        'Marwar Fresh Mart',
        'Marwar Fresh Retail LLP',
        '+919829000102',
        'verified',
        900,
        true
    )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stores (
    id, merchant_id, service_zone_id, name, slug, fulfillment_type,
    address_line1, city, state, pincode, lat, lng, phone,
    is_open, opens_at, closes_at, prep_time_minutes, min_order_paise, is_active
)
VALUES
    (
        '33333333-3333-4333-8333-333333333301',
        '22222222-2222-4222-8222-222222222201',
        '11111111-1111-4111-8111-111111111101',
        'Makrana Super Kirana - Station Road',
        'makrana-super-kirana-station-road',
        'merchant',
        'Near Railway Station Circle, Main Bazaar',
        'Makrana',
        'Rajasthan',
        '341505',
        27.0382,
        74.7248,
        '+919829000101',
        true,
        '07:00:00',
        '22:30:00',
        8,
        4900,
        true
    ),
    (
        '33333333-3333-4333-8333-333333333302',
        '22222222-2222-4222-8222-222222222202',
        '11111111-1111-4111-8111-111111111102',
        'Marwar Fresh Mart - Borawar Road',
        'marwar-fresh-mart-borawar-road',
        'merchant',
        'Plot 14, Borawar Road, Near Marble Mandi Gate',
        'Makrana',
        'Rajasthan',
        '341505',
        27.0290,
        74.7412,
        '+919829000102',
        true,
        '07:30:00',
        '22:00:00',
        10,
        4900,
        true
    )
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 4. CANONICAL CATEGORIES & GROCERY PRODUCTS
-- ============================================================================

INSERT INTO public.categories (id, name, slug, sort_order, is_active)
VALUES
    ('44444444-4444-4444-8444-444444444401', 'Dairy & Breakfast', 'dairy-breakfast', 1, true),
    ('44444444-4444-4444-8444-444444444402', 'Atta, Rice & Dal', 'atta-rice-dal', 2, true),
    ('44444444-4444-4444-8444-444444444403', 'Edible Oils & Masala', 'oils-masala', 3, true),
    ('44444444-4444-4444-8444-444444444404', 'Snacks & Biscuits', 'snacks-biscuits', 4, true),
    ('44444444-4444-4444-8444-444444444405', 'Household & Cleaning', 'household-cleaning', 5, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (id, category_id, sku, name, slug, brand, unit_label, gst_bps, is_veg, is_active)
VALUES
    ('55555555-5555-4555-8555-555555555501', '44444444-4444-4444-8444-444444444401', 'ZAF-DAIRY-001', 'Amul Taaza Toned Milk', 'amul-taaza-toned-milk-500ml', 'Amul', '500 ml', 0, true, true),
    ('55555555-5555-4555-8555-555555555502', '44444444-4444-4444-8444-444444444401', 'ZAF-DAIRY-002', 'Amul Pasteurised Butter', 'amul-butter-100g', 'Amul', '100 g', 1200, true, true),
    ('55555555-5555-4555-8555-555555555503', '44444444-4444-4444-8444-444444444402', 'ZAF-STAPLE-001', 'Aashirvaad Shudh Chakki Atta', 'aashirvaad-chakki-atta-5kg', 'Aashirvaad', '5 kg', 0, true, true),
    ('55555555-5555-4555-8555-555555555504', '44444444-4444-4444-8444-444444444402', 'ZAF-STAPLE-002', 'India Gate Basmati Rice Rozana', 'india-gate-basmati-rozana-1kg', 'India Gate', '1 kg', 500, true, true),
    ('55555555-5555-4555-8555-555555555505', '44444444-4444-4444-8444-444444444403', 'ZAF-OIL-001', 'Fortune Sunlite Refined Sunflower Oil', 'fortune-sunlite-oil-1l', 'Fortune', '1 L', 500, true, true),
    ('55555555-5555-4555-8555-555555555506', '44444444-4444-4444-8444-444444444403', 'ZAF-SALT-001', 'Tata Salt Vacuum Evaporated', 'tata-salt-1kg', 'Tata', '1 kg', 0, true, true),
    ('55555555-5555-4555-8555-555555555507', '44444444-4444-4444-8444-444444444404', 'ZAF-SNACK-001', 'Parle-G Gold Biscuits', 'parle-g-gold-100g', 'Parle', '100 g', 1800, true, true),
    ('55555555-5555-4555-8555-555555555508', '44444444-4444-4444-8444-444444444405', 'ZAF-HOME-001', 'Surf Excel Easy Wash Detergent', 'surf-excel-easy-wash-1kg', 'Surf Excel', '1 kg', 1800, true, true)
ON CONFLICT (sku) DO NOTHING;

-- ============================================================================
-- 5. STORE-SCOPED PRICING & INVENTORY (PAISE)
-- ============================================================================

INSERT INTO public.store_products (id, store_id, product_id, mrp_paise, selling_price_paise, max_qty_per_order, is_available)
VALUES
    -- Store 1: Makrana Super Kirana
    ('66666666-6666-4666-8666-666666666101', '33333333-3333-4333-8333-333333333301', '55555555-5555-4555-8555-555555555501', 2800, 2700, 6, true),
    ('66666666-6666-4666-8666-666666666102', '33333333-3333-4333-8333-333333333301', '55555555-5555-4555-8555-555555555502', 6000, 5800, 4, true),
    ('66666666-6666-4666-8666-666666666103', '33333333-3333-4333-8333-333333333301', '55555555-5555-4555-8555-555555555503', 24500, 22900, 3, true),
    ('66666666-6666-4666-8666-666666666104', '33333333-3333-4333-8333-333333333301', '55555555-5555-4555-8555-555555555505', 15500, 14200, 4, true),
    ('66666666-6666-4666-8666-666666666105', '33333333-3333-4333-8333-333333333301', '55555555-5555-4555-8555-555555555506', 2800, 2700, 5, true),
    ('66666666-6666-4666-8666-666666666106', '33333333-3333-4333-8333-333333333301', '55555555-5555-4555-8555-555555555507', 1000, 1000, 10, true),
    -- Store 2: Marwar Fresh Mart
    ('66666666-6666-4666-8666-666666666201', '33333333-3333-4333-8333-333333333302', '55555555-5555-4555-8555-555555555501', 2800, 2800, 6, true),
    ('66666666-6666-4666-8666-666666666202', '33333333-3333-4333-8333-333333333302', '55555555-5555-4555-8555-555555555503', 24500, 23500, 3, true),
    ('66666666-6666-4666-8666-666666666203', '33333333-3333-4333-8333-333333333302', '55555555-5555-4555-8555-555555555504', 11500, 10800, 5, true),
    ('66666666-6666-4666-8666-666666666204', '33333333-3333-4333-8333-333333333302', '55555555-5555-4555-8555-555555555505', 15500, 14500, 4, true),
    ('66666666-6666-4666-8666-666666666205', '33333333-3333-4333-8333-333333333302', '55555555-5555-4555-8555-555555555508', 13500, 12800, 3, true)
ON CONFLICT (store_id, product_id) DO NOTHING;

INSERT INTO public.inventory (store_product_id, store_id, on_hand_qty, reserved_qty, low_stock_threshold)
VALUES
    ('66666666-6666-4666-8666-666666666101', '33333333-3333-4333-8333-333333333301', 40, 0, 5),
    ('66666666-6666-4666-8666-666666666102', '33333333-3333-4333-8333-333333333301', 25, 0, 4),
    ('66666666-6666-4666-8666-666666666103', '33333333-3333-4333-8333-333333333301', 18, 0, 3),
    ('66666666-6666-4666-8666-666666666104', '33333333-3333-4333-8333-333333333301', 30, 0, 5),
    ('66666666-6666-4666-8666-666666666105', '33333333-3333-4333-8333-333333333301', 50, 0, 10),
    ('66666666-6666-4666-8666-666666666106', '33333333-3333-4333-8333-333333333301', 60, 0, 10),
    ('66666666-6666-4666-8666-666666666201', '33333333-3333-4333-8333-333333333302', 35, 0, 5),
    ('66666666-6666-4666-8666-666666666202', '33333333-3333-4333-8333-333333333302', 20, 0, 3),
    ('66666666-6666-4666-8666-666666666203', '33333333-3333-4333-8333-333333333302', 24, 0, 5),
    ('66666666-6666-4666-8666-666666666204', '33333333-3333-4333-8333-333333333302', 28, 0, 5),
    ('66666666-6666-4666-8666-666666666205', '33333333-3333-4333-8333-333333333302', 22, 0, 4)
ON CONFLICT (store_product_id) DO NOTHING;

-- Sample Makrana launch promo
INSERT INTO public.promotions (
    code, title, description, discount_type, discount_value, max_discount_paise,
    min_order_paise, service_zone_id, usage_limit, starts_at, ends_at, is_active
)
VALUES (
    'ZAFFMAKRANA',
    'Makrana Launch Offer',
    'Flat ₹25 off on orders above ₹199 in Makrana Central',
    'flat_paise',
    2500,
    2500,
    19900,
    '11111111-1111-4111-8111-111111111101',
    1000,
    now(),
    now() + interval '90 days',
    true
)
ON CONFLICT (code) DO NOTHING;
