# ZAFF-IT V2 — Platform Audit & Implementation Roadmap
**Date:** 2026-11-26 · **Mode:** Launch-ready now, scalable architecture (hybrid) · **Budget:** Free-first
**Audit method:** Line-level review of `infrastructure/database/001–010`, `supabase/functions/*` (8 live), `apps/mobile/src` (~7.3k LOC), live prod DB verification.

---

## 1. Verdict

The founder strategy doc (hyperlocal commerce platform, modular monolith, 8 modules,
5-phase roadmap) maps **~80% already-implemented** in this repo. The architecture is
already the recommended one:

- **Modular monolith ✓** — one Postgres core (37 tables, RLS 37/37) + 8 independently
  deployable edge-function modules. No microservices. Future split: any module
  (e.g. ZaffMaps routing) can be lifted out without touching the DB core.
- **Stack ✓** — Expo + RN + TS + Supabase (Postgres/Auth/Realtime-ready/Storage/Edge),
  Zustand, Razorpay-ready, i18n (EN/hi/Hinglish), role-based one app (`?role=`).
- **P0 integrity ✓** — atomic checkout RPC, idempotent orders/payments, RLS everywhere,
  audit trail, persistent rate limits, service-role isolation.
- **This audit found & fixed 1 real P0 gap** (stock-leak sweeper, §3) and shipped the
  first P1 merchant-intelligence slice.

---

## 2. Strategy-doc point-by-point status

| # | Blueprint item | Status | Where |
|---|---|---|---|
| 1 | Modular monolith, no premature microservices | ✅ DONE | DB core + `supabase/functions/*` |
| 2a | Smart inventory reservation | ✅ DONE (+**sweeper gap fixed**) | `003_atomic_rpcs.sql` `reserve/release_inventory`, `010` `expire_stale_payment_pending_orders` + pg_cron 15min |
| 2b | Dynamic delivery assignment | 🟡 Manual today (reassign in order-lifecycle) | auto-assign = P1 (score-based RPC) |
| 2c | Multi-shop order orchestration | 🟡 Column ready (`orders.parent_order_id`), splitting logic pending | P2 — Makrana = single-store carts for now |
| 2d | Price & promotion engine | 🟡 Tables live (009: coupons/flash_sales), engine wiring pending | P1/P2 |
| 2e | Event-driven notifications | 🟡 `notifications` table + RLS live; writers pending | wire order-lifecycle → insert (small) |
| 2f | Audit trail | ✅ DONE | `audit_logs` + `record_audit_log` on every mutation |
| 2g | Idempotent payments/orders | ✅ DONE | `orders.idempotency_key` replay check in `create_checkout_order`; UUID `Idempotency-Key` header enforced in edge fn (409 on conflict) |
| 2h | Settlement reconciliation | 🟡 `settlement_ledger` live; auto-recon job pending | P2 |
| 2i | Serviceability engine | ✅ DONE | `service_zones` + zone checks in checkout RPC |
| 2j | Feature flags | ✅ DONE | `feature_flags` table |
| 3 | Design system 3-layer | ✅ tokens+PremiumKit+themes; UX extras (reorder, voice search) = P2 | `packages/shared/tokens`, `PremiumKit.tsx` |
| 4 | Smart pricing / morning flash-sale engine | 🔴 Model documented (Stitch), engine pending | P2 — needs merchant purchase-price data |
| 4b | Merchant intelligence | 🟢 **first slice shipped today** | `010` `get_merchant_daily_insights()` — today orders/revenue/avg, top products (today+7d), low stock, unsold 7d |
| 5 | Redis/CDN/Sentry/PostHog/CI | 🔴 by design (free-first) | Postgres+pg_cron cover rate-limits & jobs; add Sentry/PostHog only when accounts provided; GitHub Actions CI = cheap, P1 |
| 6 | Offline merchant support | 🔴 | P1 plan in §5 |
| 7 | Zaff ecosystem decoupling rule | ✅ adopted | core commerce has zero runtime dependency on future Zaff modules; shared identity = Supabase JWT (`auth.uid()`) |

