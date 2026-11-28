-- 032 — W-Rider: rider payout slab (₹8-20/order doc slab), COD office deposit
-- with 9PM due-time, and low/un-deposited-COD auto-pause from task assignment.
-- Builds on delivery_tasks.rider_payout_paise (exists, was never populated) and
-- the W5 escalation ladder (escalation_level >= 2 earns the +₹5 bonus).

-- ============================================================================
-- 1. ops_rider_payout_config — admin-controlled slabs (doc: ₹8-20)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ops_rider_payout_config (
    singleton                BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
    tier1_paise              INTEGER NOT NULL CHECK (tier1_paise > 0),  -- <= 2 km
    tier2_paise              INTEGER NOT NULL CHECK (tier2_paise > 0),  -- 2-4 km
    tier3_paise              INTEGER NOT NULL CHECK (tier3_paise > 0),  -- 4-6 km
    tier4_paise              INTEGER NOT NULL CHECK (tier4_paise > 0),  -- > 6 km
    escalation_bonus_paise   INTEGER NOT NULL CHECK (escalation_bonus_paise >= 0),
    cod_deposit_hour_ist     SMALLINT NOT NULL DEFAULT 21,              -- 9PM office deposit
    cod_pause_threshold_paise INTEGER NOT NULL DEFAULT 200000,          -- ₹2000 undeposited -> pause
    updated_by               UUID REFERENCES auth.users(id),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ops_rider_payout_config (
    singleton, tier1_paise, tier2_paise, tier3_paise, tier4_paise,
    escalation_bonus_paise, cod_deposit_hour_ist, cod_pause_threshold_paise
)
VALUES (true, 800, 1200, 1600, 2000, 500, 21, 200000)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.ops_rider_payout_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_rider_payout_config' AND policyname = 'rider_payout_config_read_auth') THEN
        CREATE POLICY rider_payout_config_read_auth ON public.ops_rider_payout_config
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
-- Writes only via admin RPC below.

-- ============================================================================
-- 2. Slab calculator (STABLE) — assignment-time payout
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calc_rider_payout(
    p_distance_m      INTEGER,
    p_escalation_level SMALLINT DEFAULT 0
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT CASE
        WHEN p_distance_m IS NULL OR p_distance_m <= 2000 THEN c.tier1_paise
        WHEN p_distance_m <= 4000 THEN c.tier2_paise
        WHEN p_distance_m <= 6000 THEN c.tier3_paise
        ELSE c.tier4_paise
    END
    + CASE WHEN p_escalation_level >= 2 THEN c.escalation_bonus_paise ELSE 0 END
    FROM public.ops_rider_payout_config c
    WHERE c.singleton = true;
$function$;

-- ============================================================================
-- 3. Assignment-time payout trigger (BEFORE — stamps NEW.rider_payout_paise)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_rider_payout_on_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.rider_id IS NOT NULL
       AND NEW.status = 'assigned'
       AND COALESCE(OLD.status, '') IS DISTINCT FROM 'assigned'
       AND COALESCE(NEW.rider_payout_paise, 0) <= 0 THEN
        NEW.rider_payout_paise := public.calc_rider_payout(
            NEW.distance_meters,
            COALESCE(NEW.escalation_level, 0::smallint)
        );
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rider_payout_stamp ON public.delivery_tasks;
CREATE TRIGGER trg_rider_payout_stamp
    BEFORE INSERT OR UPDATE OF status, rider_id, rider_payout_paise ON public.delivery_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_rider_payout_on_assigned();

-- ============================================================================
-- 4. COD compliance — overdue detection (missed the 9PM IST office deposit)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rider_has_overdue_cod(p_rider UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    WITH cod_boundary AS (
        SELECT ((now() AT TIME ZONE 'Asia/Kolkata')::date::timestamp
                + make_interval(hours => (SELECT cod_deposit_hour_ist FROM public.ops_rider_payout_config WHERE singleton = true)))
               AT TIME ZONE 'Asia/Kolkata' AS boundary
        WHERE (now() AT TIME ZONE 'Asia/Kolkata')::time >= (SELECT make_interval(hours => cod_deposit_hour_ist)::interval FROM public.ops_rider_payout_config WHERE singleton = true)
        UNION ALL
        SELECT (((now() AT TIME ZONE 'Asia/Kolkata')::date::timestamp - interval '1 day')
                + make_interval(hours => (SELECT cod_deposit_hour_ist FROM public.ops_rider_payout_config WHERE singleton = true)))
               AT TIME ZONE 'Asia/Kolkata' AS boundary
        WHERE (now() AT TIME ZONE 'Asia/Kolkata')::time < (SELECT make_interval(hours => cod_deposit_hour_ist)::interval FROM public.ops_rider_payout_config WHERE singleton = true)
    )
    SELECT EXISTS (
        SELECT 1
        FROM public.delivery_tasks dt
        JOIN public.orders o ON o.id = dt.order_id
        CROSS JOIN cod_boundary b
        WHERE dt.rider_id = p_rider
          AND dt.status = 'delivered'
          AND dt.delivered_at IS NOT NULL
          AND dt.delivered_at < b.boundary
          AND lower(o.payment_method) = 'cod'
          AND NOT EXISTS (
              SELECT 1
              FROM public.rider_cod_deposits d
              WHERE d.rider_id = p_rider
                AND d.status IN ('pending', 'verified')
                AND dt.order_id = ANY (d.order_ids)
          )
    );
$function$;

-- ============================================================================
-- 5. rider_cod_deposits — 9PM office deposit batches
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rider_cod_deposits (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    amount_paise  INTEGER NOT NULL CHECK (amount_paise > 0),
    order_ids     UUID[] NOT NULL CHECK (array_length(order_ids, 1) > 0),
    deposit_date  DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    verified_by   UUID REFERENCES auth.users(id),
    verified_at   TIMESTAMPTZ,
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cod_deposits_rider ON public.rider_cod_deposits (rider_id, status);

ALTER TABLE public.rider_cod_deposits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'rider_cod_deposits' AND policyname = 'cod_deposits_select_own_or_admin') THEN
        CREATE POLICY cod_deposits_select_own_or_admin ON public.rider_cod_deposits
            FOR SELECT TO authenticated
            USING (auth.uid() = rider_id OR public.is_admin());
    END IF;
END $$;
-- Writes via SECURITY DEFINER RPCs only.

-- ============================================================================
-- 6. submit_cod_deposit — rider deposits exact COD sum at the office
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_cod_deposit(
    p_order_ids    UUID[],
    p_amount_paise INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_rider  UUID := auth.uid();
    v_sum    INTEGER;
    v_n      INTEGER;
    v_id     UUID;
BEGIN
    IF v_rider IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF p_order_ids IS NULL OR array_length(p_order_ids, 1) = 0 THEN
        RAISE EXCEPTION 'At least one COD order required';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_rider AND ur.role = 'rider' AND ur.is_active) = false THEN
        RAISE EXCEPTION 'Rider access required';
    END IF;

    -- Server-side amount: sum of COD order totals actually delivered by THIS rider.
    SELECT count(*), COALESCE(sum(o.total_paise), 0)
    INTO v_n, v_sum
    FROM unnest(p_order_ids) AS oid
    JOIN public.orders o ON o.id = oid
    WHERE lower(o.payment_method) = 'cod'
      AND o.status = 'delivered'
      AND EXISTS (
          SELECT 1 FROM public.delivery_tasks dt
          WHERE dt.order_id = o.id AND dt.rider_id = v_rider AND dt.status = 'delivered'
      );

    IF v_n <> array_length(p_order_ids, 1) THEN
        RAISE EXCEPTION 'Some orders are not valid COD deliveries of yours';
    END IF;
    IF p_amount_paise IS NULL OR p_amount_paise <> v_sum THEN
        RAISE EXCEPTION 'Amount mismatch: COD total is %, got %', v_sum, p_amount_paise;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.rider_cod_deposits d
        WHERE d.rider_id = v_rider
          AND d.status IN ('pending', 'verified')
          AND EXISTS (
              SELECT 1 FROM unnest(p_order_ids) AS oid2
              WHERE oid2 = ANY (d.order_ids)
          )
    ) THEN
        RAISE EXCEPTION 'One or more orders already deposited';
    END IF;

    INSERT INTO public.rider_cod_deposits (rider_id, amount_paise, order_ids)
    VALUES (v_rider, p_amount_paise, p_order_ids)
    RETURNING id INTO v_id;

    PERFORM public.record_audit_log(
        v_rider, 'rider', 'cod_deposit_submitted', 'rider_cod_deposits', v_id,
        NULL, jsonb_build_object('amount_paise', p_amount_paise, 'orders', v_n)
    );
    RETURN jsonb_build_object('ok', true, 'deposit_id', v_id, 'amount_paise', p_amount_paise, 'orders', v_n);
END;
$function$;

-- ============================================================================
-- 7. verify_cod_deposit — admin verifies at-office handover
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_cod_deposit(
    p_deposit_id UUID,
    p_approve    BOOLEAN,
    p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_row public.rider_cod_deposits%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    SELECT * INTO v_row FROM public.rider_cod_deposits WHERE id = p_deposit_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Deposit not found';
    END IF;
    IF v_row.status <> 'pending' THEN
        RETURN jsonb_build_object('ok', true, 'deduplicated', true, 'status', v_row.status);
    END IF;

    UPDATE public.rider_cod_deposits
    SET status = CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END,
        verified_by = auth.uid(),
        verified_at = now(),
        note = p_note
    WHERE id = p_deposit_id;

    PERFORM public.record_audit_log(
        auth.uid(), 'admin', 'cod_deposit_verified', 'rider_cod_deposits', p_deposit_id,
        jsonb_build_object('status', 'pending'),
        jsonb_build_object('status', CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END,
                           'amount_paise', v_row.amount_paise, 'note', p_note)
    );
    RETURN jsonb_build_object('ok', true, 'status', CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END);
END;
$function$;

-- ============================================================================
-- 8. set_rider_payout_config — admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_rider_payout_config(
    p_tier1 INTEGER DEFAULT NULL,
    p_tier2 INTEGER DEFAULT NULL,
    p_tier3 INTEGER DEFAULT NULL,
    p_tier4 INTEGER DEFAULT NULL,
    p_escalation_bonus INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_old JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    SELECT to_jsonb(c) INTO v_old FROM public.ops_rider_payout_config c WHERE c.singleton = true;

    UPDATE public.ops_rider_payout_config
    SET tier1_paise = COALESCE(p_tier1, tier1_paise),
        tier2_paise = COALESCE(p_tier2, tier2_paise),
        tier3_paise = COALESCE(p_tier3, tier3_paise),
        tier4_paise = COALESCE(p_tier4, tier4_paise),
        escalation_bonus_paise = COALESCE(p_escalation_bonus, escalation_bonus_paise),
        updated_by = auth.uid(),
        updated_at = now()
    WHERE singleton = true;

    -- Slab sanity: ₹8-20 doc window on every tier actually in use
    IF EXISTS (
        SELECT 1 FROM public.ops_rider_payout_config c
        WHERE c.singleton = true
          AND (c.tier1_paise NOT BETWEEN 800 AND 2000
            OR c.tier2_paise NOT BETWEEN 800 AND 2000
            OR c.tier3_paise NOT BETWEEN 800 AND 2000
            OR c.tier4_paise NOT BETWEEN 800 AND 2000)
    ) THEN
        RAISE EXCEPTION 'Tiers must stay within the Rs8-Rs20 doc slab';
    END IF;

    PERFORM public.record_audit_log(
        auth.uid(), 'admin', 'rider_payout_config_updated', 'ops_rider_payout_config', NULL,
        v_old, jsonb_build_object('tier1', p_tier1, 'tier2', p_tier2, 'tier3', p_tier3, 'tier4', p_tier4, 'bonus', p_escalation_bonus)
    );
    RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ============================================================================
-- 9. my_rider_earnings — rider dashboard payload
-- ============================================================================
CREATE OR REPLACE FUNCTION public.my_rider_earnings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_rider UUID := auth.uid();
    v_today INTEGER;
    v_week  INTEGER;
    v_total INTEGER;
    v_tasks INTEGER;
    v_pending_cod INTEGER;
    v_cod_orders JSONB;
    v_deposits JSONB;
BEGIN
    IF v_rider IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT COALESCE(sum(dt.rider_payout_paise), 0), count(*)
    INTO v_today, v_tasks
    FROM public.delivery_tasks dt
    WHERE dt.rider_id = v_rider AND dt.status = 'delivered'
      AND (dt.delivered_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date;

    SELECT COALESCE(sum(dt.rider_payout_paise), 0) INTO v_week
    FROM public.delivery_tasks dt
    WHERE dt.rider_id = v_rider AND dt.status = 'delivered'
      AND dt.delivered_at >= now() - interval '7 days';

    SELECT COALESCE(sum(dt.rider_payout_paise), 0) INTO v_total
    FROM public.delivery_tasks dt
    WHERE dt.rider_id = v_rider AND dt.status = 'delivered';

    SELECT COALESCE(sum(o.total_paise), 0)
    INTO v_pending_cod
    FROM public.delivery_tasks dt
    JOIN public.orders o ON o.id = dt.order_id
    WHERE dt.rider_id = v_rider
      AND dt.status = 'delivered'
      AND lower(o.payment_method) = 'cod'
      AND NOT EXISTS (
          SELECT 1 FROM public.rider_cod_deposits d
          WHERE d.rider_id = v_rider
            AND d.status IN ('pending', 'verified')
            AND dt.order_id = ANY (d.order_ids)
      );

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'order_id', o.id, 'order_number', o.order_number,
        'cod_paise', o.total_paise, 'delivered_at', dt.delivered_at
    ) ORDER BY dt.delivered_at DESC), '[]'::JSONB)
    INTO v_cod_orders
    FROM public.delivery_tasks dt
    JOIN public.orders o ON o.id = dt.order_id
    WHERE dt.rider_id = v_rider
      AND dt.status = 'delivered'
      AND lower(o.payment_method) = 'cod'
      AND NOT EXISTS (
          SELECT 1 FROM public.rider_cod_deposits d
          WHERE d.rider_id = v_rider
            AND d.status IN ('pending', 'verified')
            AND dt.order_id = ANY (d.order_ids)
      );

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id, 'status', d.status, 'amount_paise', d.amount_paise,
        'orders', array_length(d.order_ids, 1), 'deposit_date', d.deposit_date,
        'created_at', d.created_at, 'verified_at', d.verified_at, 'note', d.note
    ) ORDER BY d.created_at DESC), '[]'::JSONB)
    INTO v_deposits
    FROM public.rider_cod_deposits d
    WHERE d.rider_id = v_rider;

    RETURN jsonb_build_object(
        'today_payout_paise', v_today,
        'today_tasks', v_tasks,
        'week_payout_paise', v_week,
        'total_payout_paise', v_total,
        'pending_cod_paise', v_pending_cod,
        'cod_orders', v_cod_orders,
        'deposits', v_deposits,
        'overdue_cod', public.rider_has_overdue_cod(v_rider)
    );
