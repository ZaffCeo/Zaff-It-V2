-- ===========================================================================
-- ZAFF-IT Migration 013: Catalog Platform P1 — identity, prices, review loop
-- ---------------------------------------------------------------------------
-- Blueprint: docs/research/multi-source-platform-research.md (checklist 1-4)
--  * Permanent public identity: ZP-000000001 (auto-assigned when a product is
--    published/approved; never reused, never shown for drafts).
--  * Catalog breadth tables: variants, barcodes, attributes, prices (8 price
--    types never mixed), mandi raw prices (AGMARKNET), sources + licenses +
--    external mappings (provenance at source level).
--  * Governance: change_history (immutable audit), api_clients (hashed keys),
--    api_usage_logs, admin review RPC (approve/reject with audit + ZP-ID).
--  * Queue: adds 'agmarknet_price' job type (worker handles it; dormant until
--    DATA_GOV_IN_API_KEY secret exists).
-- ===========================================================================

-- 1. Zaff Product ID ----------------------------------------------------------
create sequence if not exists public.zaff_product_id_seq start 1;

alter table public.products
  add column if not exists zaff_product_id text;

create unique index if not exists products_zpid_uq
  on public.products (zaff_product_id) where zaff_product_id is not null;

create or replace function public.assign_zaff_product_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.zaff_product_id is null
     and new.verification_status in ('auto_published','admin_verified') then
    new.zaff_product_id := 'ZP-' || lpad(nextval('public.zaff_product_id_seq')::text, 9, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_zpid on public.products;
create trigger trg_assign_zpid
  before insert or update of verification_status, zaff_product_id
  on public.products
  for each row execute function public.assign_zaff_product_id();

-- 2. Variants / barcodes / attributes -----------------------------------------
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_name text not null,
  barcode text,
  unit_label text not null,
  attributes jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (product_id, variant_name)
);

create table if not exists public.barcodes (
  barcode text primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  source_system text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.product_attributes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  attribute_key text not null,
  attribute_value text not null,
  source_system text,
  confidence numeric not null default 0.5 check (confidence between 0 and 1),
  verification_status text not null default 'unverified',
  unique (product_id, attribute_key)
);

create index if not exists barcodes_product_idx on public.barcodes (product_id);
create index if not exists product_attributes_product_idx on public.product_attributes (product_id);

-- 3. Prices: 8 types never mixed + mandi raw observations ---------------------
create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  price_type text not null check (price_type in (
    'mrp','manufacturer_suggested','mandi_wholesale','retail_reference',
    'ecommerce_listing','local_vendor','zaff_selling','historical')),
  amount_paise integer not null check (amount_paise >= 0),
  currency text not null default 'INR',
  unit_label text,
  location_type text check (location_type in ('pincode','district','mandi','national')),
  location_value text,
  source_system text not null,
  source_record_id text,
  captured_at timestamptz not null default now(),
  verified_at timestamptz,
  valid_until timestamptz,
  license text,
  confidence numeric not null default 0.5 check (confidence between 0 and 1),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','verified','stale','rejected')),
  created_at timestamptz not null default now()
);

create index if not exists product_prices_lookup_idx
  on public.product_prices (product_id, price_type, captured_at desc);

create table if not exists public.mandi_prices (
  id uuid primary key default gen_random_uuid(),
  commodity text not null,
  variety text,
  grade text,
  mandi text not null,
  district text,
  state text,
  min_price numeric,
  modal_price numeric,
  max_price numeric,
  price_unit text not null default 'quintal',
  arrival_date date not null,
  source_record text,
  created_at timestamptz not null default now(),
  unique (commodity, variety, grade, mandi, arrival_date)
);

create index if not exists mandi_prices_lookup_idx
  on public.mandi_prices (commodity, arrival_date desc);

-- 4. Source registry + external mappings --------------------------------------
create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  base_url text,
  license_slug text,
  attribution_template text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.source_licenses (
  slug text primary key,
  name text not null,
  commercial_use boolean not null default false,
  attribution_required boolean not null default true,
  share_alike boolean not null default false,
  summary text,
  reference_url text
);

