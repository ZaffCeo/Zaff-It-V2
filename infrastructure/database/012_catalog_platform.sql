-- ===========================================================================
-- ZAFF-IT Migration 012: Zaff Product Data Platform (catalog backbone)
-- ---------------------------------------------------------------------------
-- Founder blueprint (Nov 2026), approved:
--   * Free-source ingestion (Open Food Facts first) with FULL provenance from
--     day one (ODbL / CC BY-SA compliance): source, source-id, license,
--     attribution, raw snapshot.
--   * Background queue processed by the catalog-ingest edge function
--     (AI enrichment via provider chain; AI NEVER invents barcode/MRP/weight/
--     nutrition/brand — LLM only normalizes text fields from verified data).
--   * Controlled autonomy: verified+complete -> auto_published; uncertain ->
--     needs_review (invisible until admin approves); license-unclear -> reject.
--   * Image policy: real OFF/Commons images preferred; AI-generated images are
--     a separate queue (image_generation) and ALWAYS labeled ai_generated.
--   * Duplicates -> merge suggestions, never destructive auto-merge.
-- Scheduler: pg_cron + pg_net kick the edge function every 30 min (free).
-- ===========================================================================

-- 1. products: provenance + Hindi name + verification state ------------------
alter table public.products
  add column if not exists hi_name text,
  add column if not exists source_system text not null default 'seller',
  add column if not exists verification_status text not null default 'unverified';

-- 2. Ingestion queue (service-role worker only) -------------------------------
create table if not exists public.catalog_ingest_queue (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('off_barcode','off_search','wikimedia_image','image_generation','merge_check')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','done','failed','needs_review')),
  priority integer not null default 100,
  attempts integer not null default 0,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.catalog_ingest_queue enable row level security;
-- No policies: PostgREST anon/authenticated denied. Service role (worker) bypasses RLS.
revoke all on public.catalog_ingest_queue from anon, authenticated;
grant all on public.catalog_ingest_queue to service_role;

create index if not exists catalog_queue_status_idx
  on public.catalog_ingest_queue (status, priority, created_at) where status = 'pending';

-- 3. Provenance ledger (append-only evidence, ODbL compliance) ----------------
create table if not exists public.product_provenance (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  source_system text not null,
  source_id text,
  license text not null,
  attribution text not null,
  raw_snapshot jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.product_provenance enable row level security;
revoke all on public.product_provenance from anon, authenticated;
grant all on public.product_provenance to service_role;
grant select on public.product_provenance to authenticated; -- admin/support reads

create index if not exists provenance_product_idx on public.product_provenance (product_id);
create index if not exists provenance_source_idx on public.product_provenance (source_system, source_id);

-- 4. Product images (multi-image, license + AI labels) ------------------------
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  kind text not null check (kind in ('real','generated','seller')),
  license text,
  attribution text,
  ai_generated boolean not null default false,
  prompt text,
  status text not null default 'approved' check (status in ('approved','pending_review','rejected')),
  created_at timestamptz not null default now()
);

alter table public.product_images enable row level security;

create policy "product_images_read_approved"
  on public.product_images for select
  to anon, authenticated
  using (status = 'approved');

create policy "product_images_admin_all"
  on public.product_images for all
  to authenticated
  using (is_admin()) with check (is_admin());

revoke insert, update, delete on public.product_images from anon, authenticated;
grant insert, update, delete on public.product_images to service_role;

create index if not exists product_images_product_idx on public.product_images (product_id);

-- 5. Duplicate merge suggestions (never destructive auto-merge) ---------------
create table if not exists public.catalog_merge_suggestions (
  id uuid primary key default gen_random_uuid(),
  keep_product_id uuid not null references public.products(id) on delete cascade,
  duplicate_product_id uuid not null references public.products(id) on delete cascade,
  match_reason text not null,
  confidence numeric not null default 0.5 check (confidence between 0 and 1),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (keep_product_id, duplicate_product_id),
  check (keep_product_id <> duplicate_product_id)
);

alter table public.catalog_merge_suggestions enable row level security;

create policy "merge_suggestions_admin_all"
  on public.catalog_merge_suggestions for all
  to authenticated
  using (is_admin()) with check (is_admin());

revoke all on public.catalog_merge_suggestions from anon, authenticated;
grant all on public.catalog_merge_suggestions to service_role;

-- 6. Hourly worker kick: pg_cron -> pg_net -> edge function -------------------
-- SECURITY (rotated 2026-11-27): the literal token was removed from this
-- migration (it had been committed and exposed in git history). The cron now
-- reads the token from the locked-down ops_catalog_ingest_token table (no RLS
-- policies -> only service_role/postgres). Fresh databases: run
-- 020_catalog_ingest_token_ops.sql right after this file to create the table
-- and set the real token (kept out of git — see that file's header).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'zaff-catalog-ingest-kick') then
    perform cron.schedule(
      'zaff-catalog-ingest-kick',
      '*/30 * * * *',
      $cron$
      select net.http_post(
        url := 'https://mglypwlmwzktxnvlomke.supabase.co/functions/v1/catalog-ingest',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-ingest-token', (select token_text from public.ops_catalog_ingest_token where id = 1)
        ),
        body := jsonb_build_object('limit', 5)
      );
      $cron$
    );
  end if;
exception when others then
  raise notice 'catalog kick schedule skipped: %', sqlerrm;
end;
$$;
