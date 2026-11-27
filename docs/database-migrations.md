# Database Migrations — canonical guide

**Single source of truth: `infrastructure/database/*.sql`, applied in filename order.**
`supabase db push` is NOT used for these files (no `supabase/migrations/` directory is maintained).

## Fresh-database setup

```bash
# 1. In Supabase SQL Editor (or any psql/connected session), run IN ORDER:
#    001_initial_schema.sql
#    002_rls_policies.sql
#    003_atomic_rpcs.sql
#    004_seed_makrana.sql
#    005_security_hardening.sql
#    ... through 020_catalog_ingest_token_ops.sql
# 2. Seed ops token (kept out of git):
#    select public.ops_rotate_catalog_kick_token('<new-token>');
#    and mirror it into edge-function secret CATALOG_INGEST_TOKEN.
# 3. Edge-function secrets (server-side only): see docs/zaffy-platform.md §8.
```

## Conventions

| Rule | Detail |
|---|---|
| Naming | `NNN_description.sql`, zero-padded, monotonically increasing |
| Idempotency | `IF NOT EXISTS` / `CREATE OR REPLACE` / `on conflict do nothing` — safe to re-run |
| Destructive changes | Never without explicit founder approval (no DROP of business data) |
| Secrets | NEVER in SQL files. Runtime tokens live in edge-function secrets + locked ops tables (see 020) |
| Generated columns | `inventory.available_to_sell` is GENERATED — never insert it explicitly |
| Supabase quirks | One statement per SQL-editor batch returns only the LAST result; use separate batches for verification |

## History note (2026-11-27 security rotation)

`012_catalog_platform.sql` originally committed the live catalog-ingest cron token.
It was rotated: new value lives in the `CATALOG_INGEST_TOKEN` secret and inside
`ops_catalog_ingest_token` (RLS-locked); the cron job now reads the token from
that table at runtime. The old token is inert. Optional git-history purge is a
founder decision (requires force-push coordination).