END;
$function$;

-- ============================================================================
-- 10. GRANTS + cron (COD deposit reminder sweep is notification-side; batcher n/a)
-- ============================================================================
REVOKE ALL ON public.ops_rider_payout_config FROM anon;
GRANT SELECT ON public.ops_rider_payout_config TO authenticated;
REVOKE ALL ON public.rider_cod_deposits FROM anon, authenticated;
GRANT SELECT ON public.rider_cod_deposits TO authenticated;  -- own-or-admin via RLS

REVOKE ALL ON FUNCTION public.calc_rider_payout(INTEGER, SMALLINT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.calc_rider_payout(INTEGER, SMALLINT) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_cod_deposit(UUID[], INTEGER) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_cod_deposit(UUID[], INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.verify_cod_deposit(UUID, BOOLEAN, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cod_deposit(UUID, BOOLEAN, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.set_rider_payout_config(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_rider_payout_config(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.my_rider_earnings() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_rider_earnings() TO authenticated;

-- ============================================================================
-- 11. auto_assign_delivery_task v2 — adds the COD-overdue auto-pause guard
--     (riders with missed 9PM deposits are excluded from assignment).
--     Same signature + core logic as 011; only the two rider SELECTs gained
--     `and not public.rider_has_overdue_cod(ur.user_id)`.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_assign_delivery_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_task public.delivery_tasks%ROWTYPE;
  v_rider uuid;
begin
  select * into v_task from public.delivery_tasks where id = p_task_id for update;
  if not found then
    raise exception 'delivery task % not found', p_task_id;
  end if;
  if v_task.status <> 'unassigned' or v_task.rider_id is not null then
    return jsonb_build_object('assigned', false, 'reason', 'already_assigned');
  end if;

  select ur.user_id into v_rider
  from public.user_roles ur
  where ur.role = 'rider' and ur.is_active
    and not public.rider_has_overdue_cod(ur.user_id)
    and not exists (
      select 1 from public.delivery_tasks dt
      where dt.rider_id = ur.user_id
        and dt.status in ('assigned', 'picked_up', 'arrived_customer')
    )
  order by (
    select max(rl.recorded_at) from public.rider_locations rl
    where rl.rider_id = ur.user_id and rl.recorded_at >= now() - interval '30 minutes'
  ) desc nulls last
  limit 1;

  if v_rider is null then
    select ur.user_id into v_rider
    from public.user_roles ur
    where ur.role = 'rider' and ur.is_active
      and not public.rider_has_overdue_cod(ur.user_id)
    order by (
      select count(*) from public.delivery_tasks dt
      where dt.rider_id = ur.user_id
        and dt.status in ('assigned', 'picked_up', 'arrived_customer')
    ) asc,
    (
      select max(rl.recorded_at) from public.rider_locations rl
      where rl.rider_id = ur.user_id
    ) desc nulls last
    limit 1;
  end if;

  if v_rider is null then
    return jsonb_build_object('assigned', false, 'reason', 'no_riders_available');
  end if;

  update public.delivery_tasks
  set rider_id = v_rider,
      status = 'assigned',
      assigned_at = now(),
      updated_at = now()
  where id = v_task.id;

  update public.orders
  set status = 'rider_assigned'
  where id = v_task.order_id and status = 'ready_for_pickup';

  perform public.record_audit_log(
    null,
    'system',
    'delivery.auto_assign',
    'delivery_tasks',
    v_task.id,
    jsonb_build_object('rider_id', v_task.rider_id, 'status', v_task.status),
    jsonb_build_object('rider_id', v_rider, 'status', 'assigned'),
    jsonb_build_object('order_id', v_task.order_id)
  );

  return jsonb_build_object('assigned', true, 'rider_id', v_rider, 'task_id', v_task.id);
end;
$function$;