create table if not exists public.source_product_mappings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  source_slug text not null,
  source_id text not null,
  url text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_slug, source_id)
);

create index if not exists source_mappings_product_idx on public.source_product_mappings (product_id);

-- Seed known licenses (docs/research §6 matrix)
insert into public.source_licenses (slug, name, commercial_use, attribution_required, share_alike, summary, reference_url)
values
  ('odbl', 'ODbL 1.0', true, true, true, 'Open data license with share-alike on derived databases.', 'https://opendatacommons.org/licenses/odbl/'),
  ('cc-by-sa-4', 'CC BY-SA 4.0', true, true, true, 'Attribution + share-alike.', 'https://creativecommons.org/licenses/by-sa/4.0/'),
  ('cc-by-4', 'CC BY 4.0', true, true, false, 'Attribution required.', 'https://creativecommons.org/licenses/by/4.0/'),
  ('cc0', 'CC0 1.0', true, false, false, 'Public domain dedication.', 'https://creativecommons.org/publicdomain/zero/1.0/'),
  ('cc-pd', 'Public Domain', true, false, false, 'No rights reserved.', 'https://creativecommons.org/publicdomain/mark/1.0/'),
  ('pixabay', 'Pixabay Content License', true, false, false, 'Commercial OK; no redistribution as stock service.', 'https://pixabay.com/service/license/'),
  ('godl-india', 'Government Open Data License - India', true, true, false, 'Govt of India open data; attribution "Source: data.gov.in".', 'https://data.gov.in/government-open-data-license-india'),
  ('unsplash', 'Unsplash License', false, true, false, 'Display/hotlink only; NO storing copies.', 'https://unsplash.com/license')
on conflict (slug) do nothing;

insert into public.sources (slug, name, base_url, license_slug, attribution_template)
values
  ('open_food_facts', 'Open Food Facts', 'https://world.openfoodfacts.org', 'odbl', 'Data and images © Open Food Facts contributors (CC BY-SA 4.0)'),
  ('wikimedia_commons', 'Wikimedia Commons', 'https://commons.wikimedia.org', 'cc-pd', 'Wikimedia Commons contributors (per-file license)'),
  ('openverse', 'Openverse', 'https://api.openverse.org', 'cc-by-4', 'Made with Openverse (per-item CC license)'),
  ('agmarknet', 'AGMARKNET (data.gov.in)', 'https://data.gov.in', 'godl-india', 'Source: AGMARKNET, Dept. of Agriculture & Farmers Welfare, Govt of India'),
  ('seller', 'Zaff Seller Uploads', null, 'cc0', 'Zaff / seller original content'),
  ('zaff_transactions', 'Zaff Own Orders', null, 'cc0', 'Zaff internal pricing')
on conflict (slug) do nothing;

