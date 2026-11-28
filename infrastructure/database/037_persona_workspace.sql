-- 037_persona_workspace.sql — Persona workspace: merchant self-registration + earned roles
--
-- Founder spec (2026-11-28, Stitch refs: switch_role_workspace_account_profile +
-- role_detail_workspace_switch_merchant_mode):
--   * Customer profile shows ONLY earned roles (no more QA all-roles grid)
--   * "Are you a business owner?" banner for users WITHOUT a merchant persona
--     → registration screen → RPC creates merchant + store + grants merchant role
--   * 1-tap switch between Customer and Merchant workspaces (same login, same user id)
--
-- Security model:
--   * register_as_merchant is SECURITY DEFINER; owner_user_id = auth.uid() always
--     (never client-supplied); price/commission fields stay at defaults
--   * New stores open CLOSED (is_open=false) — merchant flips open via Store tab
--   * user_roles UNIQUE(user_id, role) → re-register just re-activates
--   * my_roles() SECURITY DEFINER read of own active roles (single round-trip for UI)
--
-- ROLLBACK:
--   DROP FUNCTION public.register_as_merchant(TEXT, TEXT, TEXT, UUID, TEXT, TEXT);
--   DROP FUNCTION public.my_roles();
--   (registered QA rows removable via UPDATE merchants/stores SET is_active=false)

-- ---------------------------------------------------------------------------
-- 1. my_roles() — own active roles for the persona workspace UI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_roles()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'role', r.role, 'granted_at', r.created_at
        ) ORDER BY r.created_at)
        FROM public.user_roles r
        WHERE r.user_id = v_user AND r.is_active
    ), '[]'::JSONB);
END;
$function$;

REVOKE ALL ON FUNCTION public.my_roles() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_roles() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. register_as_merchant — self-service merchant + store onboarding
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_as_merchant(
    p_business_name TEXT,
    p_store_name    TEXT,
    p_phone         TEXT,
    p_zone_id       UUID,
    p_address_line1 TEXT,
    p_pincode       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user       UUID := auth.uid();
    v_merchant   UUID;
    v_store      UUID;
    v_existing   UUID;
    v_zone       public.service_zones%ROWTYPE;
    v_slug       TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF p_business_name IS NULL OR char_length(trim(p_business_name)) < 3
       OR char_length(trim(p_business_name)) > 80 THEN
        RAISE EXCEPTION 'Business name must be 3-80 characters';
    END IF;
    IF p_store_name IS NULL OR char_length(trim(p_store_name)) < 3
       OR char_length(trim(p_store_name)) > 80 THEN
        RAISE EXCEPTION 'Store name must be 3-80 characters';
    END IF;
    IF p_phone IS NULL OR p_phone !~ '^[+0-9][0-9 ]{9,16}$' THEN
        RAISE EXCEPTION 'Enter a valid phone number';
    END IF;
    IF p_pincode IS NULL OR p_pincode !~ '^[0-9]{6}$' THEN
        RAISE EXCEPTION 'Pincode must be 6 digits';
    END IF;
    IF p_address_line1 IS NULL OR char_length(trim(p_address_line1)) < 5 THEN
        RAISE EXCEPTION 'Address line is too short';
    END IF;
    SELECT * INTO v_zone FROM public.service_zones
    WHERE id = p_zone_id AND is_active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or inactive service zone';
    END IF;

    -- Idempotent: one active merchant persona per owner
    SELECT id INTO v_existing FROM public.merchants
    WHERE owner_user_id = v_user AND is_active
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'existing', true, 'merchant_id', v_existing);
    END IF;

    INSERT INTO public.merchants (owner_user_id, business_name, phone)
    VALUES (v_user, trim(p_business_name), trim(p_phone))
    RETURNING id INTO v_merchant;

    v_slug := 'st-' || substr(md5(v_user::text || clock_timestamp()::text), 1, 12);
    INSERT INTO public.stores
        (merchant_id, service_zone_id, name, slug, address_line1,
         city, state, pincode, lat, lng, phone, is_open)
    VALUES
        (v_merchant, p_zone_id, trim(p_store_name), v_slug, trim(p_address_line1),
         v_zone.city, v_zone.state, p_pincode, v_zone.center_lat, v_zone.center_lng,
         trim(p_phone), false)
    RETURNING id INTO v_store;

    INSERT INTO public.user_roles (user_id, role, granted_by)
    VALUES (v_user, 'merchant', v_user)
    ON CONFLICT (user_id, role) DO UPDATE SET is_active = true;

    PERFORM public.record_audit_log(
        v_user, 'merchant', 'merchant_self_registered', 'merchants', v_merchant,
        NULL, jsonb_build_object('merchant_id', v_merchant, 'store_id', v_store,
                                 'zone_id', p_zone_id, 'store_slug', v_slug)
    );

    RETURN jsonb_build_object('ok', true, 'existing', false,
                              'merchant_id', v_merchant, 'store_id', v_store);
END;
$function$;

REVOKE ALL ON FUNCTION public.register_as_merchant(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_as_merchant(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;
