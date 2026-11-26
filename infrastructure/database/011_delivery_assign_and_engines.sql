-- ===========================================================================
-- ZAFF-IT Migration 011: Delivery Auto-Assign + Promotion/Settlement Engines
-- ---------------------------------------------------------------------------
-- P1: auto_assign_delivery_task() — least-loaded online rider, called by the
--     order-lifecycle edge function on ready_for_pickup (service_role only).
-- P2: validate_coupon() — coupons (009) checkout validation + discount calc.
-- P2: get_active_flash_sales() — live morning flash-sale windows.
-- P2: reconcile_settlements() — orders vs settlement_ledger mismatch report.
-- P2: get_recommended_products() — repeat-purchase based suggestions.
-- Cron: flash-sale expiry (hourly), settlement reconciliation (daily 02:00).
-- ===========================================================================

-- 1. Delivery auto-assignment ------------------------------------------------
create or replace function public.auto_assign_delivery_task(
  p_task_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
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

  -- Preferred: free rider (no active delivery) with freshest location ping.
  select ur.user_id into v_rider
  from public.user_roles ur
  where ur.role = 'rider' and ur.is_active
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

  -- Fallback: nobody free -> least-loaded rider overall.
  if v_rider is null then
    select ur.user_id into v_rider
    from public.user_roles ur
    where ur.role = 'rider' and ur.is_active
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
$$;

revoke all on function public.auto_assign_delivery_task(uuid) from public, anon, authenticated;
grant execute on function public.auto_assign_delivery_task(uuid) to service_role;

-- 2. Coupon validation + discount calculation (checkout + cart preview) ------
create or replace function public.validate_coupon(
  p_code text,
  p_order_paise integer
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_coupon public.coupons%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_discount integer := 0;
  v_user_uses integer := 0;
  v_total_uses integer := 0;
begin
  if p_order_paise is null or p_order_paise <= 0 then
    raise exception 'VALIDATION: order amount must be positive';
  end if;

  select * into v_coupon
  from public.coupons
  where upper(trim(code)) = upper(trim(p_code))
    and is_active
    and valid_from <= now()
    and (valid_until is null or valid_until > now());

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'invalid_or_expired');
  end if;

  if p_order_paise < v_coupon.min_order_paise then
    return jsonb_build_object(
      'valid', false,
      'reason', 'min_order_not_met',
      'min_order_paise', v_coupon.min_order_paise
    );
  end if;

  select count(*) into v_total_uses
  from public.coupon_redemptions
  where coupon_id = v_coupon.id;

  if v_coupon.max_redemptions is not null and v_total_uses >= v_coupon.max_redemptions then
    return jsonb_build_object('valid', false, 'reason', 'fully_redeemed');
  end if;

  if v_user_id is not null then
    select count(*) into v_user_uses
    from public.coupon_redemptions
    where coupon_id = v_coupon.id and user_id = v_user_id;

    if v_user_uses >= v_coupon.per_user_limit then
      return jsonb_build_object('valid', false, 'reason', 'per_user_limit_reached');
    end if;
  end if;

  if v_coupon.discount_type = 'percent' then
    v_discount := least(
      floor(p_order_paise * v_coupon.discount_value / 100)::integer,
      coalesce(v_coupon.max_discount_paise, 2147483647)
    );
  elsif v_coupon.discount_type = 'flat' then
    v_discount := least(v_coupon.discount_value, p_order_paise);
  end if;
  -- 'free_delivery': discount_paise stays 0; caller zeroes delivery fee.

  return jsonb_build_object(
    'valid', true,
    'coupon_id', v_coupon.id,
    'code', v_coupon.code,
    'description', v_coupon.description,
    'discount_type', v_coupon.discount_type,
    'discount_paise', v_discount
  );
end;
$$;

revoke all on function public.validate_coupon(text, integer) from public, anon;
grant execute on function public.validate_coupon(text, integer) to authenticated;

-- 3. Active flash sales (live windows) ----------------------------------------
create or replace function public.get_active_flash_sales()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t order by t.ends_at asc), '[]'::jsonb)
  from (
    select id, title, discount_percent, store_product_ids, starts_at, ends_at
    from public.flash_sales
    where is_active and now() between starts_at and ends_at
  ) t;
$$;

revoke all on function public.get_active_flash_sales() from public;
grant execute on function public.get_active_flash_sales() to anon, authenticated;

-- 4. Settlement reconciliation -------------------------------------------------
create or replace function public.reconcile_settlements()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_missing jsonb;
  v_mismatched jsonb;
