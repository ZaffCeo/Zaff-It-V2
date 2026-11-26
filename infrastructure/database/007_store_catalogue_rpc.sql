-- =============================================================================
-- ZAFF-IT 007 — get_store_catalogue RPC
--
-- BUG FIX (2026-11-26): CustomerHomeScreen calls supabase.rpc('get_store_catalogue')
-- but the function was never defined in 001-006, so every real-backend catalog
-- load failed and the app silently fell back to hardcoded FALLBACK_PRODUCTS.
-- This RPC provides the real store-scoped catalogue INCLUDING image_url so the
-- premium product cards can render actual product photography.
--
-- SECURITY INVOKER (default): RLS on stores/store_products/products/inventory
-- still applies to the caller. Ordering is deterministic for pagination.
--
-- Applied to prod (mglypwlmwzktxnvlomke) 2026-11-26 via connector; verified:
-- returns brand/image_url/category/unit + real paise pricing, in-stock first.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_store_catalogue(
    p_store_id    UUID,
    p_category_id UUID DEFAULT NULL,
    p_search      TEXT DEFAULT NULL,
    p_limit       INTEGER DEFAULT 30,
    p_offset      INTEGER DEFAULT 0
)
RETURNS TABLE (
    product_id          UUID,
    name                TEXT,
    brand               TEXT,
    image_url           TEXT,
    category_id         UUID,
    category_name       TEXT,
    unit_label          TEXT,
    mrp_paise           INTEGER,
    selling_price_paise INTEGER,
    available_to_sell   INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT
        p.id                AS product_id,
        p.name              AS name,
        p.brand             AS brand,
        p.image_url         AS image_url,
        c.id                AS category_id,
        c.name              AS category_name,
        p.unit_label        AS unit_label,
        sp.mrp_paise        AS mrp_paise,
        sp.selling_price_paise AS selling_price_paise,
        COALESCE(inv.available_to_sell, 0) AS available_to_sell
    FROM public.store_products sp
    JOIN public.products p   ON p.id = sp.product_id
    JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.inventory inv
           ON inv.store_product_id = sp.id
    WHERE sp.store_id = p_store_id
      AND sp.is_available = TRUE
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (
            p_search IS NULL
            OR p_search = ''
            OR p.name ILIKE '%' || p_search || '%'
            OR p.brand ILIKE '%' || p_search || '%'
            OR c.name ILIKE '%' || p_search || '%'
          )
    ORDER BY
        (COALESCE(inv.available_to_sell, 0) > 0) DESC,
        c.sort_order NULLS LAST,
        p.name ASC,
        p.id ASC
    LIMIT GREATEST(1, LEAST(100, COALESCE(p_limit, 30)))
    OFFSET GREATEST(0, COALESCE(p_offset, 0))
$$;

GRANT EXECUTE ON FUNCTION public.get_store_catalogue(UUID, UUID, TEXT, INTEGER, INTEGER) TO authenticated, anon;

INSERT INTO public.audit_logs (actor_role, action, entity_type, entity_id, new_data)
VALUES (
    'system',
    'MIGRATION_007_STORE_CATALOGUE_RPC',
    'functions',
    NULL,
    '{"change": "Added get_store_catalogue (store-scoped, search, category, pagination, image_url) — fixes missing-RPC silent fallback"}'::JSONB
);