-- 5. Governance: audit + API clients ------------------------------------------
create table if not exists public.change_history (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id uuid not null,
  actor text,
  diff jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists change_history_entity_idx on public.change_history (entity, entity_id, created_at desc);

create table if not exists public.api_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique,
  key_prefix text,
  plan text not null default 'free' check (plan in ('free','growth','commercial')),
  rate_limit_per_min integer not null default 60,
  daily_quota integer not null default 10000,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.api_usage_logs (
  id bigint generated always as identity primary key,
  client_id uuid references public.api_clients(id) on delete set null,
  endpoint text not null,
  status_code integer,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists api_usage_logs_client_idx on public.api_usage_logs (client_id, created_at desc);

-- 6. Queue: allow agmarknet_price job type ------------------------------------
do $$
declare c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.catalog_ingest_queue'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%job_type%';
  if c is not null then
    execute format('alter table public.catalog_ingest_queue drop constraint %I', c);
  end if;
end $$;

alter table public.catalog_ingest_queue
  add constraint catalog_ingest_queue_job_type_check
  check (job_type in ('off_barcode','off_search','wikimedia_image','image_generation','merge_check','agmarknet_price'));

-- 7. Admin review RPC (approve/reject with audit) ------------------------------
create or replace function public.approve_catalog_product(
  p_product_id uuid,
  p_decision text,
  p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_at timestamptz := now();
begin
  if not is_admin() then
    raise insufficient_privilege using message = 'admin role required';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'invalid_decision';
  end if;

  update public.products set
    verification_status = case when p_decision = 'approve' then 'admin_verified' else 'rejected' end,
    is_active = (p_decision = 'approve'),
    updated_at = v_at
  where id = p_product_id
  returning id into v_id;

  if v_id is null then
    raise exception 'product_not_found';
  end if;

  insert into public.change_history (entity, entity_id, actor, diff)
  values ('product', p_product_id, auth.uid()::text,
          jsonb_build_object('action', p_decision, 'note', p_note, 'at', v_at));

  return json_build_object('product_id', v_id, 'decision', p_decision);
end $$;

revoke all on function public.approve_catalog_product(uuid, text, text) from anon, authenticated;
grant execute on function public.approve_catalog_product(uuid, text, text) to authenticated;

-- 8. Admin review view (security_invoker: respects products RLS) ---------------
drop view if exists public.catalog_review_queue;
create view public.catalog_review_queue
with (security_invoker = true)
as
  select id, zaff_product_id, name, brand, barcode, image_url, source_system,
         verification_status, unit_label, created_at
  from public.products
  where verification_status = 'needs_review';

-- 9. RLS + grants (mirror migration 012/009 patterns) --------------------------
alter table public.product_variants      enable row level security;
alter table public.barcodes              enable row level security;
alter table public.product_attributes    enable row level security;
alter table public.product_prices        enable row level security;
alter table public.mandi_prices          enable row level security;
alter table public.sources               enable row level security;
alter table public.source_licenses       enable row level security;
alter table public.source_product_mappings enable row level security;
alter table public.change_history        enable row level security;
alter table public.api_clients           enable row level security;
alter table public.api_usage_logs        enable row level security;

-- Public factual reads
create policy "variants_read" on public.product_variants for select to anon, authenticated using (true);
create policy "barcodes_read" on public.barcodes for select to anon, authenticated using (true);
create policy "attributes_read" on public.product_attributes for select to anon, authenticated using (true);
create policy "prices_read" on public.product_prices for select to anon, authenticated
  using (verification_status in ('verified','stale'));
create policy "mandi_read" on public.mandi_prices for select to anon, authenticated using (true);
create policy "sources_read" on public.sources for select to anon, authenticated using (true);
create policy "licenses_read" on public.source_licenses for select to anon, authenticated using (true);

-- Admin reads/writes (governance tables)
create policy "mappings_admin_all" on public.source_product_mappings for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "history_admin_read" on public.change_history for select to authenticated using (is_admin());
create policy "history_admin_insert" on public.change_history for insert to authenticated with check (is_admin());
create policy "api_clients_admin_all" on public.api_clients for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "usage_admin_read" on public.api_usage_logs for select to authenticated using (is_admin());

-- Catalog content writes: admin via UI, service via worker
create policy "variants_admin_write" on public.product_variants for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "barcodes_admin_write" on public.barcodes for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "attributes_admin_write" on public.product_attributes for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "prices_admin_write" on public.product_prices for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "mandi_admin_write" on public.mandi_prices for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "sources_admin_write" on public.sources for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "licenses_admin_write" on public.source_licenses for all to authenticated
  using (is_admin()) with check (is_admin());

-- Service-role (worker) full access; revoke anon writes everywhere
grant all on public.product_variants, public.barcodes, public.product_attributes,
  public.product_prices, public.mandi_prices, public.sources, public.source_licenses,
  public.source_product_mappings, public.change_history, public.api_clients,
  public.api_usage_logs to service_role;
revoke all on public.product_variants, public.barcodes, public.product_attributes,
  public.product_prices, public.mandi_prices, public.sources, public.source_licenses,
  public.source_product_mappings, public.change_history, public.api_clients,
  public.api_usage_logs from anon;
grant select on public.product_variants, public.barcodes, public.product_attributes,
  public.product_prices, public.mandi_prices, public.sources, public.source_licenses to anon;
