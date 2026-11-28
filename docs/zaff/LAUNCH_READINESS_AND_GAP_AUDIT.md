# Zaff-It V2 — Launch Readiness & Gap Audit
**Date:** 2026-11-28 · **Branch:** `arena/565f9ef2-zaff-it-v2` · **Tip:** `48fbe14`
**Trigger:** Founder asked — "Kya ban gaya, ab kya baaki hai, launch kar sakte hain? Stitch ke saare features bane? Back buttons? Profile section?"

**Labels used:** ✅ IMPLEMENTED+E2E · 🟡 PARTIAL · ❌ NOT BUILT · 🔒 FOUNDER-BLOCKED

---

## 1. Kya ban chuka hai (verified, live)

### Database — EK hi Supabase project (non-negotiable #1 maintained)
- **Project:** `mglypwlmwzktxnvlomke` · **86 tables · 122 functions · 8 pg_cron jobs** · migrations 001→033 all applied live + synced to `infrastructure/database/*.sql`
- **No second database anywhere.** Single Postgres = single source of truth for every role and vertical.

### Money & commerce waves (all E2E-tested on live DB)
| Wave | Ships | Status |
|---|---|---|
| W3 Ratings/Tips | rider_ratings/tips, store_ratings, feedback RPC | ✅ |
| W5 Delivery pricing | distance slabs ₹25/30/50, free ≥₹199, escalation ladder + cron | ✅ |
| W6 Wallet | Z-Coins (10 coins = ₹1), 10% cap, FIFO expiry, first-500 ₹100 | ✅ |
| W4a Referrals | ZAFF-XXXXXX codes, 50/50+500 coins, tier ladder L2/L3/L4 | ✅ |
| W4b Pro | ₹49 intro/₹99/₹199 plans, webhook-verified activation, free delivery | ✅ |
| W4c+030 Ads | 4 placements, server-priced bookings, webhook-only activation, serving trio | ✅ |
| ZaffID P1 | ZAFF-6X5CU9 style identities, public lookup, rate-limited | ✅ |
| 031 W-Seller | flat fee engine, auto-credit on delivered, UTR settlement batches | ✅ |
| 032 W-Rider | distance-tier payouts, COD deposits + overdue auto-pause | ✅ (SQL-only) |
| 033 W7 | medicine ₹69 day/₹99 night, laundry ₹15/kg, service_provider quotes, orders.vertical_key | ✅ (SQL-only) |

### App UI — 36 TSX screens, all real actions (no fake buttons)
- **Customer (16 screens live):** Splash/Onboarding, LoginOTP, Home (sponsored rail + banner ads), UniversalSearch (ad events), CategoryDeepDive, ProductDetail, Cart→Checkout→Razorpay(test), OrderTracking, OrdersAndSupport, RequestIt, ZaffyChat (AI), Wallet, AddressBook, NotificationCenter, Invite, Pro, ZaffId, RatingTip
- **Merchant (5 tabs):** Orders, Inventory, Khata (dashboard + Insights + **KhataCard + SettlementCard 031**), Ads (bookings/transactions), Store
- **Rider (3 tabs):** Duty/Tasks (escalation-aware), Handover/Delivery-OTP, KYC/Shift
- **Admin (5 tabs):** Radar (live ops board), Catalog Review, + Merchants/Vault/Geofence

### Stitch coverage — honest numbers
- **200 Stitch design dirs scanned.** Prior audit: **113/199 mapped** to built screens. Since then aur bane: ZaffId, Pro, Invite, MerchantAds, MerchantKhata+Settlement, RequestIt, Wallet, ZaffyChat → **real coverage ≈ 60–65% of Stitch designs**.
- **❌ PooRE modules Stitch me hain par abhi NAHI bane** (gap list, big ones):
  - **Group/Mohalla Orders** (shared cart, privacy self-pay, WhatsApp collect, group packing station) — ~10 designs
  - **ZAFF Move** (marble machinery/tempo/freight/heavy cargo booking hub + rate cards) — ~6 designs
  - **Print & Xerox flow** (document print, live print tracking OTP, print terminal queue) — ~4 designs
  - **Eco bag return** (zero-plastic hub, doorstep bag return cashback) — ~3 designs
  - **Social Impact / Ahsaas Apna Trust hub** — ~2 designs
  - **Zaff VIP Concierge/FastPass, Z-Coins tier celebration screens, invoice/PDF viewer, disputes/returns flow, merchant damaged-pack replacement, rider SOS, backup rider handover, city expansion (Borawar/Kuchaman launch meter), payment EMI options, penny-drop UPI verify screens, parcel/courier/tiffin dispatch** — ~25 designs
  - **W7 vertical UIs (medicine store front, laundry booking, service provider hub) — ZERO UI** (DB+RPCs ready, checkout v5 hook ready)
  - **Rider earnings/payout UI** — `my_rider_earnings` RPC live, screen ❌ (Stitch: rider_earnings_payout_schedule, rider_bank_upi_disbursement)

