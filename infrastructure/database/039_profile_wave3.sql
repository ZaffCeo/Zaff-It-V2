-- 039_profile_wave3.sql — Profile 3.0: name-change policy + ZaffID grants re-fix
--
-- Founder spec (2026-11-28):
--   * Name change rate limit: 30 days me 1 baar; NEW profile gets 2 free changes
--     first (no cooldown), then 30-day cooldown between changes
--   * ZaffID "permission denied for function get_or_create_my_zaffid" — live DB
--     grants missing (file had them, live deployment batch skipped / overwritten).
--     Re-grant ALL ZaffID RPCs to authenticated (idempotent, belt-and-braces).
--
-- ROLLBACK:
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS name_change_count,
--     DROP COLUMN IF EXISTS last_name_change_at;
--   DROP FUNCTION public.update_my_profile_name(text);
--   (keep grants — they should exist anyway)

-- ---------------------------------------------------------------------------
-- 1. ZaffID grants re-fix (live DB was missing EXECUTE for authenticated)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_or_create_my_zaffid() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_my_zaffid() TO authenticated;
REVOKE ALL ON FUNCTION public.my_zaffid() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_zaffid() TO authenticated;
REVOKE ALL ON FUNCTION public.set_my_zaffid_status(boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_zaffid_status(boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Name-change tracking columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_change_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name_change_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 3. update_my_profile_name — server-enforced: 2 free changes, then 30-day cooldown
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_my_profile_name(p_full_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user        UUID := auth.uid();
    v_name        TEXT := trim(coalesce(p_full_name, ''));
    v_count       INTEGER;
    v_last        TIMESTAMPTZ;
    v_days_since  DOUBLE PRECISION;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF char_length(v_name) < 2 OR char_length(v_name) > 60 THEN
        RAISE EXCEPTION 'Naam 2-60 characters ka hona chahiye';
    END IF;

    SELECT name_change_count, last_name_change_at
    INTO v_count, v_last
    FROM public.profiles WHERE id = v_user;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    IF v_count >= 2 THEN
        v_days_since := EXTRACT(EPOCH FROM (now() - v_last)) / 86400.0;
        IF v_days_since < 30 THEN
            RAISE EXCEPTION 'Naam change limit: agla change % din baad (30-day rule)',
                CEIL(30 - v_days_since)::int;
        END IF;
    END IF;

    UPDATE public.profiles
    SET full_name = v_name,
        name_change_count = v_count + 1,
        last_name_change_at = now(),
        updated_at = now()
    WHERE id = v_user;

    PERFORM public.record_audit_log(
        v_user, 'customer', 'profile_name_changed', 'profiles', v_user,
        NULL, jsonb_build_object('new_name', v_name, 'changes_used', v_count + 1)
    );

    RETURN jsonb_build_object(
        'ok', true,
        'full_name', v_name,
        'changes_used', v_count + 1,
        'changes_remaining', GREATEST(0, 2 - (v_count + 1)),
        'next_change_at', CASE WHEN (v_count + 1) >= 2 THEN (now() + INTERVAL '30 days') ELSE NULL END
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_my_profile_name(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile_name(text) TO authenticated;
