CREATE TABLE IF NOT EXISTS public.geocode_cache (
    query_key  TEXT PRIMARY KEY,
    results    JSONB NOT NULL,
    source     TEXT NOT NULL DEFAULT 'osm',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='geocode_cache' AND policyname='geocode_cache_read_auth') THEN
        CREATE POLICY geocode_cache_read_auth ON public.geocode_cache FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
GRANT SELECT ON public.geocode_cache TO authenticated;