---

## 2. Back-button audit (founder ka point — verified screen-by-screen)

**Customer pushed screens: 15/15 me visible back button HAI** ✅ (AddressBook, Wallet, ProductDetail, OrderTracking, UniversalSearch, CategoryDeepDive, NotificationCenter, RequestIt, ZaffyChat, RazorpayCheckout, RatingTip, Invite, Pro, ZaffId — sab `arrow-back`/`chevron-back` render karte hain, aur Android hardware back bhi default stack pop karta hai).

**Jahan back/close sach me missing hai:**
| Spot | Issue | Priority |
|---|---|---|
| `CartCheckoutScreen` (Basket tab) | Cart page ka koi close/back affordance nahi (tab hai isliye zaroori nahi, par checkout flow me user confusion hota hai) | 🟡 Medium |
| **Merchant "Store" tab** | Placeholder — wahi Khata dashboard duplicate render karta hai. Asli Store settings (dukan timings, KYC/GST, store info) ka screen hi nahi hai (Stitch: merchant_setup_dukan_kyc, merchant_store_timings) | 🔴 High |
| **Admin "Merchants"/"COD Vault"/"Geofence" tabs** | Teeno Radar board ka duplicate. Asli Vault UI (COD bags/deposits) + Merchants governance list nahi bane (Stitch: cod_cash_vault_rider_payouts_control_tower, operations_hub) | 🔴 High |
| Rider KYC/Handover | Tab-based, theek hai; par rider me bank/UPI disbursement settings screen ❌ | 🟡 Medium |

*(Splash/Login pe back nahi hota — intentional & correct.)*

---

## 3. Profile section audit (founder ka point — 100% SAHI hai)

**Abhi profile (Account tab) me hai:** language switch, theme, role switch, ZaffID/Pro/Invite links, privacy policy + terms modals, DPDP account-delete, logout.

**❌ Missing (Stitch ke profile designs vs reality):**
1. **Naam + photo edit** — UI hi nahi (profiles table me field hai)
2. **Addresses link missing** — AddressBookScreen bana hua hai par profile se entry nahi!
3. **Wallet/Z-Coins link missing** — WalletScreen bana hua par profile se entry nahi
4. **Orders/bills link missing** — OrdersAndSupport tab alag hai, profile se shortcut nahi
5. Z-Coins tier/status card, referral summary card, saved payment methods, help & support hub link, notifications shortcut — sab missing
6. Naye verticals (laundry/service/medicine) ke liye koi profile entry nahi

**Verdict: Profile section = ~35% built (compliance-heavy). Ek W-A1 "Profile 2.0" wave chahiye.**

---

## 4. Launch kar sakte hain? — Honest verdict

### 🟢 Launch-ready (tested end-to-end)
- Grocery order lifecycle: cart → checkout (slabs/wallet/pro/referral sab apply) → Razorpay (webhook-verified) → order → merchant accept → rider assign → delivered → rating/tip → seller credit + rider payout stamp
- Money rules: wallet cap/FIFO/expiry, refunds, settlements, COD deposits, ads activation — sab server-enforced, RLS on, no service-role keys in frontend
- QA: 100+ RPC-level E2E guards proved across 15 migrations

