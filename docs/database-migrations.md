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
#    ... through 024_w5_service_hours_and_escalation.sql
# 2. Seed ops token (kept out of git):
#    select public.ops_rotate_catalog_kick_token('<new-token>');
#    and mirror it into edge-function secret CATALOG_INGEST_TOKEN.
# 3. Edge-function secrets (server-side only): see docs/zaffy-platform.md §8.
```

## Recent migrations (W3/W5/W6/W4, applied live 2026-11-26/27)

| File | What it ships | Verified |
|---|---|---|
| `022_w3_rating_tip.sql` | `rider_ratings` / `rider_tips` / `store_ratings` + `submit_delivery_feedback` RPC (idempotent, +20 coins, tip ₹10-2000 → rider weekly settlement) | E2E on real delivered order; replay guard + not-found guard proven |
| `023_w5_delivery_pricing.sql` | `orders.handling_fee_paise`, `service_zones.launch_free_delivery`, rebuilt `create_checkout_order`: distance slabs ₹25/₹30/₹50 (>10 km rejected), free ≥ ₹199 or launch-month flag, handling ₹5/₹10 | 3 live orders: launch-free, ₹25 slab @ 2006 m, threshold + ₹10 handling |
| `024_w5_service_hours_and_escalation.sql` | Zone hours 06:00-21:00 IST (`MKN-CENTRAL` night till 01:00, dark_store/kwick only — `orders_service_hours_guard` BEFORE INSERT trigger), escalation ladder on `delivery_tasks` (+₹5 & +2 km at 2 min, customer choice at 5 min, wait re-arm after 10 min), `resolve_delivery_escalation` RPC, pg_cron `zaff-escalate-delivery-tasks` every minute | Sweep levels 1→2 verified live; guards: no-pending / wrong-user / invalid-choice; hours reject + pass proven on BORAWAR zone |
| `025_w6_wallet_rules.sql` | Wallet doc rules on `wallet_ledger`: `source_type`/`expires_at`/`remaining_coins` (+ entry/referrer CHECK widened), `wallet_spendable`, cap-aware `wallet_credit` (₹10k = 100k coins cap), FIFO `wallet_redeem`, `expire_wallet_credits` + pg_cron daily 00:10 IST, `wallet_first500_grants` counter + `claim_first500_bonus` (₹100 = 1000 coins, 90d), orders.`wallet_coins_used`/`wallet_discount_paise`, `create_checkout_order` +`p_use_wallet` (≤10% of product value; fees never wallet-paid; free-delivery threshold on payable-after-wallet), cancel RPC refunds wallet coins (180d) | Live E2E: 10% cap (156/201 coins), ₹10k cap reject, FIFO consume, cancel refund +180d, first-500 claim + replay guard, expiry sweep, threshold flip ₹211→₹215.90 |
| `026_w4a_referrals_ladder.sql` | W4a Invite: `referral_codes` (ZAFF-XXXXXX), `referrals` (no-self, device-hash dedup, signed_up→rewarded), `referral_tier_grants` (L2@5→Pro 30d, L3@10→Pro+1000 coins 90d, L4@25→zaff_star badge), `user_badges`, `pro_memberships` (partial UNIQUE on active), `get_or_create_my_referral_code` / `apply_referral_code` / `process_referral_ladder` / `my_referral_summary`, trigger `trg_referrals_first_order` (referee's first delivered order → 50/50 coins, 500 each, 90d) | E2E: guards (invalid/self/used/device) all P0001; rider COD order delivered → +500 both sides; 25 synthetic referees → L2/L3/L4 tier flips verified |
| `027_w4b_pro_memberships.sql` | W4b Zaff Pro: `create_pro_membership_order(p_plan)` (customer ₹49 intro once else ₹99; seller/provider ₹199), `activate_pro_membership` (service_role-only, dedup, exact-amount), `my_pro_status()`, `create_checkout_order` v4 (+`v_is_pro` → free delivery + ₹0 handling before flag/threshold), edge fn `checkout-create-pro-order` (Razorpay receipt `PRO-*`) + webhook v8 pro-branch | E2E: customer Pro flag-OFF order total = subtotal exactly; rider intro ₹49 purchase → active exp +30d; wrong-amount P0001; replay deduplicated |
| `028_w4c_zaff_ads.sql` | W4c Zaff Ads: `ad_campaigns` (search_keyword/category_banner, 6 statuses, ad_keyword_required CHECK, budget>0, spent=0) + partial index `idx_ad_campaigns_serving`; `create_ad_booking` (owner-only, headline 3-80, 1-30 days, ≥₹100/day → approvals entity 'ad'), `review_ad_booking` (admin-only; approve→active with starts/ends, reject→note; syncs approvals), `get_sponsored_search` (active+in-date keyword ILIKE, live-store/product/inventory join, LIMIT 2), `record_ad_event` (honest impression/click counters), `my_ad_campaigns()` | E2E: booking→approvals 'ad' row; merchant-review P0001; admin approve→active; serving row (Amul ₹27 @ 38 stock); impression+click counters; no-match []; RLS merchant-or-admin (runtime inconclusive via superuser — policy logic reviewed) |

Note: free-delivery threshold is evaluated on subtotal. When the wallet wave (W6)
lands, the doc's "payable after wallet discount" rule must change the RPC/preview
to subtract wallet discounts from the threshold basis.

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
