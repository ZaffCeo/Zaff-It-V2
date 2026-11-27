# ZAFFID + ZAFF ADS — Architecture Audit (Stage 1)

Date: 2026-11-27 · Branch: `arena/565f9ef2-zaff-it-v2` · Author: Arena Agent (Principal Architect role)
Scope: read-only audit of the existing repository + live Supabase project before any ZaffID / Zaff Ads Phase 1 code. **No application code was modified during this stage.**

---

## 1. Existing architecture (verified)

### 1.1 Repository layout
```
apps/mobile/            Expo React Native app (single app: customer + merchant + rider + admin shells)
packages/shared/        Design tokens (BRAND_COLORS #FFC703/#121416, RADII, TYPOGRAPHY), shared utils
supabase/functions/     12 Deno Edge Functions (see 1.6)
infrastructure/database 000–028 numbered, idempotent SQL migrations (canonical, live-applied + E2E each)
docs/                   API contracts, security audits, migration log, drive-docs-status, ops runbooks
```
Single Supabase project (ref `mglypw…`), single mobile app, no second backend. **Nothing gets duplicated.**

### 1.2 Authentication flow (existing, unchanged by this mission)
- Phone (+91) → Supabase Auth OTP (`LoginOtpScreen`) — OTP 5-try guard on backend.
- `profiles` row auto-created by `handle_new_user()` trigger; roles in `user_roles` (customer/merchant/rider/admin, `is_active`).
- Session: supabase-js persisted storage. QA bridge (`qa-auth-bridge` fn) exists only for test identities.
- **Every new table in this repo ships with RLS** — live proof: `72/72 public tables have rowsecurity = true`.

### 1.3 Merchant model (reuse, do not duplicate)
`merchants` (owner_user_id → auth.users) → `stores` (service_zone FK) → `store_products` → `products` + `inventory` (available_to_sell GENERATED). Ownership helper: `is_merchant_owner_of_store(uuid)` (SECURITY DEFINER, used by W4c booking RPC). Merchant screens (Orders/Inventory/Khata/Store) are presentational, props-driven; W4c added the **Ads** tab.

### 1.4 Admin model (reuse)
`user_roles.role='admin'` + `is_admin()` SECURITY DEFINER helper. Every sensitive RPC guards with `is_admin()` (pattern proven by `review_ad_booking`, catalog approve, etc.). `AdminOpsBoardScreen` (763 lines) has tabs Radar/Merchants/Vault/Geofence — **no approvals-queue UI yet**; admin review currently executes via backend RPCs (fully authorized + audited), which is acceptable for Phase 1 with honest labelling in docs.

### 1.5 Payment flow (reuse — Razorpay test mode live)
- `checkout-create-order` (v9): auth → server-side amount calc → Razorpay order (`receipt ZAF-…`) → notes purpose.
- `checkout-create-pro-order` (v1): same pattern for Pro membership (`receipt PRO-…`).
- `razorpay-webhook` (v8, verify_jwt false): signature-verified `payment.captured` → purpose-routed (orders / pro_membership) → server-side amount+currency verification → idempotent activation (dedup by payment_ref). Frontend popup success is **never** proof.
- `payments` + `refunds` tables exist. Mobile uses a reusable web-popup loader (`razorpayCheckout.ts`).

### 1.6 Edge Functions inventory
`auth-delete-account`, `cart-preview`, `catalog-enrich`, `catalog-ingest`, `checkout-create-order`, `checkout-create-pro-order`, `order-lifecycle`, `qa-auth-bridge`, `r2-presign-upload`, `razorpay-webhook`, `zaffy-ai-assistant` — plus `deno.json`. Note: `r2-presign-upload` exists (R2 storage); sandbox egress to supabase.co is blocked, so deployed functions are E2E-tested only via webhook-side logic in DB or deferred to device testing.

### 1.7 Live DB surfaces relevant to this mission
- **Ads (W4c, already live):** `ad_campaigns` (placement search_keyword/category_banner; statuses pending_review/active/paused/completed/rejected/cancelled; `ad_keyword_required` CHECK; budget>0; honest `impressions`/`clicks`; `spent_paise` 0 by decision), RPCs `create_ad_booking` / `review_ad_booking` (approvals-queue gated, entity `'ad'`) / `get_sponsored_search` / `record_ad_event` / `my_ad_campaigns`; partial index `idx_ad_campaigns_serving`.
- **Identity-adjacent:** `referral_codes.public_code` uses format `ZAFF-142924` (6 digits). A ZaffID public id in the same visual family must be a **different namespace/table** and ideally a distinguishable alphabet — documented in plan.
- **Security infra already present:** `audit_logs` + `record_audit_log`, `rate_limit_events` + `check_rate_limit(key,max,window)` sliding-window RPC, `approvals` queue (entity-typed), `feature_flags`, `api_clients` + `api_usage_logs` ( groundwork for future OAuth client registration), `change_history`.
- **Ops cron:** pg_cron jobs (wallet expiry, escalation sweep, catalog ingest, settlement reconcile) — pattern exists for scheduled ad jobs.

### 1.8 Reusable frontend components
`PremiumTabBar` (icon map — merchant Ads tab already registered), shared tokens via `@zaff-it/shared/tokens`, `EmptyState`, Razorpay web-popup loader, i18n translations (`getTranslation`), store (`useAppStore`), `AccountComplianceScreen` golden entries (Invite, Zaff Pro — ZaffID will slot in here), `MerchantAdsScreen` (W4c console: overview tiles, campaign cards, booking sheet).

