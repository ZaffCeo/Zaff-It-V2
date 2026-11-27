-- ============================================================================
-- 026_w4a_referrals_ladder.sql
-- W4a (doc §invite align): referral program with 50/50 first-order reward and
-- the L1-L4 milestone ladder.
--
-- Doc rules implemented:
--   R1 50/50 first order: when the REFEREE's first order is delivered, both
--      referrer and referee get Rs50 (= 500 coins, 90-day expiry).
--   R2 L2: 5 completed invites -> 1 month Pro (customer plan, 30 days).
--   R3 L3: 10 completed invites -> 1 month Pro extension + Rs100 wallet credit.
--   R4 L4: 25 completed invites -> "Zaff Star" badge.
--   R5 1 mobile/device = 1 account: device_hash recorded at code-apply; a
--      device hash may be used for exactly ONE referral signup (anti-abuse;
--      phone OTP already enforces 1-number-1-account at auth level).
--   R6 One referral per referee (UNIQUE referee_id); self-referral blocked.
--
-- pro_memberships + user_badges tables ship here because the ladder grants
-- them; purchase/subscription flow lands in 027_w4b_pro_memberships.sql.
-- ============================================================================

-- 1) Referral codes -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON public.referral_codes (code);

-- 2) Referrals ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    code_used TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'signed_up'
        CHECK (status IN ('signed_up', 'completed', 'rewarded')),
    device_hash TEXT,
    reward_referrer_coins INTEGER NOT NULL DEFAULT 0,
    reward_referee_coins INTEGER NOT NULL DEFAULT 0,
    first_order_id UUID REFERENCES public.orders(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT referrals_no_self CHECK (referrer_id <> referee_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_device ON public.referrals (device_hash)
    WHERE device_hash IS NOT NULL;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referrals_select_scoped ON public.referrals;
CREATE POLICY referrals_select_scoped ON public.referrals
    FOR SELECT TO authenticated
    USING (referrer_id = auth.uid() OR referee_id = auth.uid());

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_codes_select_own ON public.referral_codes;
CREATE POLICY referral_codes_select_own ON public.referral_codes
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- 3) Referral tier grants (each milestone granted exactly once) ----------------
CREATE TABLE IF NOT EXISTS public.referral_tier_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tier SMALLINT NOT NULL CHECK (tier IN (2, 3, 4)),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (referrer_id, tier)
);

ALTER TABLE public.referral_tier_grants ENABLE ROW LEVEL SECURITY;

-- 4) User badges (Zaff Star etc.) ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    badge TEXT NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, badge)
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_badges_select_own ON public.user_badges;
CREATE POLICY user_badges_select_own ON public.user_badges
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- 5) Pro memberships (table here; purchase flow in 027) ------------------------
CREATE TABLE IF NOT EXISTS public.pro_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('customer', 'seller', 'provider')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
    source TEXT NOT NULL DEFAULT 'purchase'
        CHECK (source IN ('purchase', 'referral', 'trial', 'admin')),
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    amount_paise INTEGER NOT NULL DEFAULT 0,
    payment_provider TEXT,
    payment_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One ACTIVE membership per user per plan (purchase and referral grants alike)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pro_active_user_plan
    ON public.pro_memberships (user_id, plan)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_pro_expiring ON public.pro_memberships (expires_at)
    WHERE status = 'active';

ALTER TABLE public.pro_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pro_memberships_select_own ON public.pro_memberships;
CREATE POLICY pro_memberships_select_own ON public.pro_memberships
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- 6) RPC: get or create my referral code ---------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_my_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_code TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT code INTO v_code FROM public.referral_codes WHERE user_id = v_user_id;
    IF FOUND THEN
        RETURN v_code;
    END IF;

    -- Human-friendly: ZAFF-XXXXXX (6 chars from uuid, no confusing glyphs)
    LOOP
        v_code := 'ZAFF-' || upper(substr(
            regexp_replace(gen_random_uuid()::TEXT, '-', ''),
            1, 6
        ));
        BEGIN
            INSERT INTO public.referral_codes (user_id, code)
            VALUES (v_user_id, v_code);
            RETURN v_code;
        EXCEPTION WHEN unique_violation THEN
            -- code collision: loop and retry with a new suffix
            CONTINUE;
        END;
    END LOOP;
END;
$function$;

