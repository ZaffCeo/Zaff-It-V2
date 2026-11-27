# ZAFFID + ZAFF ADS — Implementation Report (Stage 6)

Date: 2026-11-27 · Branch: `arena/565f9ef2-zaff-it-v2` (feature branch; `main` untouched)
Companion docs: `ZAFFID_ZAFFADS_ARCHITECTURE_AUDIT.md` (Stage 1), `ZAFFID_ZAFFADS_IMPLEMENTATION_PLAN.md` (Stage 2)

---

## 1. Features implemented

| Feature | Status |
|---|---|
| ZaffID data model (1:1 with existing auth.users, no duplicate accounts) | **IMPLEMENTED** |
| ZaffID server-issued public IDs (`ZAFF-XXXXXX`, 28-char unambiguous alphabet, collision-safe) | **IMPLEMENTED** |
| ZaffID idempotent creation incl. concurrent-safety | **IMPLEMENTED** |
| ZaffID Profile UI (State A/B/C, copy ID, honest connected-app states, deactivate/reactivate) | **IMPLEMENTED** |
| Public ZaffID lookup with rate limiting + minimal-field exposure | **IMPLEMENTED** |
| Future-SSO schema groundwork (identity events, api_clients reuse plan) | **IMPLEMENTED** (schema only) |
| Full ecosystem SSO / OAuth2 / OIDC / PKCE / consent flows | **NOT IMPLEMENTED** (honestly deferred — no claims made) |
| Sponsored Product ads (search_keyword + product, admin-approved, labelled) | **IMPLEMENTED** |
| Sponsored Store ads (home discovery rail, labelled) | **IMPLEMENTED** |
| Search Ads relevance (keyword ILIKE both-direction, live-store/product/inventory filtered) | **IMPLEMENTED** |
| Home Banner ads (slots 1/2/3, labelled strip, payment-gated) | **IMPLEMENTED** |
| Campaign lifecycle (draft → pending_review → approved → paid → active/scheduled → completed/paused/rejected/cancelled/out_of_budget) | **IMPLEMENTED** |
| Admin-configurable pricing (ad_pricing_config, founder can reprice/toggle) | **IMPLEMENTED** (RPC surface; no admin *screen* — see gaps) |
| Prepaid payments via existing Razorpay infra (server-priced, webhook-verified, idempotent) | **IMPLEMENTED** (test mode) |
| Fraud-resistant event tracking (serving-guard + UNIQUE 10-min viewer bucket + rate limit + audit trail) | **IMPLEMENTED** |
| Merchant Ads Manager UI (4 formats, live rates, draft/submit, pay flow, analytics, payment history) | **IMPLEMENTED** |
| Customer sponsored labels (search card, store rail, banner strip — always visible SPONSORED) | **IMPLEMENTED** |
| Admin moderation UI screen | **PARTIALLY IMPLEMENTED** — backend-authorized+audited RPCs are the Phase-1 admin surface; AdminOpsBoard approvals tab deferred (exact gap documented in audit §3.4) |
| Banner creative upload pipeline (R2 presign integration) | **NOT IMPLEMENTED** — banners reference admin-reviewed URLs; store payload uses existing store fields (sandbox egress limitation) |
| CPC/CPM spend accrual | **NOT IMPLEMENTED BY DESIGN** — founder has not set pricing; `spent_paise` stays 0; budget = prepaid amount by construction |
| Conversion attribution | **NOT IMPLEMENTED** — no trusted attribution methodology yet; no sales-as-conversion claims |
| Real-device Razorpay E2E for ad payments | **NOT TESTED** — sandbox egress to supabase.co blocked; payment path verified by mirroring webhook logic against live DB (amount mismatch P0001, replay dedup, paid→active all proven). Razorpay order-creation call itself `deno check`-verified only. |
| RLS runtime tests from sandbox | **NOT TESTED** (superuser connection bypasses RLS) — policy/grant logic shipped in SQL and reviewed; all RPC-level authorization guards proven live |

## 2. Files added
- `infrastructure/database/029_zaffid_identity.sql`
- `infrastructure/database/030_zaff_ads_phase1.sql`
- `apps/mobile/src/screens/customer/ZaffIdScreen.tsx`
- `supabase/functions/checkout-create-ad-order/index.ts`
- `docs/zaff/ZAFFID_ZAFFADS_ARCHITECTURE_AUDIT.md`
- `docs/zaff/ZAFFID_ZAFFADS_IMPLEMENTATION_PLAN.md`
- `docs/zaff/ZAFFID_ZAFFADS_IMPLEMENTATION_REPORT.md` (this file)

## 3. Files modified
- `apps/mobile/src/navigation/RootNavigator.tsx` (+`ZaffId` route)
- `apps/mobile/src/screens/customer/AccountComplianceScreen.tsx` (Profile ZaffID golden entry)
- `apps/mobile/src/screens/merchant/MerchantAdsScreen.tsx` (W4c console → Phase 1 Ads Manager)
- `apps/mobile/src/screens/customer/CustomerHomeScreen.tsx` (sponsored store rail + labelled banner strip)
- `apps/mobile/src/screens/customer/UniversalSearchScreen.tsx` (viewer-salt event keys)
- `supabase/functions/razorpay-webhook/index.ts` (v9: `ad_campaign` purpose branch)
- `apps/mobile/package.json` (+`expo-clipboard`), `docs/database-migrations.md` (029/030 rows)
- Earlier in session: brand assets swapped (`apps/mobile/assets/*`) — commit `e1370a3`

