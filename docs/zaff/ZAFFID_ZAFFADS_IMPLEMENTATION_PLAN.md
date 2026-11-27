# ZAFFID + ZAFF ADS — Implementation Plan (Stage 2)

Date: 2026-11-27 · Branch: `arena/565f9ef2-zaff-it-v2` · Companion: `ZAFFID_ZAFFADS_ARCHITECTURE_AUDIT.md`

## 1. Proposed architecture

```
ZaffmIND identity layer (Phase 1, Zaff-It only)
  auth.users (unchanged Supabase Auth, OTP)
    └── zaff_identities (1:1, user_id UNIQUE FK)          ← internal UUID, public_id ZAFF-XXXXXX
          ├── zaff_identity_events (audit)                 ← created / viewed / deactivated
          └── zaff_connected_apps (catalog rows)           ← honest states: connected | coming_soon
Future SSO (NOT implemented in Phase 1): OAuth2/OIDC + PKCE would ride api_clients
(api client registration, redirect allowlist, consent rows in zaff_identity_consents).
Schema is structured for it; no SSO claims are made until a real IdP flow is tested.

Zaff Ads layer (Phase 1 = W4c schema EXTENDED, no parallel tables)
  ad_campaigns          + placements: sponsored_store, home_banner (+ existing search_keyword/category_banner)
                        + statuses: draft, scheduled, out_of_budget (+ existing six)
                        + banner_slot (1|2|3), planned_start/end, payment_status, product_id (already)
  ad_pricing_config     admin-editable day-rates: sponsored_product/store/search_ad = ₹99/day,
                        banner_slot_1/2/3 = ₹999/₹799/₹599/day  (configurable, not hardcoded)
  ad_transactions       Razorpay orders+payments per campaign, idempotent, webhook-verified only
  ad_events             auditable impression/click rows, dedup bucket, viewer-key hashed, serving-guarded
  serve RPCs            get_sponsored_search (exists) + get_sponsored_stores + get_home_banner_ads
                        (filter: active+scheduled window+zone+availability → rank → LIMIT → label client-side)
  merchant RPCs         create_ad_booking (extended: 4 formats, draft, pricing lookup) +
                        submit_ad_campaign / my_ad_campaigns (extended) / my_ad_transactions
  admin RPCs            review_ad_booking (exists) + set_ad_campaign_status (pause/resume/cancel)
                        + upsert_ad_pricing — all is_admin() + audit_logs
  payments              checkout-create-ad-order edge fn (auth→server price→Razorpay AD- receipt)
                        + razorpay-webhook v9 branch (purpose=ad_campaign → verify → paid+pending_review)
```

## 2. Database changes (migrations, idempotent, applied live + E2E)

- **`029_zaffid_identity.sql`**
  - `zaff_identities(id uuid pk, user_id uuid UNIQUE → auth.users, public_id text UNIQUE (ZAFF-[ACDEFGHJKLMNPQRSTUVWXYZ234569]{6}), status active|deactivated, created_at, deactivated_at)`
  - `zaff_identity_events(identity_id, event_type created|deactivated|reactivated|viewed, meta jsonb)` — insert via SECURITY DEFINER RPC only
  - `zaff_connected_apps(app_key pk, display_name, state connected|coming_soon, requires_zaffid bool)` — seeded: zaff_it=connected, zaff_ads=connected, zaffmail/zaffsurf/zaffmaps=coming_soon
  - RPCs: `get_or_create_my_zaffid()` (idempotent ON CONFLICT, collision-safe loop, audit), `my_zaffid()` (identity + connected apps + events count), `deactivate_my_zaffid()`, `public_zaffid_lookup(p_public_id)` (returns ONLY public_id+status, authenticated)
  - RLS: select/update-limited on own rows; events/apps readable via RPC or own-scope; no anon.
  - `auth-delete-account` edge fn: + identity purge step (Phase 1: hard-delete rows, audited).
