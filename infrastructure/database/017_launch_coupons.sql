-- ============================================================================
-- 017_launch_coupons.sql
-- Launch coupon for the Stitch home "ZAFFFIRST" banner:
--   "FIRST 3 ORDERS — Need-It? Zaff-It! — Flat ₹50 OFF on orders above ₹199"
-- Validates through public.validate_coupon + create_order(p_coupon_code)
-- (003/011). Client estimate mirrors this in applyLocalPromoTotals.
-- Idempotent.
-- ============================================================================

INSERT INTO public.coupons (
  code, description, discount_type, discount_value,
  max_discount_paise, min_order_paise,
  max_redemptions, per_user_limit, valid_from, valid_until, is_active
)
SELECT
  'ZAFFFIRST',
  'First 3 orders — Flat ₹50 OFF on orders above ₹199',
  'flat',
  5000,
  5000,
  19900,
  1000,
  3,
  now(),
  now() + INTERVAL '60 days',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.coupons WHERE upper(code) = 'ZAFFFIRST'
);