-- 7) RPC: apply a referral code (referee side, at signup) ----------------------
CREATE OR REPLACE FUNCTION public.apply_referral_code(
    p_code TEXT,
    p_device_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_referrer UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT rc.user_id INTO v_referrer
    FROM public.referral_codes rc
    WHERE upper(trim(p_code)) = rc.code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid referral code';
    END IF;

    IF v_referrer = v_user_id THEN
        RAISE EXCEPTION 'Self-referral not allowed';
    END IF;

    IF EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = v_user_id) THEN
        RAISE EXCEPTION 'Referral code already used for this account';
    END IF;

    -- R5: one device = one referral signup (when device fingerprint provided)
    IF p_device_hash IS NOT NULL AND length(trim(p_device_hash)) > 0 THEN
        IF EXISTS (
            SELECT 1 FROM public.referrals
            WHERE device_hash = trim(p_device_hash)
        ) THEN
            RAISE EXCEPTION 'Device already used for a referral signup';
        END IF;
    END IF;

    INSERT INTO public.referrals (referrer_id, referee_id, code_used, device_hash)
    VALUES (v_referrer, v_user_id, upper(trim(p_code)), NULLIF(trim(COALESCE(p_device_hash, '')), ''));

    PERFORM public.record_audit_log(
        v_user_id, 'customer', 'referral.apply', 'referrals', NULL,
        NULL,
        jsonb_build_object('referrer_id', v_referrer, 'code', upper(trim(p_code))),
        jsonb_build_object('device_hash_present', p_device_hash IS NOT NULL)
    );

    RETURN jsonb_build_object(
        'ok', true,
        'referrer_reward_pending', 'Rs50 after your first order is delivered',
        'referee_reward_pending', 'Rs50 after your first order is delivered'
    );
END;
$function$;

-- 8) RPC: ladder processor (grants each milestone exactly once) -----------------
CREATE OR REPLACE FUNCTION public.process_referral_ladder(p_referrer UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_completed INTEGER;
    v_tier_granted SMALLINT := 0;
BEGIN
    SELECT count(*) INTO v_completed
    FROM public.referrals
    WHERE referrer_id = p_referrer AND status = 'rewarded';

    -- L2: 5 completed -> 1 month Pro (customer, referral source)
    IF v_completed >= 5
       AND NOT EXISTS (SELECT 1 FROM public.referral_tier_grants WHERE referrer_id = p_referrer AND tier = 2) THEN
        INSERT INTO public.referral_tier_grants (referrer_id, tier) VALUES (p_referrer, 2);

        INSERT INTO public.pro_memberships (
            user_id, plan, status, source, started_at, expires_at, amount_paise
        )
        VALUES (
            p_referrer, 'customer', 'active', 'referral', now(), now() + INTERVAL '30 days', 0
        )
        ON CONFLICT (user_id, plan) WHERE status = 'active'
        DO UPDATE SET expires_at = GREATEST(
            public.pro_memberships.expires_at, now() + INTERVAL '30 days'
        ), updated_at = now();

        v_tier_granted := 2;
    END IF;

    -- L3: 10 completed -> 1 month Pro extension + Rs100 (1000 coins)
    IF v_completed >= 10
       AND NOT EXISTS (SELECT 1 FROM public.referral_tier_grants WHERE referrer_id = p_referrer AND tier = 3) THEN
        INSERT INTO public.referral_tier_grants (referrer_id, tier) VALUES (p_referrer, 3);

        INSERT INTO public.pro_memberships (
            user_id, plan, status, source, started_at, expires_at, amount_paise
        )
        VALUES (
            p_referrer, 'customer', 'active', 'referral', now(), now() + INTERVAL '30 days', 0
        )
        ON CONFLICT (user_id, plan) WHERE status = 'active'
        DO UPDATE SET expires_at = GREATEST(
            public.pro_memberships.expires_at, now() + INTERVAL '30 days'
        ), updated_at = now();

        PERFORM public.wallet_credit(
            p_referrer, 1000, 'bonus', 'Referral ladder L3 reward (Rs100)',
            90, 'referral', p_referrer, true
        );

        v_tier_granted := 3;
    END IF;

    -- L4: 25 completed -> Zaff Star badge
    IF v_completed >= 25
       AND NOT EXISTS (SELECT 1 FROM public.referral_tier_grants WHERE referrer_id = p_referrer AND tier = 4) THEN
        INSERT INTO public.referral_tier_grants (referrer_id, tier) VALUES (p_referrer, 4);

        INSERT INTO public.user_badges (user_id, badge)
        VALUES (p_referrer, 'zaff_star')
        ON CONFLICT (user_id, badge) DO NOTHING;

        v_tier_granted := 4;
    END IF;

    RETURN jsonb_build_object('completed_referrals', v_completed, 'tier_granted', v_tier_granted);
END;
$function$;

-- 9) Trigger: referee first order delivered -> 50/50 + ladder -------------------
CREATE OR REPLACE FUNCTION public.referrals_on_first_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_referral public.referrals%ROWTYPE;
    v_referrer_coins INTEGER;
    v_referee_coins INTEGER;
