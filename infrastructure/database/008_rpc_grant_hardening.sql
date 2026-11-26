-- =============================================================================
-- ZAFF-IT 008 — RPC EXECUTE-GRANT HARDENING
--
-- SWEEP FINDING (2026-11-26): 003's REVOKE block was committed to the repo
-- AFTER migration 003 had already been applied to this database, so the live
-- ACLs never received it. Supabase default privileges then granted EXECUTE on
-- every new function to anon/authenticated. Result: SECURITY DEFINER functions
-- (RLS bypass) like record_audit_log / reserve_inventory / release_inventory
-- were callable by unauthenticated clients (audit-log forging + stock
-- manipulation), and the admin readiness metrics RPC leaked aggregates to anon.
--
-- Principle of least privilege (APPLIED to prod + verified):
--   * record_audit_log / reserve_inventory / release_inventory -> service_role ONLY
--   * get_dark_store_readiness_metrics / create_checkout_order /
--     cancel_order_and_release_stock -> authenticated
--   * is_admin / has_role / is_merchant_owner_of_store / is_rider_for_order
--     / get_store_catalogue -> anon + authenticated (RLS predicates + public browse)
--   * check_rate_limit unchanged (006 already correct)
-- =============================================================================

REVOKE ALL ON FUNCTION public.record_audit_log(UUID, TEXT, TEXT, TEXT, UUID, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_inventory(UUID, INTEGER, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_inventory(UUID, INTEGER, UUID, TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_dark_store_readiness_metrics() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_checkout_order(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_order_and_release_stock(UUID, TEXT) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_merchant_owner_of_store(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_rider_for_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_store_catalogue(UUID, UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_checkout_order(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_and_release_stock(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dark_store_readiness_metrics() TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_merchant_owner_of_store(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_rider_for_order(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_catalogue(UUID, UUID, TEXT, INTEGER, INTEGER) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_audit_log(UUID, TEXT, TEXT, TEXT, UUID, JSONB, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_inventory(UUID, INTEGER, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_inventory(UUID, INTEGER, UUID, TEXT) TO service_role;

INSERT INTO public.audit_logs (actor_role, action, entity_type, entity_id, new_data)
VALUES (
    'system',
    'SECURITY_HARDENING_008_RPC_GRANTS',
    'functions',
    NULL,
    '{"change": "Applied 003 REVOKE block that never reached live DB; least-privilege EXECUTE grants — audit/reserve/release now service_role-only; anon kept only on boolean RLS predicates + public catalogue"}'::JSONB
);
