# ZAFF-IT — Operations Runbook (Makrana Pilot)
**Scope:** daily/weekly ops, monitoring wiring, disaster recovery, admin entry points.
**Companion:** `docs/PLATFORM_AUDIT_AND_ROADMAP.md`

---

## 1. Entry points

| Surface | URL / access |
|---|---|
| Customer app (web) | https://zaff-it.vercel.app |
| **Admin tower (web)** | https://zaff-it.vercel.app/admin → login → Admin Ops Board |
| Merchant mode | https://zaff-it.vercel.app/merchant (or `?role=merchant`) |
| Rider mode | https://zaff-it.vercel.app/rider (or `?role=rider`) |
| Supabase dashboard | https://supabase.com/dashboard/project/mglypwlmwzktxnvlomke |

Role resolution = `?role=` query **or** path prefix (both work; path form is the
canonical shareable link). On real devices this maps to role-based dashboards of
the same build (one app, four roles — founder decision).

## 2. Automated jobs (pg_cron — all free, inside Supabase Postgres)

| Job | Schedule | What it does |
|---|---|---|
| `zaff-expire-stale-orders` | every 15 min | Cancels `payment_pending` orders older than 30 min, releases reserved stock, fails the payment record, audits. Protects against phantom out-of-stock. |
| `zaff-expire-flash-sales` | hourly (at :05) | Deactivates finished `flash_sales` windows. |
| `zaff-reconcile-settlements` | daily 02:00 IST-ish (server tz) | Reports delivered+captured orders missing settlement rows + ledger amount mismatches (JSON in cron run history). |

Inspect runs: Supabase → Database → Extensions → pg_cron → *cron.job_run_details*.

**Weekly ops checklist (5 min):**
1. `select * from cron.job_run_details order by start_time desc limit 20;` — all `succeeded`?
2. Admin tower → scan orders/disputes/approvals queues.
3. Merchant dashboard → "Aaj ka Intelligence" — low-stock list forward karo dukan ko.
4. If Razorpay keys connected: check webhook 200s (Supabase edge function logs).

## 3. Monitoring — wiring guide (free-first, add when accounts exist)

**Sentry** (crash/error tracking):
1. Create project at sentry.io → copy DSN.
2. Vercel env: `EXPO_PUBLIC_SENTRY_DSN`.
3. `apps/mobile`: `npm i sentry-expo` → init in `App.tsx` behind the env check
   (no DSN = zero overhead, keeps free-first invariant).
4. Edge functions: add `try/catch` → `fetch(SENTRY_INGEST_URL, ...)` breadcrumb
   util (no SDK needed for Deno).

**PostHog** (product analytics):
1. Project token from posthog.com → Vercel env `EXPO_PUBLIC_POSTHOG_KEY`.
2. `npm i posthog-react-native` → init gated the same way.
Track only: screen_view, add_to_cart, checkout_success, zaffy_query (PII nahin).

**Uptime:** Vercel Analytics already on (project settings); add
`https://zaff-it.vercel.app` to any free pinger (UptimeRobot) — 5-min interval.

## 4. Disaster recovery / restore drill

- **Backups:** Supabase managed daily backups (Project → Database → Backups).
  Free plan retains 7 daily. Point-in-time restore is a paid feature — not used.
- **Quarterly drill (30 min):**
  1. Download latest backup snapshot.
  2. Create a THROWAWAY Supabase project (never restore over prod).
  3. `psql $THROWAWAY_URL < snapshot.sql`.
  4. Run migrations 001–011 against it (`infrastructure/database/`) — idempotent,
     they must apply clean; gaps = migration drift to fix.
  5. Smoke: `get_store_catalogue`, `create_checkout_order` (test cart),
     `expire_stale_payment_pending_orders(30)` no-op run.
  6. Document elapsed time; target < 45 min to a working clone.
- **Edge functions + secrets** are NOT in DB backups: they live in this repo
  (`supabase/functions/`) and are redeployable in minutes — that's the reason
  sources are committed.
- **Storage (product images):** separate bucket export quarterly if > 1 GB.

## 5. Performance targets — how we measure (founder doc alignment)

| Target | Measurement |
|---|---|
| Launch < 2s | Vercel Analytics Web Vitals (LCP proxy); Hermes in native builds |
| API p95 < 300ms | Supabase logs (edge fn durations); RPC `explain analyze` on hot paths |
| 60 FPS | React DevTools profiling on low-end Android; FlashList ONLY if jank measured |
| No duplicate payments | Idempotency tests + `orders.idempotency_key` uniqueness (live) |
| Inventory consistency | Sweeper no-op runs + `inventory_movements` audit trail |
| Poor-network grace | Demo fallbacks live; offline draft-order queue = next batch |

## 6. Escalation

| Issue | Where to look first |
|---|---|
| Orders stuck `payment_pending` | cron runs; manual: `select public.expire_stale_payment_pending_orders(30);` |
| Zaffy not answering | edge fn logs (provider chain), secrets present? |
| Stock mismatch | `inventory_movements` per store_product; sweeper audit entries |
| Settlement gap | run `select public.reconcile_settlements();` (admin JWT) or wait for nightly |
