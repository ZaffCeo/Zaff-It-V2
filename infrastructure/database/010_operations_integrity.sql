-- ===========================================================================
-- ZAFF-IT Migration 010: Operations Integrity + Merchant Intelligence
-- ---------------------------------------------------------------------------
-- Founder blueprint P0/P1 items (Nov 2026 audit):
--   P0 FIX: stale payment_pending orders leaked reserved inventory forever
--           (user abandons Razorpay checkout -> stock phantom-out).
--           -> expire_stale_payment_pending_orders() + pg_cron schedule.
--   P1 SLICE: merchant daily intelligence RPC (best sellers, low stock,
--           unsold 7d, today's revenue) -> get_merchant_daily_insights().
-- Note: order idempotency was already shipped in 003 (orders.idempotency_key
-- + replay check in create_checkout_order); no change needed here.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Stale-order expiry sweeper (inventory leak fix)
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_payment_pending_orders(
  p_max_age_minutes integer default 30
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_order record;
  v_item record;
  v_expired uuid[] := '{}';
  v_cutoff timestamptz;
begin
  if p_max_age_minutes is null or p_max_age_minutes < 5 then
    p_max_age_minutes := 5; -- floor: never expire a payment window < 5 min
  end if;
  v_cutoff := now() - make_interval(mins => p_max_age_minutes);

  for v_order in
    select id, customer_id, order_number
    from public.orders
    where status = 'payment_pending'
      and created_at < v_cutoff
    order by created_at
    for update skip locked
  loop
    -- Release the reserved stock via the proven per-item function.
    for v_item in
      select store_product_id, qty
      from public.order_items
      where order_id = v_order.id
      order by store_product_id
    loop
      begin
        perform public.release_inventory(
          v_item.store_product_id,
          v_item.qty,
          v_order.id,
          'payment_window_expired'
        );
      exception when others then
        -- Item already released elsewhere; keep sweeping the rest.
        null;
      end;
    end loop;

    update public.orders
    set status = 'cancelled'
    where id = v_order.id;

    update public.payments
    set status = 'failed'
    where order_id = v_order.id
      and status = 'created';

    perform public.record_audit_log(
      null,
      'system',
      'order.expire_stale_payment',
      'orders',
      v_order.id,
      jsonb_build_object('status', 'payment_pending'),
      jsonb_build_object('status', 'cancelled'),
      jsonb_build_object('order_number', v_order.order_number, 'reason', 'payment_window_expired')
    );

    v_expired := v_expired || v_order.id;
  end loop;

  return jsonb_build_object('expired_count', coalesce(array_length(v_expired, 1), 0), 'order_ids', to_jsonb(v_expired));
end;
$$;

revoke all on function public.expire_stale_payment_pending_orders(integer) from public, anon, authenticated;
grant execute on function public.expire_stale_payment_pending_orders(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Merchant daily intelligence
-- ---------------------------------------------------------------------------
create or replace function public.get_merchant_daily_insights(
  p_store_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_today_orders integer;
  v_today_revenue_paise integer;
  v_avg_order_paise integer;
  v_top_today jsonb;
  v_top_7d jsonb;
  v_low_stock jsonb;
  v_unsold jsonb;
begin
  -- Access: admins or the merchant who owns this store.
  if not (is_admin() or is_merchant_owner_of_store(p_store_id)) then
    raise exception 'NOT_AUTHORIZED: not the owner of store %', p_store_id
      using errcode = '42501';
  end if;

  select
    count(*), coalesce(sum(total_paise), 0), coalesce(round(avg(total_paise)), 0)
  into v_today_orders, v_today_revenue_paise, v_avg_order_paise
  from public.orders
  where store_id = p_store_id
    and status not in ('cancelled', 'refunded')
    and placed_at >= date_trunc('day', now());

  -- Best sellers: today first; 7-day window keeps the widget useful on slow days.
  select coalesce(
    jsonb_agg(t order by t.qty desc),
    '[]'::jsonb
  ) into v_top_today
  from (
    select oi.product_name_snapshot as name, sum(oi.qty) as qty, sum(oi.line_total_paise) as revenue_paise
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.store_id = p_store_id
      and o.status not in ('cancelled', 'refunded')
      and o.placed_at >= date_trunc('day', now())
    group by oi.product_name_snapshot
    order by qty desc
    limit 5
  ) t;

  select coalesce(jsonb_agg(t order by t.qty desc), '[]'::jsonb) into v_top_7d
  from (
    select oi.product_name_snapshot as name, sum(oi.qty) as qty, sum(oi.line_total_paise) as revenue_paise
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.store_id = p_store_id
      and o.status not in ('cancelled', 'refunded')
      and o.placed_at >= now() - interval '7 days'
    group by oi.product_name_snapshot
    order by qty desc
    limit 5
  ) t;

  -- Low stock: running low, most urgent first.
  select coalesce(jsonb_agg(t order by t.available asc), '[]'::jsonb) into v_low_stock
  from (
    select p.name, sp.id as store_product_id, inv.available_to_sell as available
    from public.store_products sp
    join public.products p on p.id = sp.product_id
    join public.inventory inv on inv.store_product_id = sp.id
    where sp.store_id = p_store_id
      and sp.is_available
    order by inv.available_to_sell asc
    limit 20
  ) t
  where t.available <= 10;

  -- Unsold 7d: active catalogue items with zero sales this week.
  select coalesce(jsonb_agg(t order by t.name), '[]'::jsonb) into v_unsold
  from (
    select p.name, sp.id as store_product_id
    from public.store_products sp
    join public.products p on p.id = sp.product_id
    where sp.store_id = p_store_id
      and sp.is_available
      and not exists (
        select 1
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where oi.store_product_id = sp.id
          and o.status not in ('cancelled', 'refunded')
          and o.placed_at >= now() - interval '7 days'
      )
    order by p.name
    limit 20
  ) t;

  return jsonb_build_object(
    'store_id', p_store_id,
    'generated_at', now(),
    'today_orders', v_today_orders,
    'today_revenue_paise', v_today_revenue_paise,
    'avg_order_paise', v_avg_order_paise,
    'top_products_today', v_top_today,
    'top_products_7d', v_top_7d,
    'low_stock', v_low_stock,
    'unsold_7d', v_unsold
  );
end;
$$;

revoke all on function public.get_merchant_daily_insights(uuid) from public, anon;
grant execute on function public.get_merchant_daily_insights(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Free scheduler (pg_cron): sweep every 15 minutes. If the extension or
-- schedule perms are unavailable the functions above still work when invoked
-- from the order-lifecycle edge function — degrade gracefully, never fail.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'zaff-expire-stale-orders') then
    perform cron.schedule(
      'zaff-expire-stale-orders',
      '*/15 * * * *',
      $cron$ select public.expire_stale_payment_pending_orders(30); $cron$
    );
  end if;
exception when others then
  -- pg_cron scheduling unavailable in this environment: sweeper stays callable
  -- via service role (edge function). Non-fatal.
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end;
$$;
