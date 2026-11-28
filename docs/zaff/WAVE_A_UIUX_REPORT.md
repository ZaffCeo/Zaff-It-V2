# Wave-A: UI/UX Premium & Navigation Polish — Implementation Report
**Date:** 2026-11-28 · **Branch:** `arena/565f9ef2-zaff-it-v2` · **Trigger:** Founder — "Poori app user ki tarah chalao, UI/UX premium/professional banao, saare screens smoothly connected hon, placeholders honest ho."

---

## User-walkthrough findings (app-as-user audit, jo fix kiye)

| # | Finding (user-perspective) | Fix |
|---|---|---|
| 1 | **Explore tab Home ka duplicate tha** — do tabs, ek hi screen | Explore tab ab **asli CategoryDeepDiveScreen** (catalog browsing) render karta hai |
| 2 | **Profile section ~35% tha** — naam/photo nahi, Addresses/Wallet/Orders ke links nahi (screens the hi!) | **Profile 2.0** — neeche detail |
| 3 | **Merchant "Store" tab** Khata dashboard ka duplicate tha | **Real MerchantStoreScreen** — store card, timings, prep/min-order, **working OPEN/CLOSED toggle** (owner UPDATE policy `stores_owner_or_admin_update` pe chalta hai) |
| 4 | **Admin Merchants/Vault/Geofence tabs** teeno Radar duplicate the | **3 real screens** bane — neeche detail |
| 5 | Cart page pe koi close affordance nahi | Header me **close (X)** → Home tab (real navigate) |
| 6 | Rider ko apni kamai app me dikhti hi nahi (032 SQL-only tha) | **"Aaj ki Kamai" card** — `my_rider_earnings()` live RPC: aaj/week/total payout, pending COD, COD-DEPOSIT-DUE chip |
| 7 | Home pe naye verticals ka koi nishan nahi (W7 backend live hai par user ko dikhta nahi) | **"Jaldi Aa Raha Hai" rail** — Medicine/Laundry/Home-Services `ComingSoonCard`s (honest COMING SOON chips, tap → toast). **Koi fake button nahi** |
| 8 | CategoryDeepDive tab-root pe back button dead tha | Back button **tab-root par hidden**, stack me visible (`canGoBack()` guard) |
| 9 | Naye screens ka koi shared chrome nahi tha | **`components/Chrome.tsx`** — ScreenHeader, SectionCard, StatTile, LinkRow, ComingSoonCard, StatusChip — sab mode-aware, 44dp targets, token-driven |

## Profile 2.0 (AccountComplianceScreen rebuild) — kya live hai
- **Hero:** avatar (image ya initials), naam **inline edit modal** → `profiles.update` (RLS `profiles_update_own_or_admin` pe real), phone, chips: **ZaffID (live `my_zaffid` RPC)**, PRO (live `pro_memberships` query), role
- **Live stats row:** Wallet ₹ (latest `wallet_ledger.balance_after`, coins/10), ZaffID, Pro status + expiry
- **Link grid:** Shopping & Activity (Orders tab-switch via dispatch, Notifications, ZaffyChat), Money & Rewards (Wallet, Invite, Pro), Account & Essentials (AddressBook, ZaffID) — **saare 9 links real navigation, koi dead row nahi**
- **Coming-soon verticals** honest placeholders
- Preferences (language/theme), Workspace role-switch (QA), Legal (privacy/terms content-abhi-summary), DPDP delete-account + logout — sab preserved

## Admin screens (real data, real actions)
- **COD Vault:** `rider_cod_deposits` list + rider profile join, pending total summary, **Verify/Reject buttons → `verify_cod_deposit(p_deposit_id, p_approve, p_note)` RPC** (server-side admin guard) — 032 ka admin flow ab UI me
- **Merchants:** merchants + store chips, KYC status chips, commission % — read-only (mutations audited SQL surface par)
- **Geofence Zones:** radius km, base fee, free-above, service hours, LAUNCH-FREE/DARK chips — read-only

## Design system polish (additive — brand identity intact)
- **Koi scratch color-rebuild NAHI kiya** — 36 screens par regression risk tha; instead **additive premium tokens:** `goldSoft/goldBorder` (gold tints), `borderAlt` (subtle hairlines — pehle missing tha), `overlayScrim` (modals), `DEPTH` (iOS+Android shadow presets). Cyber-gold identity preserved.
- Consistent card/row radii, 44dp+ targets, token typography on all new surfaces.

## Verification
- **tsc EXIT=0** (apps/mobile project, zero errors)
- **Data-presence checks on live DB:** merchant store "Makrana Super Kirana - Station Road" (open) Merchant Store screen me dikhega; 2 live zones Geofence me; 1 verified deposit Vault me
- **RPCs used are the same already E2E-proven server-side:** verify_cod_deposit, my_rider_earnings, my_zaffid (032/029 waves)
- **NOT TESTED on device:** visual switches/refresh require device run (no emulator in sandbox) — labeled honestly; logic paths type-checked and RPC paths server-proven

## Abhi bhi baaki (honest)
- Merchant Store: timings/prep/min-order **editing** (abhi sirf display + open-toggle)
- Admin Merchants: KYC approve/reject actions (approvals RPC surface par hoga)
- Avatar **upload** (R2 founder-blocked — initials fallback live)
- Home verticals: jab checkout v5 aayega, ComingSoonCard → real navigation