### 🔒 Public launch se PEHLE chahiye (founder-side, app code nahi)
1. **Real SMS OTP provider** (MSG91/Twilio) — abhi sirf QA bridge/test accounts; bina SMS ke real customers login nahi kar payenge ← **#1 blocker**
2. **Razorpay LIVE keys** (abhi test mode `rzp_test_…`)
3. **R2 credentials ×5** (product/prescription images; abhi image URLs config-driven)
4. Play Store / EAS build credentials
5. CPC/CPM pricing decision (ads activate karne ke liye)
6. GST/legal docs, support phone number

### 🟠 Pre-launch code checklist (chhota, ek din ka kaam)
- [ ] `025` ke 2 missing CHECK rebuilds + `024` ka `%:02s` typo patch file
- [ ] 2 QA ad campaigns cancel (`9c40e372…`, `96b54678…`)
- [ ] RLS audit as non-superuser
- [ ] Device pe Razorpay test flow
- [ ] Profile 2.0 + Merchant Store tab + Admin Vault UI (upar ke high-priority gaps)

**Verdict:** **Makrana soft-launch (pilot, invite-only) technically possible hai jaise hi SMS + Razorpay live ho.** Public launch se pehle profile/back/admin polish wave aur pre-launch checklist poora karna chahiye. Poora Stitch scope (group orders, ZAFF Move, print) launch ke LIYE zaroori nahi — wo post-launch waves hain.

---

## 5. Database — aage kaun kaun sa use hoga

**Sab kuch isi ek Supabase Postgres me hi chalega** (aapka rule: no second project). Domain-wise map:

| Domain | Tables | Aage ka use |
|---|---|---|
| Catalog & commerce | products, product_variants/prices/images, inventory, stores, merchants, carts, orders, order_items, payments, refunds, coupons, flash_sales | Launch me hi core |
| Logistics | delivery_tasks, rider_locations, addresses, service_zones, delivery_handover_otps | Core |
| Money | wallet_ledger, settlement_ledger, seller_settlements, rider_cod_deposits, ops_*_config (3), pro_memberships, subscriptions | Core |
| Growth | referrals, referral_codes/tier_grants, ad_campaigns/events/pricing/transactions, coupons | Core |
| Identity | profiles, user_roles (5 roles ab), zaff_identities/events/connected_apps, user_badges | Core + SSO future |
| **W7 verticals** | ops_vertical_config, laundry_orders, service_requests/quotes, orders.vertical_key | **Medicine/laundry/service UI wave (W-A3) isi ko consume karegi — checkout v5 me `vertical_key` se fee resolve** |
| Zaffy AI | zaffy_conversations/messages/memories/settings/usage/tool_audit/feedback, zaffy_action_proposals | ZaffyChat already wired |
| Catalog platform | sources, source_product_mappings, catalog_ingest_queue, mandi_prices, barcodes | DATA_GOV_IN key founder-side |
| Compliance | audit_logs, approvals, feature_flags, rate_limit_events, api_usage_logs | Ops |

**External services (not databases):** Razorpay (payments), SMS provider (pending), R2 (media, pending), Google DATA_GOV_IN (mandi, pending).

---

## 6. Recommended upgrade waves (priority order)

| Wave | Scope | Effort |
|---|---|---|
| **W-A1 Profile 2.0** | Naam/photo edit, profile grid (Addresses, Wallet, Orders, Notifications, Help), coins tier card, referral card, laundry/service/medicine entries (flag-gated) | 1 din |
| **W-A2 Nav & Admin polish** | Cart close affordance, Merchant **Store tab real** (timings/KYC/store info), Admin **Vault real** (COD deposits UI — 032 RPCs ready), Admin Merchants list real, Rider earnings card (`my_rider_earnings`) | 1–2 din |
| **W-A3 Vertical UIs** | Medicine checkout v5 (vertical_key fee + prescription upload jab R2 ho), Laundry booking UI, Service quotes UI | 2–3 din |
| **W-A4 Stitch backlog** | Group orders, ZAFF Move, Print flow, eco bag, returns/disputes | Post-launch |
| **Pre-launch checklist** | §4 ke 5 items | ½ din |

*Honesty note: rider UI card 032 me tha hi nahi (SQL-only tha) — W-A2 me cover hoga. W7 verticals bhi SQL-only the — W-A3 me UI aayega.*