- **`030_zaff_ads_phase1.sql`**
  - `ALTER TABLE ad_campaigns`: widen placement_type + status CHECKs (add sponsored_store, home_banner, draft, scheduled, out_of_budget); add `banner_slot smallint CHECK 1-3`, `planned_start timestamptz`, `planned_end timestamptz`, `payment_status text default 'not_required'` (not_required|pending|paid|refunded), `rzp_order_id text`
  - `ad_pricing_config(pricing_key pk, price_paise int CHECK>0, is_active bool, updated_by, updated_at)` — seeded with §1 rates
  - `ad_transactions(id, campaign_id, rzp_order_id UNIQUE, rzp_payment_id UNIQUE, amount_paise, currency, status created|paid|failed|refunded, paid_at, created_at)` — service-role writes only
  - `ad_events(id, campaign_id, event_type impression|click, viewer_key text, bucket timestamptz, created_at, UNIQUE(campaign_id, event_type, viewer_key, bucket))` where bucket = 10-min window
  - RPCs: `get_ad_pricing()` (authenticated), `upsert_ad_pricing(key, paise)` (admin+audit), `create_ad_booking` v2 (4 formats: product/store/search/banner; banner→slot+pricing; store→ownership; product→store_products ownership; search→keyword; draft or submit), `submit_ad_campaign(id)` (draft→pending_review), `set_ad_campaign_status(id, status, note)` (admin; pause/resume/cancel/complete + out_of_budget auto), `get_sponsored_stores(zone)`, `get_home_banner_ads(zone, slot?)` (only payment_status='paid' or founder-free flag + active window + approved), `record_ad_event` v2 (serving guard + dedup insert ON CONFLICT DO NOTHING → counts only NEW events; viewer_key = client random salt, hashed server-side), `my_ad_transactions()`
  - `create_ad_campaign_order(campaign_id)` — verifies owner + amount from pricing_config server-side → row created (webhook/link by rzp order id) → returns rzp order via edge fn path
  - RLS on all new tables; merchants select own campaigns/transactions; nobody writes events directly (RPC only).

## 3. Edge Functions
- **new `checkout-create-ad-order`** (verify_jwt true): auth merchant → campaign ownership → amount from `ad_pricing_config` (never client) → Razorpay order `receipt AD-<shortid>` notes purpose=ad_campaign, campaign_id → link → return checkout payload. Mirrors `checkout-create-pro-order` v1.
- **`razorpay-webhook` → v9**: existing orders/pro branches untouched; add `purpose=ad_campaign` → `ad_transactions` by rzp order → exact amount+currency verify → mark paid → campaign `payment_status='paid'`, status `pending_review` (or `scheduled` if planned dates set) → audit. Duplicate webhook → idempotent (existing paid row short-circuits).
- **`auth-delete-account` → v2**: purge `zaff_identities` (+events) for the deleting user.
- All `deno check --no-config` clean; deploy via connector (`create_edge_function`/`update_edge_function`).

## 4. Frontend screens / changes (existing design system, no rewrites)
- **Profile (AccountComplianceScreen)**: ZaffID premium card — State A (not created: "One ID. Every Zaff." + Create Your ZaffID + Free · One-time setup) / State B (public ID + Copy + status + connected apps) / State C (connected apps list: Zaff-It ✓ Connected, Zaff Ads ✓ Connected, ZaffMail/ZaffSurf/ZaffMaps Coming Soon). Navigation → new `ZaffIdScreen` (create flow + success + copy + settings).
- **MerchantAdsScreen** → Ads Manager Phase 1: format picker (4 formats), asset picker (own products/stores via existing queries), audience (zone: Makrana/Borawar), dates, budget from live pricing, preview card, Submit→Pending Approval, payment (Razorpay web popup — server amount), status chips incl. Draft/Scheduled/Out of Budget, transactions history section.
- **Customer**: UniversalSearchScreen sponsored card (exists, always "SPONSORED"); CustomerHomeScreen → sponsored store rail + home banner slots (labelled, ≤3, only paid+approved); ExploreScreen → sponsored store label where store cards render.
- **PremiumTabBar**: merchant Ads tab (exists). No customer-facing clutter: max 1 sponsored row per search, max 3 banners on home.
- **Admin**: backend RPCs only in Phase 1 (AdminOpsBoard extension deferred — documented).