### 1.9 Existing docs to respect
`docs/database-migrations.md` (conventions: idempotency, no destructive changes, secrets never in SQL), `docs/QA_AND_SECURITY_AUDIT.md`, `docs/API_CONTRACTS.md`, `docs/drive-docs-status.md`.

---

## 2. Security risks identified (pre-mission)

| # | Risk | Mitigation in plan |
|---|---|---|
| R1 | ZaffID public id collision/enumeration | Server-side generation, UNIQUE constraint, unambiguous alphabet, no derivation from phone/name/email; never a credential |
| R2 | Concurrent duplicate identity creation | `ON CONFLICT` idempotent insert keyed on `user_id` UNIQUE |
| R3 | Cross-account identity claim | Identity FK is `auth.uid()`-scoped; RLS select-own-only; no claim path |
| R4 | Fake ad events (repeat clicks) | Dedup via unique event bucket per viewer key + only-serving-campaign guard + rate-limit RPC reuse |
| R5 | Merchant advertising another merchant's product/store | RPC-side ownership verification (`is_merchant_owner_of_store` / store_products join) — pattern already proven in `create_ad_booking` |
| R6 | Payment amount manipulation | Server-side price lookup from `ad_pricing_config` (merchant cannot pass amount); webhook-only activation; exact-amount verify (pattern = Pro membership) |
| R7 | Duplicate webhook replay | Idempotent `ad_transactions` keyed on rzp order/payment (pattern = `activate_pro_membership` dedup) |
| R8 | Pricing tampering by merchant | `ad_pricing_config` writes restricted to `is_admin()`; merchants read-only |
| R9 | RLS bypass temptation | All tables created WITH RLS + policies on day one (repo convention, enforced in review) |
| R10 | service-role exposure | Secrets only in Edge Function env (existing convention); no keys in SQL/frontend |

---

## 3. Conflicts between the proposed mission design and the existing implementation

1. **Zaff Ads already has a Phase-0 (W4c) inside this branch** — `ad_campaigns` + 5 RPCs are live and E2E-proven. The mission's Phase 1 must **extend** this schema (new placement types, statuses, pricing config, transactions, events table) rather than create parallel tables. Any mission-proposed table name that duplicates an existing concern (`ad_campaigns` exists) is adapted, not recreated.
2. **Public-ID format collision** — `ZAFF-XXXXXX` is already used by referral codes (`ZAFF-142924`, numeric). ZaffID will use `ZAFF-` + 6 chars from a 24-char unambiguous alphabet (no 0/O/1/I) → visually distinct (`ZAFF-7K29PX` vs `ZAFF-142924`) and stored in its own table; documented in the plan.
3. **No impressions promise / no CPC yet** — mission wants budget enforcement; the founder has not set CPC/CPM. Plan: flat prepaid day-rate campaigns (pricing-config driven, banner slots ₹999/₹799/₹599 configurable), `spent_paise` accrues only under a future founder-set pricing model; budget can never exceed prepaid amount by construction.
4. **Admin UI** — mission asks for admin moderation panel; `AdminOpsBoardScreen` has no approvals tab. Phase 1 ships authorized + audited backend RPCs (real, not frontend-faked) and the merchant-facing UI; the admin *screen* extension is listed as PARTIALLY IMPLEMENTED with the exact gap stated.
5. **Storage for banner creatives** — `r2-presign-upload` exists, but sandbox egress limits live verification. Phase 1 banners reference admin-validated image URLs; upload pipeline integration is listed as a limitation.
6. **Sandbox cannot call supabase.co over HTTPS** — Edge Function HTTP E2E is not possible from the sandbox; payment-path testing is done by mirroring webhook logic against the DB (proven W4b approach) and the functions are `deno check`-verified. Documented honestly.
7. **auth schema writes** — mission's ZaffID needs zero changes to auth.users; identity links by `user_id UUID` FK only. Deletion compliance rides the existing `auth-delete-account` edge function (extended in Stage 4 to purge identity rows).

---

## 4. Missing components (gap list → Stage 2 plan)

| Missing | Plan target |
|---|---|
| `zaff_identities` + events | Migration 029 |
| Profile ZaffID card UI (3 states + copy + connected apps) | Stage 3 |
| Ad placement types sponsored_store / home_banner + draft/scheduled/out_of_budget statuses | Migration 030 |
| `ad_pricing_config` (admin-editable) + transparent pricing read | Migration 030 |
| `ad_events` auditable event log with dedup/fraud controls | Migration 030 |
| `ad_transactions` + `create_ad_campaign_order` + Razorpay order edge fn + webhook v9 branch | Migration 030 + Stage 4 |
| Serve-side sponsored store / home banner RPCs + customer UI labels | Stage 4 |
| Merchant Ads Manager upgrade (4 formats, pricing, payment, history) | Stage 4 |
| Admin pause/resume/cancel/pricing RPCs | Stage 4 |
| ZaffID/Ads security + functional test matrix | Stage 5 |

## 5. Implementation constraints
- One live Supabase project: migrations must stay idempotent, non-destructive, and be applied via connector SQL (no CLI token).
- Connector quirk: multi-statement batches return only the LAST statement's result; verify in separate batches.
- Arena dedup guard: vary SQL intents on retries.
- `deno check --no-config` for edge fns; `npx tsc -p apps/mobile/tsconfig.json` for app.
- E2E identities: customer `a2dab6ab…`, merchant `b55b4729…` (merchant `22222222…201`, store `33333333…301`), admin QA `af650ff7…` (minted during W4c), rider `88d4c82e…`.