## 4. Database migrations (live-applied + E2E)
- **029** `zaff_identities` / `zaff_identity_events` / `zaff_connected_apps` + 4 RPCs, RLS day-one, audit_logs wired.
- **030** `ad_campaigns` extension, `ad_pricing_config`, `ad_transactions`, `ad_events`, 11 RPCs (booking v2, submit, review v2, status, 3 serving, events v2, order, activation, tx history, scheduler), pg_cron job 8. All idempotent, non-destructive; existing W4c rows backfilled `payment_status='not_required'`.

## 5. Edge Functions
- **new** `checkout-create-ad-order` v1 (verify_jwt true) — auth merchant → `create_ad_campaign_order` RPC (server price) → Razorpay order `receipt AD-…`, notes purpose=ad_campaign → links `ad_transactions.rzp_order_id` (service role).
- **updated** `razorpay-webhook` v9 (verify_jwt false) — after orders/pro branches, `ad_transactions` lookup by rzp order → exact amount+currency verify → `activate_ad_campaign_payment` (service-role-only RPC) → campaign paid → active/scheduled; duplicates → `deduplicated`.
- Both `deno check --no-config` clean.

## 6. Security policies & authorization (summary)
- RLS enabled on 100% of new tables (75/75 public tables now). Identity: select-own only; events: select-own; connected_apps: catalog read; pricing: authenticated read (writes via admin RPC only); transactions: merchant-own via campaign join (+admin); ad_events: admin-only raw access.
- All sensitive RPCs guard inside (is_admin / ownership / pending-state checks) AND grants are revoked→granted; `activate_ad_campaign_payment` granted to `service_role` only (runtime grant verification blocked by connector superuser — see status table).
- Frontend never passes amounts, user ids, roles or store ownership as truth; client-passed budget/price ignored by server.
- ZaffID public IDs are not credentials; lookup exposes only public_id+status; rate-limited 30/min/user.

## 7. Test results (live E2E on the Supabase project)
**ZaffID (029)** — no-auth P0001 ✅ · create `ZAFF-6X5CU9` (created_now) ✅ · replay idempotent (created_now=false, same ID, viewed event) ✅ · second user `ZAFF-UT9HT3` distinct ✅ · `my_zaffid` payload with honest apps ✅ · lookup active→found-minimal / ghost→false ✅ · deactivate→event+audit, lookup hidden ✅ · reactivate→active ✅ · events ledger (created/viewed/deactivated/reactivated) ✅
**Zaff Ads (030)** — banner-without-slot P0001 ✅ · sponsored_store-with-product P0001 ✅ · foreign-product P0001 ✅ · pricing: ₹9900×7=69300 / ₹99900×3=299700 server-computed ✅ · draft→submit→approvals row ✅ · ad order receipt AD-e03f7fba ✅ · wrong payment amount P0001 ✅ · correct→paid→active ✅ · webhook replay→deduplicated ✅ · serving (store rail + banner slot) ✅ · paused→serving [] ✅ · expired→serving [] ✅ · restored→served ✅ · event dedup (viewer-A counted once; 3 ledger rows; counters 2 imp/1 clk) ✅ · merchant pricing tamper P0001 ✅ · admin reprice+restore+audit ✅ · sweep fn ✅ · my_ad_transactions (2 rows) ✅
**Build** — `tsc -p apps/mobile/tsconfig.json` EXIT=0 (multiple runs) ✅ · `deno check` both fns ✅ · repo has no additional unit/lint suites (none exist to run).
**Regression** — no changes to checkout/orders/payments/wallet logic; sponsored rendering is additive and labelled; existing W4c campaign (Amul search) still serves.

## 8. Remaining limitations & manual configuration
1. **Admin console UI** — moderation via RPCs; AdminOpsBoard tab is the follow-up.
2. **Device-level Razorpay payment test for ads** — run on a device/emulator against the deployed `checkout-create-ad-order` (same flow as Pro, which was device-verified earlier).
3. **Banner creatives** — connect `r2-presign-upload` + admin-reviewed URLs when the media pipeline lands.
4. **Founder actions** — Razorpay webhook registration already live (v8→v9 auto); reprice/kill-switch via `upsert_ad_pricing` / `set_ad_campaign_status`; pricing is currently `is_active=true` (payments enforced in test mode) — flip `is_active=false` for a free-booking launch period if desired.
5. **QA data cleanup** — test campaigns (`9c40e372…` sponsored store, `96b54678…` banner) left live for UI verification; cancel via `set_ad_campaign_status(…,'cancelled')` before production launch.
6. **RLS runtime audit** — run a policy audit as a non-superuser (Supabase SQL editor anon/authenticated role) before production sign-off.

## 9. Deployment instructions
1. Migrations 029/030 are already applied to the live project in this workspace flow (idempotent files under `infrastructure/database/`).
2. Edge functions already deployed (`checkout-create-ad-order` v1, `razorpay-webhook` v9).
3. For a fresh environment: run SQL files in numeric order 000→030, deploy `supabase/functions/*`, set secrets (`RAZORPAY_KEY_ID/SECRET`, `RAZORPAY_WEBHOOK_SECRET`), register the webhook URL, ensure pg_cron jobs (incl. job 8 `zaff-ads-scheduler` `*/5 * * * *`).
4. Rollback: none of the migrations destroy data; `set_ad_campaign_status` can pause/stop serving instantly; pricing `is_active=false` disables paid booking; dropping the pg_cron job stops the scheduler. Identity tables can be dropped independently of ads.

## 10. Production readiness assessment
ZaffID: **ready for Phase-1 launch** (optional, zero impact on existing auth; SSO explicitly future). Zaff Ads: **ready for controlled test-market launch** — every sensitive path is backend-authorized and audited, payments are webhook-verified, ads are always labelled and payment-gated; remaining items are UI polish (admin screen), media pipeline, and device-level payment run-through before scaling beyond Makrana/Borawar.