---

## 3. Audit findings & fixes (this round)

1. **P0 — Stale `payment_pending` orders leaked reserved stock forever.** Abandoned
   Razorpay checkout kept `inventory.reserved_qty` elevated → phantom out-of-stock.
   **Fixed:** `expire_stale_payment_pending_orders()` (service_role-only) releases
   stock, cancels order, fails payment, audits; **pg_cron scheduled every 15 min**
   (free, zero infra). Smoke-tested: clean no-op run ✓.
2. **(From 009 round) Lingering default privileges** granted `authenticated` EXECUTE on
   coin-mint functions → revoked; both wallet functions now service_role-only.
   Lesson applied: every new function ACL verified post-apply.
3. **Confirmed-good under pressure:** idempotency design, deterministic-lock checkout,
   RLS coverage 37/37, grant hygiene (008), audit logging coverage.

---

## 4. Roadmap (annotated founder priorities)

**P0 — done.** DB/RLS, order+inventory+payment integrity, premium design system.

**P1 — pilot batch (next):**
- Wire `notifications` inserts into order-lifecycle (event-driven feed, ~30 lines).
- Merchant app: insights RPC consumed on dashboard (Khata tab) + offline catalogue
  cache (AsyncStorage) + draft-order queue with `Idempotency-Key` sync (schema already
  supports it — client generates one UUID per intent).
- Auto-assignment RPC for delivery tasks (nearest ready rider by `rider_locations`,
  fallback manual) + GitHub Actions CI (typecheck + tsc on PR; free tier).
- Admin web dashboard v1 (Expo web `/admin` route on Vercel — free hosting): orders,
  merchants, disputes, approvals queues.

**P2 — after real data:**
- Multi-shop parent/child order splitting (orchestrator RPC + combined tracking UI).
- Promotion engine: coupon apply in checkout RPC + morning flash-sale window config
  (6–10 AM quantity-limited auto-expiry using `flash_sales` + pg_cron).
- Settlement auto-reconciliation job; recommendations (repeat-purchase based).

**P3 — scale stage (explicitly deferred, free-first):**
Redis cache (Postgres fine at pilot load), CDN images (Supabase Storage + long-cache
headers first), Sentry/PostHog (needs vendor accounts), Storybook, NativeWind migration
(only as a dedicated later pass — 7.3k LOC of proven StyleSheet stays until stable).

## 5. Performance targets (founder doc) — honest measurement plan

| Target | Current status | Plan |
|---|---|---|
| Launch < 2s | Splash renders fast on prod; bundle ~single JS chunk | Hermes + lazy screens audit (P1) |
| API p95 < 300ms | Edge fns are thin; DB queries indexed | Measure with Vercel analytics + Supabase metrics; optimize hot RPCs |
| 60 FPS scroll | StyleSheet lists, no heavy anim layers | FlashList only if list jank observed (not before) |
| No duplicate payments/orders | ✅ idempotency live | — |
| Inventory consistency | ✅ + sweeper | pg_cron logs in `audit_logs` |
| Graceful poor-network | Partial (demo fallbacks) | Offline queue (P1) + retries |
| Backups & recovery | Supabase managed daily backups | Restore drill doc (P2) |

## 6. Zaff ecosystem decoupling rule (adopted as architecture law)

Zaff-It (commerce core) must never runtime-depend on ZaffMail/ZaffMaps/ZaffPay
availability. Shared across the ecosystem: **ZaffID = Supabase auth user id (JWT sub)**,
**ZaffCoin = `wallet_ledger`** (already isolated + service-role-gated), **Zaffy** =
optional enrichment (already fails open via provider fallback chain). Future modules
integrate via edge functions + shared JWT, never via in-process coupling.
