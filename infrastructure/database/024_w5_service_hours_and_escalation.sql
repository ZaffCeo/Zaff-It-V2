-- ============================================================================
-- 024_w5_service_hours_and_escalation.sql
-- W5 (doc align): zone service hours (6AM-9PM; Zone-B till 1AM kwick-only)
-- + rider-acceptance escalation ladder (doc: no rider 2min -> +2km +₹5;
--   5min -> customer choice wait / shift-SameDay / free-cancel).
--
-- Night window: dark_store (kwick fleet) orders allowed until zone
-- night_close_time; merchant-fulfilled stores follow 06:00-21:00.
-- Enforcement: BEFORE INSERT trigger on orders (authoritative, all paths)
-- + cart-preview mirror for UX.
-- Escalation sweep: pg_cron every minute; level 1 bump = +₹5 payout,
-- +2000m search radius (radius is consumed when geo-matching assignment
-- ships; payout bump is effective today). Level 2 -> customer_choice_required.
-- Free-cancel reuses existing order-lifecycle cancel (cancel_order_and_release_stock).
-- ============================================================================

-- 1) Zone service hours
ALTER TABLE public.service_zones
    ADD COLUMN IF NOT EXISTS service_open_time TIME NOT NULL DEFAULT '06:00',
    ADD COLUMN IF NOT EXISTS service_close_time TIME NOT NULL DEFAULT '21:00',
    ADD COLUMN IF NOT EXISTS night_close_time TIME;

-- Doc Zone-B: station/bus stand/Do Masjid/main market area -> till 1AM (kwick only)
UPDATE public.service_zones
SET night_close_time = '01:00'
WHERE code = 'MKN-CENTRAL';

-- 2) Delivery-task escalation fields
ALTER TABLE public.delivery_tasks
    ADD COLUMN IF NOT EXISTS escalation_level SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS search_radius_m INTEGER,
    ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS customer_choice_required BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS customer_choice TEXT;

ALTER TABLE public.delivery_tasks
    DROP CONSTRAINT IF EXISTS delivery_tasks_customer_choice_chk;
ALTER TABLE public.delivery_tasks
    ADD CONSTRAINT delivery_tasks_customer_choice_chk
    CHECK (customer_choice IS NULL OR customer_choice IN ('wait', 'sameday', 'freecancel'));

-- 3) Service-hours guard on every order insert (authoritative)
CREATE OR REPLACE FUNCTION public.orders_service_hours_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_zone public.service_zones%ROWTYPE;
    v_store_fulfillment TEXT;
    v_ist_now TIME;
BEGIN
    SELECT * INTO v_zone FROM public.service_zones
    WHERE id = NEW.service_zone_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Service zone not found for order';
    END IF;

    SELECT fulfillment_type INTO v_store_fulfillment
    FROM public.stores WHERE id = NEW.store_id;

    v_ist_now := (now() AT TIME ZONE 'Asia/Kolkata')::TIME;

    -- Day window: 06:00-21:00. Night extension: only dark_store (kwick) orders,
    -- continuous 06:00 -> night_close_time (next day, e.g. 01:00).
    IF (v_ist_now >= v_zone.service_open_time AND v_ist_now < v_zone.service_close_time)
       OR (
           v_zone.night_close_time IS NOT NULL
           AND v_store_fulfillment = 'dark_store'
           AND (v_ist_now >= v_zone.service_open_time OR v_ist_now < v_zone.night_close_time)
       ) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Store is outside service hours (%:02s-%:02s IST%s)',
        v_zone.service_open_time, v_zone.service_close_time,
        CASE WHEN v_zone.night_close_time IS NOT NULL
             THEN ' (kwick till ' || v_zone.night_close_time || ')'
             ELSE '' END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_service_hours ON public.orders;
CREATE TRIGGER trg_orders_service_hours
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_service_hours_guard();

