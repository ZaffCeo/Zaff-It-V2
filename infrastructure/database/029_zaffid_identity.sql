-- 029 — W-Z1 ZaffID: universal Zaff identity (Phase 1: Zaff-It only)
-- One ID. Every Zaff. Identity rides the EXISTING auth.users (no new auth accounts,
-- no duplicated profiles). Structured for future OAuth2/OIDC SSO but NO SSO claims.
-- Conventions: idempotent, RLS day-one, secrets never, no destructive ops.

-- ============================================================================
-- 1. TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.zaff_identities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    public_id       TEXT NOT NULL UNIQUE,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deactivated_at  TIMESTAMPTZ,
    -- Public format: ZAFF- + 6 chars from a 28-char unambiguous alphabet
    -- (no 0/O/1/I; 28 chars). Visually distinct from referral codes (ZAFF-142924, 6 digits).
    CONSTRAINT zaffid_public_id_format CHECK (public_id ~ '^ZAFF-[ACDEFGHJKLMNPQRSTUVWXYZ234569]{6}$')
);

CREATE TABLE IF NOT EXISTS public.zaff_identity_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id    UUID NOT NULL REFERENCES public.zaff_identities(id) ON DELETE CASCADE,
    event_type     TEXT NOT NULL CHECK (event_type IN ('created', 'deactivated', 'reactivated', 'viewed')),
    actor_user_id  UUID REFERENCES auth.users(id),
    meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.zaff_connected_apps (
    app_key         TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL,
    state           TEXT NOT NULL DEFAULT 'coming_soon' CHECK (state IN ('connected', 'coming_soon')),
    requires_zaffid BOOLEAN NOT NULL DEFAULT false,
    sort_order      SMALLINT NOT NULL DEFAULT 100
);

-- Honest catalog: only integrations that actually exist are 'connected'.
INSERT INTO public.zaff_connected_apps (app_key, display_name, state, requires_zaffid, sort_order)
VALUES
    ('zaff_it',   'Zaff-It',  'connected',   false, 10),  -- the app itself (identity root)
    ('zaff_ads',  'Zaff Ads', 'connected',   true,  20),  -- advertiser identity rides ZaffID (merchant ads)
    ('zaff_mail', 'ZaffMail', 'coming_soon', true,  30),
    ('zaff_surf', 'ZaffSurf', 'coming_soon', true,  40),
    ('zaff_maps', 'ZaffMaps', 'coming_soon', true,  50)
ON CONFLICT (app_key) DO NOTHING;

-- ============================================================================
-- 2. RLS (day one, deny-all default)
-- ============================================================================
ALTER TABLE public.zaff_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zaff_identity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zaff_connected_apps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'zaff_identities' AND policyname = 'zaffid_select_own') THEN
        CREATE POLICY zaffid_select_own ON public.zaff_identities
            FOR SELECT TO authenticated
            USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'zaff_identity_events' AND policyname = 'zaffid_events_select_own') THEN
        CREATE POLICY zaffid_events_select_own ON public.zaff_identity_events
            FOR SELECT TO authenticated
            USING (EXISTS (SELECT 1 FROM public.zaff_identities zi WHERE zi.id = identity_id AND zi.user_id = auth.uid()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'zaff_connected_apps' AND policyname = 'zaffid_apps_read_catalog') THEN
        CREATE POLICY zaffid_apps_read_catalog ON public.zaff_connected_apps
            FOR SELECT TO authenticated
            USING (true);
    END IF;
END $$;

-- No INSERT/UPDATE/DELETE policies: identity rows are written only by the
-- SECURITY DEFINER RPCs below (server-issued public IDs, audited).

-- ============================================================================
-- 3. RPCs
-- ============================================================================

-- 3a. Idempotent, concurrency-safe identity creation (single RPC for create+read).
CREATE OR REPLACE FUNCTION public.get_or_create_my_zaffid()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user        UUID := auth.uid();
    v_existing    public.zaff_identities%ROWTYPE;
    v_public_id   TEXT;
    v_alphabet    TEXT := 'ACDEFGHJKLMNPQRSTUVWXYZ234569';
    v_attempt     INT;
    v_inserted    public.zaff_identities%ROWTYPE;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_existing FROM public.zaff_identities WHERE user_id = v_user;
    IF FOUND THEN
        INSERT INTO public.zaff_identity_events (identity_id, event_type, actor_user_id, meta)
        VALUES (v_existing.id, 'viewed', v_user, jsonb_build_object('via', 'get_or_create'));
        RETURN jsonb_build_object(
            'created_now', false,
            'public_id', v_existing.public_id,
            'status', v_existing.status,
            'created_at', v_existing.created_at
        );
    END IF;

    -- Collision-safe generation loop (28^6 > 4.8e8; retry on the astronomically rare clash).
    FOR v_attempt IN 1..10 LOOP
        v_public_id := 'ZAFF-' || (
            substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1) ||
            substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1) ||
            substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1) ||
            substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1) ||
            substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1) ||
            substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1)
        );

        -- INSERT-only RPC path; unique(user_id) also absorbs concurrent same-user calls.
        INSERT INTO public.zaff_identities (user_id, public_id)
        VALUES (v_user, v_public_id)
        ON CONFLICT (public_id) DO NOTHING
        RETURNING * INTO v_inserted;

        IF v_inserted.id IS NOT NULL THEN
            INSERT INTO public.zaff_identity_events (identity_id, event_type, actor_user_id, meta)
            VALUES (v_inserted.id, 'created', v_user, jsonb_build_object('attempt', v_attempt));
            PERFORM public.record_audit_log(
                v_user, 'customer', 'zaffid_created', 'zaff_identity', v_inserted.id,
                NULL, jsonb_build_object('public_id', v_inserted.public_id)
            );
            RETURN jsonb_build_object(
                'created_now', true,
                'public_id', v_inserted.public_id,
                'status', v_inserted.status,
                'created_at', v_inserted.created_at
            );
        END IF;
    END LOOP;

    RAISE EXCEPTION 'ZaffID generation failed after retries - please try again';
