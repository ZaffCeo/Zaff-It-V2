-- ===========================================================================
-- ZAFF-IT Migration 009: Platform Backbone
-- ---------------------------------------------------------------------------
-- Adds the ecosystem tables required for Phase-4 "business platform" and
-- Phase-5 "ecosystem" modules (founder blueprint, Nov 2026):
--   * ZaffCoin wallet: wallet_ledger (immutable) + award/redeem RPCs
--   * Promotions: coupons, coupon_redemptions, flash_sales
--   * Comms: notifications (feed; inserts via service role only)
--   * Social proof: reviews (1 per order item, rating 1..5)
--   * Subscriptions skeleton: plans, subscriptions
--   * Multi-shop order splitting readiness: orders.parent_order_id
--   * Merchant governance: shop_documents, approvals, disputes
-- Security: RLS on every new table, least-privilege EXECUTE grants, wallet
-- inserts definer-only (client can never fabricate coins).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. ZaffCoin wallet ledger (immutable, append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('earn', 'redeem', 'adjust', 'expire')),
  coins integer not null check (coins <> 0),
  reason text not null,
  reference_type text check (reference_type in ('order', 'review', 'referral', 'redemption', 'admin', 'expiry')),
  reference_id uuid,
  balance_after integer not null,
  created_at timestamptz not null default now()
);

alter table public.wallet_ledger enable row level security;

create policy "wallet_ledger_select_own"
  on public.wallet_ledger for select
  to authenticated
  using (auth.uid() = user_id or is_admin());

revoke insert, update, delete on public.wallet_ledger from anon, authenticated;
-- Inserts happen ONLY through award_coins/redeem_coins (security definer) or
-- the service role. No client-facing INSERT policy exists at all.

create index if not exists wallet_ledger_user_created_idx
  on public.wallet_ledger (user_id, created_at desc);

