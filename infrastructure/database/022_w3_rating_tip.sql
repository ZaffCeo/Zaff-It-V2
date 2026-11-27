-- ============================================================================
-- 022_w3_rating_tip.sql
-- W3 (Stitch customer_rating_rider_tip_*): rider rating + tip + store thumbs.
--
-- Honest money rule: tips are RECORDED here and settle with the rider's weekly
-- payout (doc: rider earnings settle weekly; COD settles at office). No fake
-- online-payment success is claimed by the client. 100% of tip goes to rider
-- (0% platform fee — doc §7 rider payout model).
--
-- Rating reward: +20 Z-Coins on a delivered order's rating, awarded once per
-- order via SECURITY DEFINER trigger (calls existing service-grade award_coins).
--
-- RLS: customer inserts own rating for OWN delivered order (validated in fn);
-- rider reads own ratings; tips readable by payer + receiving rider.
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rider_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    tags TEXT[] NOT NULL DEFAULT '{}',
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rider_ratings_rider ON public.rider_ratings (rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_ratings_customer ON public.rider_ratings (customer_id);

CREATE TABLE IF NOT EXISTS public.rider_tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    amount_paise INTEGER NOT NULL CHECK (amount_paise BETWEEN 1000 AND 200000),
    method TEXT NOT NULL DEFAULT 'cod_addon' CHECK (method IN ('cod_addon', 'wallet_coins', 'razorpay')),
    status TEXT NOT NULL DEFAULT 'pending_settlement'
        CHECK (status IN ('pending_settlement', 'settled', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rider_tips_rider ON public.rider_tips (rider_id, status);

-- Store-level thumbs for the delivered order (separate from rider rating)
CREATE TABLE IF NOT EXISTS public.store_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    thumbs_up BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rider_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rr_select ON public.rider_ratings;
CREATE POLICY rr_select ON public.rider_ratings FOR SELECT
    USING (auth.uid() = customer_id OR auth.uid() = rider_id OR public.has_role('admin'));
DROP POLICY IF EXISTS rr_insert_own ON public.rider_ratings;
CREATE POLICY rr_insert_own ON public.rider_ratings FOR INSERT
    WITH CHECK (auth.uid() = customer_id);
DROP POLICY IF EXISTS rr_update_own ON public.rider_ratings;
CREATE POLICY rr_update_own ON public.rider_ratings FOR UPDATE
    USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS rt_select ON public.rider_tips;
CREATE POLICY rt_select ON public.rider_tips FOR SELECT
    USING (auth.uid() = customer_id OR auth.uid() = rider_id OR public.has_role('admin'));
DROP POLICY IF EXISTS rt_insert_own ON public.rider_tips;
CREATE POLICY rt_insert_own ON public.rider_tips FOR INSERT
    WITH CHECK (auth.uid() = customer_id);
DROP POLICY IF EXISTS rt_update_settle ON public.rider_tips;
CREATE POLICY rt_update_settle ON public.rider_tips FOR UPDATE
    USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS sr_select ON public.store_ratings;
CREATE POLICY sr_select ON public.store_ratings FOR SELECT
    USING (auth.uid() = customer_id OR public.has_role('admin') OR EXISTS (
        SELECT 1 FROM public.stores s JOIN public.merchants m ON m.id = s.merchant_id
        WHERE s.id = store_id AND m.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS sr_insert_own ON public.store_ratings;
CREATE POLICY sr_insert_own ON public.store_ratings FOR INSERT
    WITH CHECK (auth.uid() = customer_id);

GRANT SELECT, INSERT, UPDATE ON public.rider_ratings TO authenticated;
GRANT SELECT, INSERT ON public.rider_tips TO authenticated;
GRANT SELECT, INSERT ON public.store_ratings TO authenticated;

-- ---------------------------------------------------------------------------
-- Guarded rating insert fn: validates ownership + delivered status + rider
-- assignment, then inserts rating + tip (if any) + store thumbs and awards
-- +20 coins once. One RPC = one consistent write (client never free-forms).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_delivery_feedback(
    p_order_id UUID,
    p_stars INTEGER,
    p_tags TEXT[] DEFAULT '{}',
    p_comment TEXT DEFAULT NULL,
    p_tip_paise INTEGER DEFAULT 0,
    p_store_thumbs_up BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_order public.orders;
    v_task public.delivery_tasks;
    v_rating_id UUID;
    v_coins_awarded INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;
    IF p_stars IS NULL OR p_stars NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'invalid_stars';
    END IF;
    IF array_length(p_tags, 1) > 5 THEN
        RAISE EXCEPTION 'too_many_tags';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'order_not_found';
    END IF;
    IF v_order.customer_id <> auth.uid() THEN
        RAISE EXCEPTION 'not_your_order';
    END IF;
    IF v_order.status <> 'delivered' THEN
        RAISE EXCEPTION 'order_not_delivered';
    END IF;

    SELECT * INTO v_task FROM public.delivery_tasks WHERE order_id = p_order_id;

    -- Rating (one per order — UNIQUE(order_id) also enforces)
    IF EXISTS (SELECT 1 FROM public.rider_ratings WHERE order_id = p_order_id) THEN
        RAISE EXCEPTION 'already_rated';
    END IF;
    INSERT INTO public.rider_ratings (order_id, customer_id, rider_id, stars, tags, comment)
    VALUES (p_order_id, auth.uid(), v_task.rider_id, p_stars, p_tags, p_comment)
    RETURNING id INTO v_rating_id;

    -- Tip (optional; recorded for rider weekly settlement — honest, no fake pay)
    IF p_tip_paise > 0 THEN
        IF p_tip_paise NOT BETWEEN 1000 AND 200000 THEN
            RAISE EXCEPTION 'invalid_tip';
        END IF;
        INSERT INTO public.rider_tips (order_id, customer_id, rider_id, amount_paise, method)
        VALUES (p_order_id, auth.uid(), v_task.rider_id, p_tip_paise, 'cod_addon');
    END IF;

    -- Store thumbs (optional)
    IF p_store_thumbs_up IS NOT NULL THEN
        INSERT INTO public.store_ratings (order_id, customer_id, store_id, thumbs_up)
        VALUES (p_order_id, auth.uid(), v_order.store_id, p_store_thumbs_up)
        ON CONFLICT (order_id) DO NOTHING;
    END IF;

    -- +20 Z-Coins once per rated order (doc: Z-Coins reward on rating screen)
    IF NOT EXISTS (
        SELECT 1 FROM public.wallet_ledger
        WHERE user_id = auth.uid() AND reference_id = p_order_id AND reason LIKE '%rating%'
    ) THEN
        PERFORM public.award_coins(auth.uid(), 20, 'Delivery rating reward', 'order', p_order_id);
        v_coins_awarded := 20;
    END IF;

    RETURN jsonb_build_object(
        'rating_id', v_rating_id,
        'tip_recorded_paise', COALESCE(p_tip_paise, 0),
        'coins_awarded', v_coins_awarded,
        'tip_settlement', 'rider_weekly_payout'
    );
END
$fn$;

REVOKE ALL ON FUNCTION public.submit_delivery_feedback(UUID, INTEGER, TEXT[], TEXT, INTEGER, BOOLEAN)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_delivery_feedback(UUID, INTEGER, TEXT[], TEXT, INTEGER, BOOLEAN)
    TO authenticated;