BEGIN
    IF NEW.status <> 'delivered' OR OLD.status = 'delivered' THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_referral
    FROM public.referrals
    WHERE referee_id = NEW.customer_id
      AND status = 'signed_up'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- R1: 50/50 (500 coins each, 90-day expiry; refund source clamps at cap)
    v_referrer_coins := public.wallet_credit(
        v_referral.referrer_id, 500, 'bonus',
        'Referral reward: ' || NEW.order_number || ' delivered',
        90, 'referral', v_referral.id, true
    );
    v_referee_coins := public.wallet_credit(
        v_referral.referee_id, 500, 'bonus',
        'Referral welcome reward: ' || NEW.order_number,
        90, 'referral', v_referral.id, true
    );

    UPDATE public.referrals
    SET status = 'rewarded',
        reward_referrer_coins = v_referrer_coins,
        reward_referee_coins = v_referee_coins,
        first_order_id = NEW.id,
        completed_at = now(),
        updated_at = now()
    WHERE id = v_referral.id;

    PERFORM public.process_referral_ladder(v_referral.referrer_id);

    PERFORM public.record_audit_log(
        NEW.customer_id, 'system', 'referral.complete', 'referrals', v_referral.id,
        jsonb_build_object('status', v_referral.status),
        jsonb_build_object('order_id', NEW.id, 'referrer_coins', v_referrer_coins, 'referee_coins', v_referee_coins),
        jsonb_build_object('order_number', NEW.order_number)
    );

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_referrals_first_order ON public.orders;
CREATE TRIGGER trg_referrals_first_order
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.referrals_on_first_order_delivered();

-- 10) RPC: my referral summary (code + progress + tier) -------------------------
CREATE OR REPLACE FUNCTION public.my_referral_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_code TEXT;
    v_completed INTEGER;
    v_pending INTEGER;
    v_earned INTEGER;
    v_tiers JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    v_code := public.get_or_create_my_referral_code();

    SELECT
        count(*) FILTER (WHERE status = 'rewarded'),
        count(*) FILTER (WHERE status = 'signed_up'),
        COALESCE(sum(reward_referrer_coins), 0)
    INTO v_completed, v_pending, v_earned
    FROM public.referrals
    WHERE referrer_id = v_user_id;

    SELECT jsonb_build_object(
        'l2', EXISTS (SELECT 1 FROM public.referral_tier_grants WHERE referrer_id = v_user_id AND tier = 2),
        'l3', EXISTS (SELECT 1 FROM public.referral_tier_grants WHERE referrer_id = v_user_id AND tier = 3),
        'l4', EXISTS (SELECT 1 FROM public.referral_tier_grants WHERE referrer_id = v_user_id AND tier = 4)
    ) INTO v_tiers
    FROM (SELECT 1) x;

    RETURN jsonb_build_object(
        'code', v_code,
        'completed', v_completed,
        'pending', v_pending,
        'earned_coins', v_earned,
        'tiers', v_tiers,
        'next_milestone', CASE
            WHEN v_completed >= 25 THEN 'Zaff Star unlocked'
            WHEN v_completed >= 10 THEN '25 invites -> Zaff Star'
            WHEN v_completed >= 5 THEN '5 more invites -> Rs100 + 1 month Pro'
            ELSE (5 - v_completed) || ' more invites -> 1 month Pro'
        END
    );
END;
$function$;

-- 11) Grants --------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_or_create_my_referral_code() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_my_referral_code() TO authenticated;

REVOKE ALL ON FUNCTION public.apply_referral_code(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_referral_code(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.process_referral_ladder(UUID) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.my_referral_summary() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_referral_summary() TO authenticated;