-- Award coins atomically. Per-user advisory lock serialises concurrent awards
-- so balance_after is always the true running total.
create or replace function public.award_coins(
  p_user_id uuid,
  p_coins integer,
  p_reason text,
  p_reference_type text default null,
  p_reference_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_coins <= 0 then
    raise exception 'award_coins: p_coins must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 42));

  select coalesce(sum(coins), 0) into v_balance
  from public.wallet_ledger where user_id = p_user_id;

  insert into public.wallet_ledger (
    user_id, entry_type, coins, reason, reference_type, reference_id, balance_after
  ) values (
    p_user_id, 'earn', p_coins, p_reason, p_reference_type, p_reference_id,
    v_balance + p_coins
  );

  return v_balance + p_coins;
end;
$$;

-- Redeem coins atomically; raises if balance is insufficient.
create or replace function public.redeem_coins(
  p_user_id uuid,
  p_coins integer,
  p_reason text,
  p_reference_type text default null,
  p_reference_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_coins <= 0 then
    raise exception 'redeem_coins: p_coins must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 42));

  select coalesce(sum(coins), 0) into v_balance
  from public.wallet_ledger where user_id = p_user_id;

  if v_balance < p_coins then
    raise exception 'INSUFFICIENT_COINS: balance %, needed %', v_balance, p_coins
      using errcode = 'P0002';
  end if;

  insert into public.wallet_ledger (
    user_id, entry_type, coins, reason, reference_type, reference_id, balance_after
  ) values (
    p_user_id, 'redeem', -p_coins, p_reason, p_reference_type, p_reference_id,
    v_balance - p_coins
  );

  return v_balance - p_coins;
end;
$$;

-- SECURITY: both functions are SERVICE_ROLE-ONLY. They mint/spend currency and
-- take an explicit p_user_id, so no client role may call them directly (a
-- signed-in user could otherwise mint coins to themselves or drain another
-- user's balance). Redemption flows through the checkout edge function.
revoke all on function public.award_coins(uuid, integer, text, text, uuid) from public, anon, authenticated;
revoke all on function public.redeem_coins(uuid, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.award_coins(uuid, integer, text, text, uuid) to service_role;
grant execute on function public.redeem_coins(uuid, integer, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Coupons + redemptions + flash sales
-- ---------------------------------------------------------------------------
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type text not null check (discount_type in ('percent', 'flat', 'free_delivery')),
  discount_value integer not null default 0, -- percent (0-100) or flat paise
  max_discount_paise integer,
  min_order_paise integer not null default 0,
  max_redemptions integer,
  per_user_limit integer not null default 1,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.coupons enable row level security;

create policy "coupons_read_active"
  on public.coupons for select
  to anon, authenticated
  using (is_active and (valid_until is null or valid_until > now()));

create policy "coupons_admin_all"
  on public.coupons for all
  to authenticated
  using (is_admin()) with check (is_admin());

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id),
  user_id uuid not null references auth.users(id),
  order_id uuid references public.orders(id),
  redeemed_at timestamptz not null default now(),
  unique (coupon_id, user_id, order_id)
);

alter table public.coupon_redemptions enable row level security;

create policy "coupon_redemptions_select_own"
  on public.coupon_redemptions for select
  to authenticated
  using (auth.uid() = user_id or is_admin());

revoke insert, update, delete on public.coupon_redemptions from anon, authenticated;

create table if not exists public.flash_sales (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  discount_percent integer not null check (discount_percent between 1 and 90),
  store_product_ids uuid[] not null default '{}',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table public.flash_sales enable row level security;

create policy "flash_sales_read"
  on public.flash_sales for select
  to anon, authenticated
  using (true);

create policy "flash_sales_admin_write"
  on public.flash_sales for all
  to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- 3. Notifications (in-app feed; writes via service role / future edge fn)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'system' check (kind in ('order', 'promo', 'system', 'zaffy', 'wallet')),
  title text not null,
  body text,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

create policy "notifications_mark_read_own"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke insert, delete on public.notifications from anon, authenticated;

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Reviews (social proof; one per store-product per order)
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  user_id uuid not null references auth.users(id),
  store_product_id uuid not null references public.store_products(id),
  rating integer not null check (rating between 1 and 5),
  comment text,
  image_url text,
  created_at timestamptz not null default now(),
  unique (order_id, store_product_id)
);

alter table public.reviews enable row level security;

create policy "reviews_read_all"
  on public.reviews for select
  to anon, authenticated
  using (true);

create policy "reviews_insert_own"
  on public.reviews for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "reviews_update_own"
  on public.reviews for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke delete on public.reviews from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Subscriptions skeleton (merchant Pro / customer VIP later)
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_paise integer not null default 0,
  duration_days integer not null default 30,
  perks jsonb not null default '[]'::jsonb,
  audience text not null default 'merchant' check (audience in ('merchant', 'customer', 'rider')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.plans enable row level security;

create policy "plans_read_active"
  on public.plans for select
  to anon, authenticated
  using (is_active);

create policy "plans_admin_write"
  on public.plans for all
  to authenticated
  using (is_admin()) with check (is_admin());

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id),
  user_id uuid references auth.users(id),
  merchant_id uuid references public.merchants(id),
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired', 'trialing')),
  started_at timestamptz not null default now(),
  current_period_end timestamptz not null,
  auto_renew boolean not null default true,
  created_at timestamptz not null default now(),
  check (user_id is not null or merchant_id is not null)
);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id or is_admin());

revoke insert, update, delete on public.subscriptions from anon, authenticated;
-- Writes arrive via service role (checkout/subscription edge functions).

-- ---------------------------------------------------------------------------
-- 6. Multi-shop order splitting readiness (parent/child orders)
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists parent_order_id uuid references public.orders(id);

create index if not exists orders_parent_idx
  on public.orders (parent_order_id) where parent_order_id is not null;

-- ---------------------------------------------------------------------------
-- 7. Merchant KYC documents
-- ---------------------------------------------------------------------------
create table if not exists public.shop_documents (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id),
  doc_type text not null check (doc_type in ('gst', 'fssai', 'pan', 'id_proof', 'shop_photo', 'bank_proof')),
  file_path text not null, -- storage path, never raw secrets
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

alter table public.shop_documents enable row level security;

create policy "shop_documents_owner_select"
  on public.shop_documents for select
  to authenticated
  using (
    exists (
      select 1 from public.merchants m
      where m.id = merchant_id and m.owner_user_id = auth.uid()
    ) or is_admin()
  );

create policy "shop_documents_owner_insert"
  on public.shop_documents for insert
  to authenticated
  with check (
    exists (
      select 1 from public.merchants m
      where m.id = merchant_id and m.owner_user_id = auth.uid()
    )
  );

create policy "shop_documents_admin_update"
  on public.shop_documents for update
  to authenticated
  using (is_admin()) with check (is_admin());

revoke delete on public.shop_documents from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Approvals (generic admin queue) + disputes
-- ---------------------------------------------------------------------------
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('merchant', 'product', 'store', 'ad', 'payout', 'document')),
  entity_id uuid not null,
  requested_by uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

alter table public.approvals enable row level security;

create policy "approvals_admin_all"
  on public.approvals for all
  to authenticated
  using (is_admin()) with check (is_admin());

create policy "approvals_select_requester"
  on public.approvals for select
  to authenticated
  using (auth.uid() = requested_by);

create policy "approvals_requester_insert"
  on public.approvals for insert
  to authenticated
  with check (auth.uid() = requested_by);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  raised_by uuid not null references auth.users(id),
  category text not null check (category in ('order', 'delivery', 'settlement', 'product_quality')),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'rejected')),
  resolution text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.disputes enable row level security;

create policy "disputes_select_participant"
  on public.disputes for select
  to authenticated
  using (auth.uid() = raised_by or is_admin());

create policy "disputes_insert_own"
  on public.disputes for insert
  to authenticated
  with check (auth.uid() = raised_by);

create policy "disputes_admin_update"
  on public.disputes for update
  to authenticated
  using (is_admin()) with check (is_admin());

revoke delete on public.disputes from anon, authenticated;

create index if not exists disputes_order_idx on public.disputes (order_id);
