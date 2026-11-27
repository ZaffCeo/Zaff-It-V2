-- ============================================================================
-- 020_catalog_ingest_token_ops.sql
-- Catalog ingest token OPS mechanism + rotation record.
--
-- WHY: migration 012 committed the live x-ingest-token literal into git
-- (exposed in history). On 2026-11-27 the token was ROTATED:
--   * new value set as the CATALOG_INGEST_TOKEN edge-function secret
--   * cron job 'zaff-catalog-ingest-kick' rescheduled to read the token from
--     public.ops_catalog_ingest_token (this file creates it) instead of a literal
--   * the old token is inert; git-history rewrite is optional and founder-owned
--
-- SECURITY MODEL:
--   * ops_catalog_ingest_token has RLS enabled and NO policies -> anon /
--     authenticated cannot read it; only service_role / postgres (cron owner).
--   * ops_rotate_catalog_kick_token(p_new) is SECURITY DEFINER, executable by
--     service_role only; it updates the row AND reschedules the cron job.
--   * The REAL token is NEVER committed to git. Set it live via:
--       select public.ops_rotate_catalog_kick_token('<new-token>');
--     (SQL editor / service-role session) matching the function secret.
-- ============================================================================

create table if not exists public.ops_catalog_ingest_token (
    id int primary key default 1 check (id = 1),
    token_text text not null default '',
    rotated_at timestamptz not null default now()
);

revoke all on public.ops_catalog_ingest_token from anon, authenticated;
alter table public.ops_catalog_ingest_token enable row level security;
-- NOTE: intentionally no RLS policies — anon/authenticated get zero rows;
-- the pg_cron job (postgres role) and service_role bypass RLS by design.

create or replace function public.ops_rotate_catalog_kick_token(p_new text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_new is null or length(p_new) < 24 then
        raise exception 'token too short';
    end if;

    insert into public.ops_catalog_ingest_token (id, token_text, rotated_at)
    values (1, p_new, now())
    on conflict (id) do update set token_text = excluded.token_text, rotated_at = now();

    perform cron.unschedule('zaff-catalog-ingest-kick');
    perform cron.schedule(
        'zaff-catalog-ingest-kick',
        '*/30 * * * *',
        $c$
        select net.http_post(
          url := 'https://mglypwlmwzktxnvlomke.supabase.co/functions/v1/catalog-ingest',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-ingest-token', (select token_text from public.ops_catalog_ingest_token where id = 1)
          ),
          body := jsonb_build_object('limit', 5)
        );
        $c$
    );
end;
$$;

revoke all on function public.ops_rotate_catalog_kick_token(text) from public, anon, authenticated;
grant execute on function public.ops_rotate_catalog_kick_token(text) to service_role;

-- Fresh-database note: 012's cron command references this table. If setting up
-- a NEW database: run 001..012, then THIS file, then set the real token with
-- ops_rotate_catalog_kick_token(...) and mirror it into the CATALOG_INGEST_TOKEN
-- edge-function secret. Until then the kick job returns 401s harmlessly.