begin
  -- Guard: JWT-borne callers must be admin. Cron/postgres context has no JWT
  -- (auth.uid() IS NULL) and is allowed so the nightly job can run.
  if auth.uid() is not null and not is_admin() then
    raise exception 'FORBIDDEN: admin only' using errcode = '42501';
  end if;

  -- Delivered paid orders with NO settlement ledger entry.
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_missing
  from (
    select o.id as order_id, o.order_number, o.store_id, o.total_paise
    from public.orders o
    join public.payments p on p.order_id = o.id
    where o.status = 'delivered'
      and p.status = 'captured'
      and not exists (
        select 1 from public.settlement_ledger sl where sl.order_id = o.id
      )
    order by o.placed_at desc
    limit 200
  ) t;

  -- Ledger entries whose net amount doesn't match order total - expected flow.
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_mismatched
  from (
    select sl.id as ledger_id, sl.order_id, o.order_number,
           sl.net_amount_paise, o.total_paise
    from public.settlement_ledger sl
    join public.orders o on o.id = sl.order_id
    where abs(sl.net_amount_paise + sl.commission_paise - sl.gross_amount_paise) > 0
    limit 200
  ) t;

  return jsonb_build_object(
    'checked_at', now(),
    'missing_settlements', v_missing,
    'amount_mismatches', v_mismatched
  );
end;
$$;

revoke all on function public.reconcile_settlements() from public, anon;
grant execute on function public.reconcile_settlements() to authenticated;

-- 5. Recommendations (repeat-purchase first, bestsellers filler) ---------------
create or replace function public.get_recommended_products(
  p_store_id uuid,
  p_limit integer default 8
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_result
  from (
    -- Repeat purchases: this user's most-ordered in-stock items at the store.
    select oi.product_id, oi.product_name_snapshot, max(oi.unit_label_snapshot) as unit_label,
           sum(oi.qty) as score, true as repeat_purchase
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.store_products sp on sp.id = oi.store_product_id
    join public.inventory inv on inv.store_product_id = sp.id
    where o.customer_id = v_user_id
      and o.store_id = p_store_id
      and o.status not in ('cancelled', 'refunded')
      and sp.is_available
      and inv.available_to_sell > 0
    group by oi.product_id, oi.product_name_snapshot
    order by score desc
    limit greatest(p_limit, 1)
  ) t;

  -- Fill remaining slots with store bestsellers.
  if coalesce(jsonb_array_length(v_result), 0) < p_limit then
    select coalesce(
      v_result || coalesce(jsonb_agg(t2), '[]'::jsonb), v_result
    ) into v_result
    from (
      select oi.product_id, oi.product_name_snapshot, max(oi.unit_label_snapshot) as unit_label,
            sum(oi.qty) as score, false as repeat_purchase
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      join public.store_products sp on sp.id = oi.store_product_id
      join public.inventory inv on inv.store_product_id = sp.id
      where o.store_id = p_store_id
        and o.status not in ('cancelled', 'refunded')
        and sp.is_available
        and inv.available_to_sell > 0
        and not exists (
          select 1 from jsonb_array_elements(coalesce(v_result, '[]'::jsonb)) el
          where el->>'product_id' = oi.product_id::text
        )
      group by oi.product_id, oi.product_name_snapshot
      order by score desc
      limit greatest(p_limit - coalesce(jsonb_array_length(v_result), 0), 0)
    ) t2;
  end if;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.get_recommended_products(uuid, integer) from public, anon;
grant execute on function public.get_recommended_products(uuid, integer) to authenticated;

-- 6. Cron jobs -----------------------------------------------------------------
do $$
begin
  -- Expire finished flash sales hourly (keeps reads fast + list clean).
  if not exists (select 1 from cron.job where jobname = 'zaff-expire-flash-sales') then
    perform cron.schedule(
      'zaff-expire-flash-sales',
      '5 * * * *',
      $cron$ update public.flash_sales set is_active = false where is_active and ends_at < now(); $cron$
    );
  end if;

  -- Nightly settlement reconciliation (report lands in function result/audit).
  if not exists (select 1 from cron.job where jobname = 'zaff-reconcile-settlements') then
    perform cron.schedule(
      'zaff-reconcile-settlements',
      '0 2 * * *',
      $cron$ select public.reconcile_settlements(); $cron$
    );
  end if;
exception when others then
  raise notice 'cron schedule skipped: %', sqlerrm;
end;
$$;
