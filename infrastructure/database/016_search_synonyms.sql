-- ============================================================================
-- 016_search_synonyms.sql
-- Search intelligence: Hindi / Hinglish / Devanagari synonym dictionary and
-- synonym-aware search_products (migration 015 introduced base FTS).
--
-- Architecture (per founder directive): normalization + dictionary resolution
-- happen SERVER-SIDE in Postgres. No AI calls per keystroke. AI (Zaffy)
-- remains a fallback for ambiguous conversational queries only.
--   1. query normalized (lowercase, collapsed whitespace)
--   2. words resolved against public.search_synonyms (alias -> canonical)
--   3. canonical terms searched as prefix tsqueries ('milk:*')
--   4. trigram typo tolerance + brand/category ILIKE as safety net
--   5. ranked by FTS + synonym hit + similarity
-- Non-destructive: new table + function replace + hi_name translations for
-- existing seed products (names only — no prices/attributes touched).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Synonym dictionary (public, read-only via RLS; service-role manages it).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.search_synonyms (
  alias     TEXT PRIMARY KEY,
  canonical TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.search_synonyms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS search_synonyms_read_all ON public.search_synonyms;
CREATE POLICY search_synonyms_read_all
  ON public.search_synonyms FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.search_synonyms (alias, canonical) VALUES
  -- Milk
  ('doodh', 'milk'), ('dudh', 'milk'), ('दूध', 'milk'), ('doodh-pila', 'milk'),
  -- Butter
  ('makkhan', 'butter'), ('मक्खन', 'butter'),
  -- Atta / flour
  ('aata', 'atta'), ('आटा', 'atta'), ('atta-gehu', 'atta'),
  -- Rice
  ('chawal', 'rice'), ('चावल', 'rice'), ('chaawal', 'rice'),
  -- Salt
  ('namak', 'salt'), ('नमक', 'salt'),
  -- Oil
  ('tel', 'oil'), ('तेल', 'oil'), ('tel-tel', 'oil'),
  -- Biscuit
  ('biskut', 'biscuit'), ('बिस्कुट', 'biscuit'), ('biscuits', 'biscuit'), ('biscuit', 'biscuit'),
  -- Detergent
  ('detergent', 'detergent'), ('washing-powder', 'detergent'), ('धुलाई', 'detergent'), ('सर्फ', 'detergent'),
  -- Common fresh-grocery intents (future catalogue, harmless now)
  ('aalu', 'potato'), ('aloo', 'potato'), ('आलू', 'potato'), ('potato', 'potato'),
  ('pyaaz', 'onion'), ('pyaz', 'onion'), ('प्याज़', 'onion'), ('onion', 'onion'),
  ('tamatar', 'tomato'), ('टमाटर', 'tomato'), ('tomato', 'tomato'),
  ('ghee', 'ghee'), ('घी', 'ghee'),
  ('cheeni', 'sugar'), ('shakkar', 'sugar'), ('चीनी', 'sugar'),
  ('dahi', 'curd'), ('दही', 'curd')
ON CONFLICT (alias) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Hindi names for existing seed products (pure name translations — same
--    products, no invented attributes). Powers Hindi tsvector weighting.
-- ---------------------------------------------------------------------------
UPDATE public.products SET hi_name = 'आशीर्वाद शुद्ध चक्की आटा'
  WHERE name = 'Aashirvaad Shudh Chakki Atta' AND coalesce(hi_name,'') = '';
UPDATE public.products SET hi_name = 'अमूल पाश्चराइज्ड मक्खन'
  WHERE name = 'Amul Pasteurised Butter' AND coalesce(hi_name,'') = '';
UPDATE public.products SET hi_name = 'अमूल ताज़ा टोन्ड दूध'
  WHERE name = 'Amul Taaza Toned Milk' AND coalesce(hi_name,'') = '';
UPDATE public.products SET hi_name = 'फॉर्च्यून सनलाइट रिफाइंड सनफ्लावर तेल'
  WHERE name = 'Fortune Sunlite Refined Sunflower Oil' AND coalesce(hi_name,'') = '';
UPDATE public.products SET hi_name = 'इंडिया गेट बासमती चावल रोज़ाना'
  WHERE name = 'India Gate Basmati Rice Rozana' AND coalesce(hi_name,'') = '';
UPDATE public.products SET hi_name = 'पारले-जी गोल्ड बिस्कुट'
  WHERE name = 'Parle-G Gold Biscuits' AND coalesce(hi_name,'') = '';
UPDATE public.products SET hi_name = 'सर्फ एक्सेल ईज़ी वॉश डिटर्जेंट'
  WHERE name = 'Surf Excel Easy Wash Detergent' AND coalesce(hi_name,'') = '';
UPDATE public.products SET hi_name = 'टाटा सॉल्ट वैक्यूम इवैपोरेटेड'
  WHERE name = 'Tata Salt Vacuum Evaporated' AND coalesce(hi_name,'') = '';

-- ---------------------------------------------------------------------------
-- 3. search_products v2 — synonym + prefix aware (replaces 015 version).
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
    WITH norm AS (
        SELECT btrim(lower(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g'))) AS n
    ),
    q AS (
        SELECT
            NULLIF(norm.n, '') AS text,
            websearch_to_tsquery('simple', coalesce(p_query, '')) AS tsq,
            -- Dictionary expansion: every query word that is a known alias
            -- contributes its canonical term as a PREFIX tsquery.
            (
                SELECT to_tsquery('simple', string_agg(DISTINCT s.canonical || ':*', ' | '))
                FROM public.search_synonyms s
                WHERE s.alias = ANY (string_to_array(norm.n, ' '))
            ) AS canon_tsq,
            -- Prefix match on a reasonably long final ASCII word ('mil' -> milk:*)
            (
                SELECT to_tsquery('simple', lastw || ':*')
                FROM (
                    SELECT (string_to_array(norm.n, ' '))[array_upper(string_to_array(norm.n, ' '), 1)] AS lastw
                ) lw
                WHERE NULLIF(norm.n, '') IS NOT NULL
                  AND lw.lastw ~ '^[a-z0-9]{3,}$'
            ) AS prefix_tsq
        FROM norm
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
        CASE WHEN q.text IS NULL THEN 0::real ELSE (
            ts_rank(p.search_vector, q.tsq) * 4
            + CASE WHEN q.canon_tsq @@ p.search_vector THEN 3::real ELSE 0 END
            + CASE WHEN q.prefix_tsq @@ p.search_vector THEN 1.5::real ELSE 0 END
            + word_similarity(q.text, p.name) * 2
            + word_similarity(q.text, coalesce(p.hi_name, '')) * 2
            + similarity(lower(p.name), lower(q.text))
        )::real END AS rank
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
            OR q.canon_tsq @@ p.search_vector
            OR q.prefix_tsq @@ p.search_vector
            OR word_similarity(q.text, p.name) > 0.45
            OR word_similarity(q.text, coalesce(p.hi_name, '')) > 0.45
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