-- 4) Escalation sweep (pg_cron every minute)
CREATE OR REPLACE FUNCTION public.escalate_stale_delivery_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_level1 INTEGER := 0;
    v_level2 INTEGER := 0;
    v_rearm  INTEGER := 0;
BEGIN
    -- Level 1: unassigned >= 2 min -> widen search +2km, bump payout +₹5 (doc §rider)
    UPDATE public.delivery_tasks
    SET escalation_level = 1,
        search_radius_m = COALESCE(search_radius_m, 0) + 2000,
        rider_payout_paise = rider_payout_paise + 500,
        escalated_at = now(),
        updated_at = now()
    WHERE status = 'unassigned'
      AND escalation_level = 0
      AND created_at <= now() - INTERVAL '2 minutes';
    GET DIAGNOSTICS v_level1 = ROW_COUNT;

    -- Level 2: still unassigned >= 5 min -> ask customer (wait / shift-SameDay / free-cancel)
    UPDATE public.delivery_tasks
    SET escalation_level = 2,
        customer_choice_required = true,
        escalated_at = now(),
        updated_at = now()
    WHERE status = 'unassigned'
      AND escalation_level = 1
      AND created_at <= now() - INTERVAL '5 minutes';
    GET DIAGNOSTICS v_level2 = ROW_COUNT;

    -- Re-arm: customer chose 'wait' but no rider after 10 more minutes
    UPDATE public.delivery_tasks
    SET customer_choice_required = true,
        escalated_at = now(),
        updated_at = now()
    WHERE status = 'unassigned'
      AND escalation_level = 2
      AND customer_choice = 'wait'
      AND customer_choice_required = false
      AND escalated_at <= now() - INTERVAL '10 minutes';
    GET DIAGNOSTICS v_rearm = ROW_COUNT;

    RETURN jsonb_build_object('level1', v_level1, 'level2', v_level2, 'rearmed', v_rearm);
END;
$function$;

-- 5) Customer escalation choice (wait / sameday). freecancel goes through
--    order-lifecycle cancel (cancel_order_and_release_stock) — existing path.
CREATE OR REPLACE FUNCTION public.resolve_delivery_escalation(
    p_order_id UUID,
    p_choice TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_order public.orders%ROWTYPE;
    v_task public.delivery_tasks%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_choice NOT IN ('wait', 'sameday') THEN
        RAISE EXCEPTION 'Invalid choice: use order-lifecycle cancel for free-cancel';
    END IF;

    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id AND customer_id = v_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found or not yours';
    END IF;

    SELECT * INTO v_task FROM public.delivery_tasks
    WHERE order_id = p_order_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No delivery task for this order';
    END IF;

    IF v_task.customer_choice_required <> true THEN
        RAISE EXCEPTION 'No pending escalation choice for this order';
    END IF;

    UPDATE public.delivery_tasks
    SET customer_choice = p_choice,
        customer_choice_required = false,
        escalated_at = now(),
        updated_at = now()
    WHERE id = v_task.id;

    PERFORM public.record_audit_log(
        v_user_id,
        'customer',
        'delivery.escalation_choice',
        'delivery_tasks',
        v_task.id,
        jsonb_build_object('customer_choice', v_task.customer_choice),
        jsonb_build_object('order_id', p_order_id, 'choice', p_choice)
    );

    RETURN jsonb_build_object(
        'ok', true,
        'task_id', v_task.id,
        'choice', p_choice,
        'note', CASE WHEN p_choice = 'wait'
                THEN 'Waiting for a rider for 10 more minutes'
                ELSE 'SameDay shift request recorded with the store' END
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_delivery_escalation(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_delivery_escalation(uuid, text) TO authenticated;

-- 6) pg_cron sweep (idempotent re-schedule)
SELECT cron.unschedule('zaff-escalate-delivery-tasks')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zaff-escalate-delivery-tasks');

SELECT cron.schedule('zaff-escalate-delivery-tasks', '* * * * *',
    $$SELECT public.escalate_stale_delivery_tasks();$$);
