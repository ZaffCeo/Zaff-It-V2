-- ============================================================================
-- 015_universal_search_and_khata.sql
-- Universal Search (Postgres FTS + trigram) and merchant Khata summary RPC.
-- Part of platform-enhancement wave (2026-11-26). Apply after 014_e2e_fixes.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extensions: trigram for fuzzy/partial matching alongside FTS.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 2. products.search_vector — weighted generated tsvector.
--    Hindi name weighted same as English name (low-literacy Hindi search).
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(hi_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(brand, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS products_search_vector_idx
  ON public.products USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON public.products USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS products_hi_name_trgm_idx
  ON public.products USING GIN (hi_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. search_products — universal, cross-store, ranked search.
--    Empty query degrades gracefully to a curated default list (available
--    first). Store-level availability respected via store_products +
--    inventory. Ranked by FTS ts_rank with trigram similarity boost for
--    typos/partial words.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_products(
    p_query       TEXT DEFAULT NULL,
    p_store_id    UUID DEFAULT NULL,
    p_category_id UUID DEFAULT NULL,
    p_limit       INTEGER DEFAULT 40
)
RETURNS TABLE (
    product_id          UUID,
    store_id            UUID,
    store_name          TEXT,
    name                TEXT,
    brand               TEXT,
    image_url           TEXT,
    category_id         UUID,
    category_name       TEXT,
    unit_label          TEXT,
    mrp_paise           INTEGER,
    selling_price_paise INTEGER,
    available_to_sell   INTEGER,
    rank                REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH q AS (
        SELECT NULLIF(btrim(coalesce(p_query, '')), '') AS text,
               websearch_to_tsquery('simple', coalesce(p_query, '')) AS tsq
    )
    SELECT
        p.id                AS product_id,
        sp.store_id         AS store_id,
        s.name              AS store_name,
        p.name              AS name,
        p.brand             AS brand,
        p.image_url         AS image_url,
        c.id                AS category_id,
        c.name              AS category_name,
        p.unit_label        AS unit_label,
        sp.mrp_paise        AS mrp_paise,
        sp.selling_price_paise AS selling_price_paise,
        COALESCE(inv.available_to_sell, 0) AS available_to_sell,
        CASE WHEN q.text IS NULL THEN 0 ELSE (
            ts_rank(p.search_vector, q.tsq) * 4
            + similarity(lower(p.name), lower(q.text))
            + similarity(lower(coalesce(p.hi_name, '')), lower(q.text))
        ) END AS rank
    FROM public.store_products sp
    JOIN public.products p   ON p.id = sp.product_id AND p.is_active
    JOIN public.categories c ON c.id = p.category_id AND c.is_active
    JOIN public.stores s     ON s.id = sp.store_id AND s.is_active
    LEFT JOIN public.inventory inv ON inv.store_product_id = sp.id
    CROSS JOIN q
    WHERE sp.is_available = TRUE
      AND (p_store_id IS NULL OR sp.store_id = p_store_id)
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (
            q.text IS NULL
            OR q.tsq @@ p.search_vector
            OR similarity(p.name, q.text) > 0.18
            OR similarity(coalesce(p.hi_name, ''), q.text) > 0.18
            OR p.brand ILIKE '%' || q.text || '%'
            OR c.name ILIKE '%' || q.text || '%'
          )
    ORDER BY
        rank DESC,
        (COALESCE(inv.available_to_sell, 0) > 0) DESC,
        sp.selling_price_paise ASC,
        p.name ASC,
        p.id ASC
    LIMIT GREATEST(1, LEAST(100, COALESCE(p_limit, 40)))
$$;

GRANT EXECUTE ON FUNCTION public.search_products(TEXT, UUID, UUID, INTEGER) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. merchant_khata_summary — "Aaj ka Khata" for the merchant dashboard.
--    Derives merchant from auth.uid() via merchants.owner_user_id; returns
--    today's order stats plus settlement ledger totals (pending vs settled).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merchant_khata_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant public.merchants;
  v_today_orders INTEGER;
  v_today_revenue BIGINT;
  v_today_commission BIGINT;
  v_pending BIGINT;
  v_settled BIGINT;
  v_lifetime_orders INTEGER;
BEGIN
  SELECT * INTO v_merchant FROM public.merchants
    WHERE owner_user_id = auth.uid()
    ORDER BY created_at
    LIMIT 1;

  IF v_merchant.id IS NULL THEN
    RETURN jsonb_build_object(
      'bound', false,
      'today_orders', 0,
      'today_revenue_paise', 0,
      'today_commission_paise', 0,
      'pending_paise', 0,
      'settled_paise', 0,
      'lifetime_orders', 0
    );
  END IF;

  SELECT count(*), COALESCE(sum(o.total_paise), 0)
    INTO v_today_orders, v_today_revenue
    FROM public.orders o
    WHERE o.store_id IN (SELECT st.id FROM public.stores st WHERE st.merchant_id = v_merchant.id)
      AND o.status IN ('delivered', 'out_for_delivery', 'picked_up', 'rider_assigned', 'ready_for_pickup', 'preparing', 'accepted')
      AND o.created_at >= date_trunc('day', now());

  SELECT COALESCE(sum(sl.commission_paise), 0) INTO v_today_commission
    FROM public.settlement_ledger sl
    WHERE sl.merchant_id = v_merchant.id
      AND sl.created_at >= date_trunc('day', now());

  SELECT COALESCE(sum(CASE WHEN sl.status = 'pending' THEN sl.net_amount_paise ELSE 0 END), 0),
         COALESCE(sum(CASE WHEN sl.status = 'settled' THEN sl.net_amount_paise ELSE 0 END), 0)
    INTO v_pending, v_settled
    FROM public.settlement_ledger sl
    WHERE sl.merchant_id = v_merchant.id;

  SELECT count(*) INTO v_lifetime_orders
    FROM public.orders o
    WHERE o.store_id IN (SELECT st.id FROM public.stores st WHERE st.merchant_id = v_merchant.id);

  RETURN jsonb_build_object(
    'bound', true,
    'today_orders', v_today_orders,
    'today_revenue_paise', v_today_revenue,
    'today_commission_paise', v_today_commission,
    'pending_paise', v_pending,
    'settled_paise', v_settled,
    'lifetime_orders', v_lifetime_orders
  );
END $$;

GRANT EXECUTE ON FUNCTION public.merchant_khata_summary() TO authenticated;