END;
$function$;

-- 3b. Full own-identity payload (identity + connected apps + event count).
CREATE OR REPLACE FUNCTION public.my_zaffid()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user     UUID := auth.uid();
    v_ident    public.zaff_identities%ROWTYPE;
    v_apps     JSONB;
    v_events   INT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_ident FROM public.zaff_identities WHERE user_id = v_user;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('exists', false);
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'app_key', a.app_key,
            'display_name', a.display_name,
            'state', a.state,
            'requires_zaffid', a.requires_zaffid
        ) ORDER BY a.sort_order), '[]'::JSONB)
    INTO v_apps
    FROM public.zaff_connected_apps a
    WHERE a.state = 'connected' OR a.requires_zaffid = false OR v_ident.status = 'active';

    SELECT count(*) INTO v_events
    FROM public.zaff_identity_events e WHERE e.identity_id = v_ident.id;

    RETURN jsonb_build_object(
        'exists', true,
        'identity', jsonb_build_object(
            'id', v_ident.id,
            'public_id', v_ident.public_id,
            'status', v_ident.status,
            'created_at', v_ident.created_at,
            'deactivated_at', v_ident.deactivated_at
        ),
        'connected_apps', v_apps,
        'event_count', v_events
    );
END;
$function$;

-- 3c. Deactivate / reactivate (self-service; account-deletion compliance hook).
CREATE OR REPLACE FUNCTION public.set_my_zaffid_status(p_reactivate BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user  UUID := auth.uid();
    v_row   public.zaff_identities%ROWTYPE;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_row FROM public.zaff_identities WHERE user_id = v_user;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No ZaffID found for your account';
    END IF;

    IF p_reactivate THEN
        UPDATE public.zaff_identities
        SET status = 'active', deactivated_at = NULL
        WHERE id = v_row.id AND status = 'deactivated';
        IF FOUND THEN
            INSERT INTO public.zaff_identity_events (identity_id, event_type, actor_user_id)
            VALUES (v_row.id, 'reactivated', v_user);
        END IF;
        RETURN jsonb_build_object('ok', true, 'status', 'active');
    ELSE
        UPDATE public.zaff_identities
        SET status = 'deactivated', deactivated_at = now()
        WHERE id = v_row.id AND status = 'active';
        IF FOUND THEN
            INSERT INTO public.zaff_identity_events (identity_id, event_type, actor_user_id)
            VALUES (v_row.id, 'deactivated', v_user);
            PERFORM public.record_audit_log(
                v_user, 'customer', 'zaffid_deactivated', 'zaff_identity', v_row.id,
                jsonb_build_object('status', 'active'), jsonb_build_object('status', 'deactivated')
            );
        END IF;
        RETURN jsonb_build_object('ok', true, 'status', 'deactivated');
    END IF;
END;
$function$;

-- 3d. Public lookup — exposes ONLY public_id + status (never user links),
-- rate-limited against enumeration.
CREATE OR REPLACE FUNCTION public.public_zaffid_lookup(p_public_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user   UUID := auth.uid();
    v_status TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT public.check_rate_limit('zaffid_lookup:' || v_user::text, 30, 60) THEN
        RAISE EXCEPTION 'Too many lookups - slow down';
    END IF;

    SELECT status INTO v_status
    FROM public.zaff_identities
    WHERE public_id = upper(trim(p_public_id)) AND status = 'active';

    IF v_status IS NULL THEN
        -- Do not distinguish exists-vs-deactivated to outsiders.
        RETURN jsonb_build_object('found', false);
    END IF;
    RETURN jsonb_build_object('found', true, 'public_id', upper(trim(p_public_id)), 'status', 'active');
END;
$function$;

-- ============================================================================
-- 4. GRANTS (revoke-and-grant; RPC-only write surface)
-- ============================================================================
REVOKE ALL ON public.zaff_identities FROM anon, authenticated;
GRANT SELECT ON public.zaff_identities TO authenticated;               -- own rows via RLS
REVOKE ALL ON public.zaff_identity_events FROM anon, authenticated;
GRANT SELECT ON public.zaff_identity_events TO authenticated;          -- own rows via RLS
GRANT SELECT ON public.zaff_connected_apps TO authenticated;
REVOKE ALL ON FUNCTION public.get_or_create_my_zaffid() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_my_zaffid() TO authenticated;
REVOKE ALL ON FUNCTION public.my_zaffid() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_zaffid() TO authenticated;
REVOKE ALL ON FUNCTION public.set_my_zaffid_status(boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_zaffid_status(boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.public_zaffid_lookup(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.public_zaffid_lookup(text) TO authenticated;