## 5. API contracts (RPC signatures, request→response)
| RPC | Auth | Returns |
|---|---|---|
| get_or_create_my_zaffid() | authenticated | {public_id, status, created_at, created_now} |
| my_zaffid() | authenticated | {identity, apps[], totals} |
| deactivate_my_zaffid() | authenticated | {ok} |
| public_zaffid_lookup(p_public_id) | authenticated | {public_id, status} minimal |
| get_ad_pricing() | authenticated | rows[{pricing_key, price_paise}] |
| upsert_ad_pricing(key, paise) | admin | {ok} + audit |
| create_ad_booking v2 (store_id, format, asset refs, dates, days, draft bool) | merchant-owner | {campaign_id, status, pricing…} |
| submit_ad_campaign(id) | merchant-owner | {status: pending_review} |
| set_ad_campaign_status(id, status, note) | admin | {ok} + sync |
| get_sponsored_stores(zone) / get_home_banner_ads(zone, slot) | authenticated | labelled JSONB rows |
| record_ad_event v2 (campaign_id, type, viewer_key) | authenticated | {ok, counted} |
| create_ad_campaign_order(campaign_id) | merchant-owner | {rzp_order…} via edge fn |
| my_ad_transactions() | merchant | rows |

## 6. Security rules (enforcement points)
Server-side: identity 1:1 + idempotency (029), ownership checks in every merchant RPC, admin guard on review/pricing/status RPCs, amount from pricing_config only, webhook-only paid transitions, event dedup + serving guard, RLS on 100% of new tables, audit_logs on identity + admin + payment actions, rate_limit on lookup RPC. Frontend never passes amounts/user/role/store ids as truth.

## 7. Testing plan (Stage 5)
- Identity: duplicate creation (idempotent same id), collision loop (unit: alphabet, UNIQUE), ownership (user A cannot read/select B rows — RLS), deactivate→lookup minimal, enumeration resistance (rate limit).
- Ads: Merchant A vs B campaign access; customer cannot write campaigns/events; fake impressions deduped (same viewer+bucket → counted once); negative/zero budget rejected; pricing tamper (merchant upsert → P0001); payment amount mismatch → webhook 400; duplicate webhook → single paid; unauthorized activation (RPC guard); serving after expiry/rejected/paused → empty; out-of-stock product excluded; banner without payment → not served (unless founder flag).
- Regression: tsc EXIT=0; existing flows untouched (checkout/pro/wallet refactors none); grep no `service_role` in app code.

## 8. Dependency map & sequence
029 identity → identity UI + E2E → **commit 1** → 030 ads DB → serve/admin/merchant RPC E2E → merchant UI + payment edge fn + webhook v9 → customer UI → **commit 2** → Stage 5 full test pass → Stage 6 report (**commit 3**). No dependency on Medicine/Laundry verticals; no schema edits to payments/orders.

## 9. Assumptions & blockers (explicit)
- Razorpay test keys live (existing); webhook secret already configured (proven by v8 E2E).
- Banner creative upload via R2 presign deferred (sandbox egress) — banners accept admin-reviewed image URLs; documented limitation.
- Admin UI screen deferred; backend-authorized RPCs are the Phase-1 admin surface.
- No CPC/CPM until founder sets it: `spent_paise` stays 0; prepaid day-rate model only; budget = prepaid amount by construction.
- SSO/OIDC: architecture-ready only (api_clients exists); NOT claimed implemented.
