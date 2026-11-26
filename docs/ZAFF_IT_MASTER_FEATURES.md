# ZAFF-IT — Master Feature List & Ecosystem Blueprint (v1)

> **Source:** Project discussions ka combined master feature list (owner-approved planning baseline).
> **Purpose:** Ye document ZAFF-IT ka *complete vision* define karta hai — sirf quick-commerce app nahi, poora **Quick Commerce + Hyperlocal Services + Logistics + Business + Technology Ecosystem**.
> **Status mapping:** Har section ke saath current implementation status (2026-11-26) — repo ke against verified (16 screens, 24 SQL tables, 7 Edge Functions, SQL migrations 001–005).
> **Baseline spec:** `docs/ZAFF-IT_Complete_Developer_Handoff_v1.docx` · **Phases:** 0–7 (pilot: Makrana) · **Visual references** (Dribbble/Stitch moodboards) jaan-boojh ke repo se bahar rakhe gaye hain — sirf text spec yahan hai.

**Legend:** ✅ Working · 🟡 Partial/started · ⬜ Planned (phase noted) · Phase numbers = §18 priority table

---

## 1. Customer App — ZAFF-IT

### A. Account & Personalization

| Feature | Status | Notes |
|---|---|---|
| Mobile OTP login | ✅ | LoginOtpScreen + Supabase phone auth (demo 9876543210 → 123456) |
| Email login | ⬜ | Phase 1-later |
| Google / Apple login | ⬜ | Phase 1-later |
| Guest browsing | 🟡 | Home browsable without login; checkout pe login gate |
| Multiple delivery addresses | ✅ | AddressBookScreen + `addresses` table (checkout ownership-validated) |
| Family accounts / Multiple profiles | ⬜ | Phase 2 |
| Language selection | ✅ | Splash: English / हिंदी / Hinglish |
| Dark / Light mode | 🟡 | Dark theme (gold/black infinity-Z); light mode pending |
| Personalized home screen | 🟡 | Static sections + recently viewed basis; AI feed Phase 3 |
| AI-based recommendations | ⬜ | Phase 3 (transaction data chahiye) |
| User preferences | ⬜ | Phase 2 |
| Order history | 🟡 | OrdersAndSupportScreen |
| Wallet and loyalty profile | ⬜ | Phase 4 |

### B. Home & Discovery

| Feature | Status | Notes |
|---|---|---|
| Smart home screen | ✅ | CustomerHomeScreen: banners, categories, sponsored, trending |
| Categories and subcategories | ✅ | `categories` table + category pages |
| Trending products / Best sellers | 🟡 | Seed-based; real metrics Phase 3 |
| Recently viewed / Frequently bought | ⬜ | Phase 3 |
| Nearby stores | 🟡 | Makrana stores (MKN-CENTRAL, MKN-BORAWAR-IND); radius logic `service_zones` |
| Offers and deals / Seasonal collections | 🟡 | `promotions` table; campaign UI Phase 4 |
| Personalized product feed | ⬜ | Phase 3 |
| Search suggestions | 🟡 | Basic; typed-prefix suggestions pending |
| Voice search | ⬜ | Phase 3 |
| Image-based product search | ⬜ | Phase 3+ |
| Barcode search | ✅ | Multi-source lookup chain (OFF/OPF fallback tiers) — `docs/CATALOGUE_DATA_SOURCES.md` |
| AI shopping assistant | ✅ | Zaffy (gemini-2.5-flash, tool-grounded, rate-limited) |

### C. Product & Catalog

| Feature | Status | Notes |
|---|---|---|
| Product images / descriptions / MRP & selling price | ✅ | `products` + `store_products` |
| Live price updates | 🟡 | Server-authoritative pricing at checkout; UI push later (WebSockets) |
| Product variants / weight selection | 🟡 | Pack-size variants in catalogue data |
| Brand information | 🟡 | Brand field exists; brand pages Phase 2 |
| Nutritional / expiry information | 🟡 | Partial in catalogue; near-expiry flags Phase 2 |
| Availability / stock status | ✅ | `inventory` + atomic reserve/release |
| Product comparisons / Similar / Substitutes | ⬜ | Phase 3 (AI-assisted) |
| Product reviews and ratings | ⬜ | Phase 2 |
| Wishlist | ⬜ | Phase 2 |
| Price-drop alerts | ⬜ | Phase 3 |

### D. Shopping Cart & Checkout

| Feature | Status | Notes |
|---|---|---|
| Add/remove products, multiple quantities | ✅ | `carts`/`cart_items` + CartCheckoutScreen |
| Save for later | ⬜ | Phase 2 |
| Smart cart suggestions | ⬜ | Phase 3 |
| Coupon application / Automatic offers | 🟡 | `promotions` + server-side validation; UI flows partial |
| Minimum order calculation | ✅ | Checkout RPC |
| Delivery fee / Handling fee / Platform fee | ✅ | Free delivery ≥ ₹299; handling ₹2; server-side integer-paise math |
| GST calculation | 🟡 | Line-level structure ready; invoice generation Phase 2 |
| Multiple payment methods | ✅ | COD + Razorpay (UPI/cards/netbanking via gateway) |
| Wallet payment | ⬜ | Phase 4 |
| Order confirmation | ✅ | Placed → accepted state machine |

### E. Delivery & Tracking

| Feature | Status | Notes |
|---|---|---|
| Order preparation status | ✅ | Full state machine (created → delivered + cancelled/refund_*) |
| Rider assignment | ✅ | order-lifecycle (admin/merchant assigns; rider-accept) |
| Live rider tracking | 🟡 | `rider_locations` table ready; live map + WebSockets pending |
| Real-time ETA | ⬜ | Phase 3 (Logistics AI) |
| Delivery instructions / Contactless delivery | 🟡 | Address notes |
| OTP delivery verification | ✅ | **Post-audit hardened**: OTP vault (deny-all RLS) + `get_my_delivery_otp` RPC — customer-tells-rider flow |
| Delivery photo proof | ⬜ | POD — schema delta review pending |
| Multi-order tracking | ⬜ | Phase 2 |
| Delivery rescheduling | ⬜ | Phase 2 |
| Order cancellation | ✅ | Lifecycle cancel path + inventory release |
| Refund tracking | 🟡 | `refunds` table + refund_* states; customer UI pending |
| Delivery feedback | ⬜ | Phase 2 |

### F. Customer Support

| Feature | Status | Notes |
|---|---|---|
| In-app chat / AI chatbot | ✅ | Zaffy assistant |
| WhatsApp support / Call support | ⬜ | Phase 2 (WhatsApp API) |
| Missing/damaged/wrong-item complaints | 🟡 | `support_tickets` table + OrdersAndSupportScreen |
| Refund / Return requests | 🟡 | Refund states defined; flow wiring pending |
| Complaint tracking / Ticket management | 🟡 | `support_tickets` schema ready; admin ticket queue pending |

---

## 2. ZAFF Rider App

### A. Rider Registration

| Feature | Status | Notes |
|---|---|---|
| Mobile OTP registration | ✅ | Same auth flow, rider role |
| Profile and photograph | 🟡 | RiderShiftKycScreen; photo upload via r2-presign |
| Aadhaar / PAN verification | 🟡 | KYC screen collects; verification workflow Phase 1-later |
| Driving licence / Vehicle / RC & insurance | 🟡 | KYC fields |
| Bank account / UPI | ⬜ | Earnings ke saath (Phase 2) |
| Document verification / Background checks / Rider approval | ⬜ | Admin approval queue Phase 1-later |

### B. Rider Dashboard

| Feature | Status | Notes |
|---|---|---|
| Online / Offline status | ✅ | RiderTasksScreen shift toggle |
| Available / Active orders | ✅ | Delivery task queue |
| Today's earnings / Weekly / Monthly | ⬜ | Phase 2 (settlement engine) |
| Incentives | ⬜ | Phase 2 |
| Delivery history / Performance score / Ratings | ⬜ | Phase 2 |

### C. Delivery Management

| Feature | Status | Notes |
|---|---|---|
| Automatic order allocation | 🟡 | Abhi manual/round-robin via lifecycle; smart auto-dispatch Phase 3 |
| Manual order acceptance | ✅ | Rider accept/reject tasks |
| Smart rider assignment / Multiple order batching | ⬜ | RiderBatch — schema delta review pending |
| Pickup / Delivery navigation | ⬜ | Maps API integration |
| Customer calling / Masked numbers / In-app chat | ⬜ | Phase 2 |
| Pickup QR / barcode | 🟡 | Store handover design (checkout-adjacent); UI pending |
| Delivery OTP | ✅ | Vault-backed verify on delivered transition |
| Photo proof | ⬜ | POD pending |
| Failed delivery reporting / Return-to-store / Reassignment | 🟡 | Lifecycle exceptions Admin board pe visible; rider-side flow partial |

### D. Rider Earnings — ⬜ Phase 2
Per-delivery payment, distance pay, peak/rain/festival incentives, target bonuses, referral bonuses, weekly settlements, instant payout, breakdown, penalty transparency, disputes. *(Pura block Phase 2 — settlement_ledger schema ready hai.)*

### E. Rider Safety & Welfare — ⬜ Phase 1-later/2
SOS button, accident reporting, emergency contacts, safety guidelines, fatigue alerts, insurance info, rider support, break management, suspicious order reporting.

### F. Rider Beyond ZAFF-IT — ⬜ Phase 5 (ZAFF Connect)
Rider sirf ZAFF-IT orders tak limited nahi rahega:
- ZAFF Connect external delivery jobs
- Third-party logistics assignments · Local parcel · B2B deliveries · Document delivery · Scheduled deliveries · Partner company deliveries
- Bike-based advertising (Phase 4 Ads ke saath) · Rider referral program
- Future: Rapido-style mobility integration (§16 ZAFF Mobility)

> **Long-term concept:** ZAFF Rider ek independent earning platform — ZAFF-IT ke alawa approved external partners bhi orders de saken.

---

## 3. Store / Dark Store Management

### A. Store Management

| Feature | Status | Notes |
|---|---|---|
| Multiple store creation | ✅ | `stores` table, Makrana 2 stores seeded |
| Store manager accounts | 🟡 | `user_roles` + RLS scoping |
| Operating hours / Delivery radius / Capacity | 🟡 | `service_zones` + store fields |
| Store-wise catalogue & pricing | ✅ | `store_products` (per-store price/stock) |
| Store capacity | ✅ | Dark Store Readiness gate (500/day) Admin board pe |
| Staff management / Store performance / Holiday management | ⬜ | Phase 2 |

### B. Inventory Management

| Feature | Status | Notes |
|---|---|---|
| Live inventory / SKU management | ✅ | `inventory` + `inventory_movements` |
| Barcode scanning / QR scanning | 🟡 | Lookup chain client-side; in-store scanner UI pending |
| Batch management / MRP / Purchase & selling price | 🟡 | Price fields ready; batches pending |
| Stock inward / outward | 🟡 | Movements ledger |
| Stock reservation | ✅ | Atomic RPCs (FOR UPDATE locks, deadlock-safe) |
| Damaged / Expired stock / Near-expiry alerts | ⬜ | Phase 2 (FEFO ke saath) |
| Low-stock alerts | 🟡 | Threshold fields; alerts UI pending |
| Stock adjustment / transfer / Physical verification | ⬜ | Phase 2 |
| Automatic inventory synchronization | ⬜ | Phase 3 |

### C. Smart Warehouse — ⬜ Phase 2 (500/day gate ke baad)
Digital shelf locations, rack/bin management, product placement, fast-mover identification, pick-path optimization, smart picking lists, order batching, packing verification, barcode dispatch, FEFO picking, cold-chain monitoring.

### D. Store Procurement — ⬜ Phase 2
Supplier management, purchase orders, goods receiving, supplier invoices, GRN, purchase returns, vendor payments, reorder suggestions, automatic replenishment, demand forecasting.

### E. Store Analytics — ⬜ Phase 2/3
Daily sales, stock turnover, wastage, expiry losses, gross margin, product performance, order prep time, picker performance, store profitability.

---

## 4. Picker / Packer App — ⬜ Phase 2 (dark store gate)

Dark store staff ke liye separate lightweight app. Features: new order notifications, order queue, smart pick list, shelf-wise navigation, barcode verification, quantity verification, product substitution, out-of-stock reporting, quality check, packing instructions, bag assignment, order sealing, rider handover, packing time tracking, staff productivity.

> **Note:** RiderBatch + POD schema delta review (research-library pipeline) isse directly feed karta hai.

---

## 5. Merchant / Seller App

Local shops, supermarkets, wholesalers, independent sellers.

| Feature | Status | Notes |
|---|---|---|
| Business registration / KYC | 🟡 | `merchants` table; KYC flow partial |
| Store creation | ✅ | Merchant dashboard |
| Product listing / pricing / stock | ✅ | MerchantInventoryScreen |
| Bulk upload (Excel/CSV import) | ⬜ | Phase 2 |
| Order management / acceptance / packing | ✅ | MerchantOrdersScreen + lifecycle |
| Delivery status / Return management | 🟡 | Lifecycle status; returns Phase 2 |
| Refund tracking | 🟡 | Refund states |
| Commission breakdown / Settlement reports | 🟡 | `settlement_ledger` ready; reports UI Phase 2 |
| GST invoices | ⬜ | Phase 2 |
| Sales analytics / Customer insights | ⬜ | Phase 3 |
| Promotional campaigns / Advertisement management | ⬜ | Phase 4 (ZAFF Ads) |
| Multiple branches / Employee access | ⬜ | Phase 3 |
| Business support | 🟡 | Zaffy merchant-side assistant later |

---

## 6. Supplier / Distributor Portal — ⬜ Phase 2

Supplier registration, manufacturer/distributor onboarding, product catalogue, wholesale pricing, bulk orders, purchase orders, stock availability, invoice management, GST details, delivery scheduling, warehouse management, retailer network, payment reconciliation, credit management, sales reports, product performance, supply forecasting, automated replenishment.

---

## 7. ZAFF Admin Dashboard

Poore ecosystem ka control centre.

| Feature | Status | Notes |
|---|---|---|
| Customer/Rider/Merchant/Supplier/Store management | 🟡 | User roles + RLS; admin screens Phase 1-later |
| Role-based access / Permissions | ✅ | `user_roles` + 68 RLS policies + audit-hardened |
| All live orders / status / manual assignment | ✅ | AdminOpsBoardScreen (Live Order Exceptions, CRITICAL/WARNING) |
| Automatic assignment | ⬜ | Phase 3 (smart dispatch) |
| Order cancellation / Refund approvals / Failed deliveries / Disputes | 🟡 | Lifecycle-backed; approval UI pending |
| SLA monitoring | ⬜ | Phase 3 |
| Total revenue / GMV / Commission / Fees | ⬜ | Financial dashboards Phase 2 |
| Payment gateway reconciliation | 🟡 | Razorpay webhook + payments table; reconciliation report pending |
| Rider payouts / Merchant settlements / Supplier payments | ⬜ | Phase 2 (settlement engine) |
| Taxes / P&L / Store-wise profitability | ⬜ | Phase 2/3 |
| Coupon creation / Discount / Campaign management | ⬜ | Phase 4 marketing suite |
| Push / SMS / WhatsApp campaigns | ⬜ | Phase 2+ |
| Referral campaigns / Loyalty / Sponsored products / Banners | ⬜ | Phase 4 |
| App configuration / Feature flags | ✅ | `feature_flags` (enable_dark_store, enable_p1_verticals live) |
| API management / Service zones / Delivery charges / Tax & payment settings | 🟡 | Zones + fee config; admin UI pending |
| Audit logs | ✅ | `audit_logs` (SECURITY_HARDENING_005 included) |
| Fraud detection / Security monitoring | 🟡 | Security audit done (PR #5); fraud engine Phase 3 (RiskFlag delta) |
| User activity logs / System health | 🟡 | Audit logs; health dashboards pending |

---

## 8. ZAFF Intelligence — AI Layer

> **Important (owner directive):** AI ko sirf chatbot nahi banana — real business decisions aur automation mein use karna hai. Demand prediction jaise features ke liye actual transaction data aur validation zaroori hai.

### Customer AI
| Feature | Status |
|---|---|
| AI shopping assistant (Zaffy) | ✅ Phase 1 (grounded, rate-limited) |
| Natural-language shopping | 🟡 Zaffy queries |
| Smart product recommendations / Personalized deals | ⬜ Phase 3 |
| Voice-based ordering | ⬜ Phase 3 |
| Smart basket creation | 🟡 Recipe Shopping + ₹500 budget/4-logon flows (already live) |
| Budget-based shopping | ✅ Live |
| Repeat-order prediction | ⬜ Phase 3 |
| Dietary preference filtering | ⬜ Phase 3 |

### Business AI — ⬜ Phase 3 (transaction data collect hone ke baad)
Demand prediction, inventory forecasting, automatic reorder suggestions, dynamic assortment recommendations, dead-stock identification, price intelligence, competitor price monitoring, sales forecasting, profit optimization, store performance prediction.

### Logistics AI — ⬜ Phase 3
Intelligent rider allocation, traffic-aware routing, delivery time prediction, order batching, rider demand forecasting, delivery zone optimization, fuel efficiency optimization, fraudulent delivery detection.

### AI Automation — ⬜ Phase 3/5
Automatic customer support, merchant support assistant, rider support assistant, invoice data extraction, product catalogue enrichment, duplicate product detection, automated report generation, business anomaly detection.

---

## 9. ZAFF Advertising & Monetization — ⬜ Phase 4

**Digital:** Sponsored products, sponsored search results, homepage banners, category ads, brand stores, sponsored recommendations, push campaigns, in-app video ads, brand promotions.
**Physical:** Rider bike branding, delivery bags, uniforms, store branding, packaging ads, delivery stickers, local business promotions, event sponsorships.
**Advertiser Portal:** Registration, campaign creation, target audience, location targeting, budget management, scheduling, impression/click/conversion tracking, ROI reports, self-service ads.

> Foundation ready: sponsored slots already UI me hain (Home "Sponsored" section); monetization engine Phase 4.

---

## 10. ZAFF Connect — External Business Network — ⬜ Phase 5

Goal: ZAFF ka logistics infrastructure sirf apne customer orders ke liye nahi, external businesses ke liye bhi useful ho.

Third-party business onboarding, external delivery partners, merchant integrations, logistics company integrations, external order intake, API-based order creation, rider availability sharing, multi-business dispatch, delivery tracking API, webhooks, partner settlements, SLAs, partner performance analytics.

---

## 11. ZAFF Wallet & Loyalty System — ⬜ Phase 4

Customer wallet, rider wallet, merchant settlement wallet, refund wallet, reward points, cashback, referral rewards, membership plans, subscription benefits, loyalty tiers, gift cards, promotional credits, transaction history, wallet statements, reward redemption.

---

## 12. ZAFF Membership & Subscription — ⬜ Phase 4

Monthly/yearly membership, free delivery benefits, exclusive discounts, early access deals, priority support, special member pricing, family membership, business membership, personalized plans.

---

## 13. ZAFF Social & Community Commerce — ⬜ Phase 2/3

Product sharing, shopping lists, family shopping lists, shared carts, group ordering, community offers, local recommendations, product reviews, photo reviews, product Q&A, referral sharing, community shopping campaigns.

> Foundation ready: **Mohalla Group Orders + Request-It reverse bidding** = `enable_p1_verticals` feature flag (Phase-1 verticals plan already defined).

---

## 14. ZAFF Website & Web Applications

| Feature | Status | Notes |
|---|---|---|
| Customer shopping website | ✅ | Expo web build (production-gated demo roles, security-audited) |
| Merchant portal (web) | ✅ | Merchant screens web build me |
| Admin dashboard (web) | ✅ | Admin Control Tower web me |
| Supplier portal | ⬜ | Phase 2 |
| Advertiser portal | ⬜ | Phase 4 |
| Rider registration website | 🟡 | Web KYC screen |
| Business partnership website | ⬜ | Phase 5 |
| Support centre | ⬜ | Phase 2 |
| Brand landing pages / SEO category & product pages / Order tracking pages | ⬜ | Phase 2 (SEO Phase 3) |

---

## 15. ZAFF Technology & Integration Layer

| Technology / System | ZAFF-IT mein use | Status |
|---|---|---|
| API Gateway | All applications ka common entry point | 🟡 Supabase Edge Functions (modular gateway) |
| Microservices | Independent business modules | 🟡 Modular monolith — premature splitting NAHI (owner directive) |
| PostgreSQL | Main transactional database | ✅ Supabase (24 tables, RLS, RPCs) |
| Redis | Cache, sessions, live data | ⬜ Phase 2+ (jab volume maange) |
| Cloudflare R2 | Product images and files | ✅ r2-presign-upload |
| Docker | Application deployment | ⬜ Phase 2+ |
| DNS | Domain and traffic routing | ⬜ Launch ke waqt |
| WebSockets | Live tracking and notifications | ⬜ Phase 2 (Supabase Realtime ready) |
| Message Queue | Order and event processing | ⬜ Phase 3+ |
| Search Engine | Fast product search | 🟡 Postgres FTS abhi; dedicated engine Phase 3 |
| Maps API | Location and navigation | ⬜ Phase 2 |
| Payment Gateway | UPI, cards, payments | ✅ Razorpay (+ HMAC webhook) |
| WhatsApp API | Customer communication | ⬜ Phase 2 |
| Analytics Engine | Business intelligence | ⬜ Phase 3 |
| AI Services | Prediction and automation | ✅ Gemini (Zaffy) — expansion Phase 3 |

---

## 16. Future Expansion Modules — ⬜ Phase 5/6 (architecture compatibility abhi se)

- **ZAFF Marble** — Independent marble industry platform, powered by ZAFF. Marble listings, suppliers, dealers, pricing, inventory, logistics, B2B marketplace. *(Makrana pilot iska natural testbed hai.)*
- **ZAFF Mobility** — Future bike mobility, ride booking, vehicle partners, local transportation.
- **ZAFF Logistics** — Hyperlocal parcel, B2B logistics, scheduled deliveries, third-party fulfilment.
- **ZAFF Financial Services** — Future payment, settlement, merchant finance, financial integrations *(subject to applicable regulatory permissions)*.
- **ZAFF Ads** — Advertising network for local businesses, brands, delivery fleets, digital placements.

---

## 17. ZAFF-IT Application Structure

```
                        ZAFF
          Central Technology & Intelligence Platform
                            │
   ┌────────┬────────┬──────┴───┬─────────┬──────────┬───────────┐
 ZAFF-IT  ZAFF     ZAFF      ZAFF       ZAFF       ZAFF       ZAFF
 (customer) Rider   Store     Merchant   Supplier   Admin      Ads/Connect
                            │
              Shared Infrastructure
   APIs · Database · AI · Payments · Inventory · Logistics · Analytics · Security
```

**Current implementation:** ZAFF-IT (customer) + ZAFF Rider + ZAFF Store (merchant side) + ZAFF Admin — ek Expo app me 4 role surfaces + shared Supabase backend. Separate apps (Picker, Supplier, Advertiser) unke phase pe spin-out honge, same shared infrastructure pe.

---

## 18. Development Priority

| Phase | Development scope | Current state |
|---|---|---|
| **Phase 1** | Customer app, Admin, Rider, Store, Inventory, Orders, Payments | 🟡 **IN PROGRESS** — core flows live (auth→cart→checkout→lifecycle→OTP delivery), pilot Makrana, security-audited |
| **Phase 2** | Merchant, Supplier, Procurement, Settlements | ⬜ Settlement ledger schema ready |
| **Phase 3** | AI recommendations, forecasting, automation | ⬜ Zaffy groundwork done |
| **Phase 4** | ZAFF Ads, Membership, Loyalty, Wallet | ⬜ |
| **Phase 5** | ZAFF Connect, External logistics | ⬜ |
| **Phase 6** | Marble, Mobility aur other independent verticals | ⬜ |

> Quick-commerce ki success sirf app features se nahi aati. **Store-level inventory accuracy, replenishment, pick-and-pack efficiency aur delivery economics** equally important — Phase 1 me hi dhyan dena hai. Ek city ke limited serviceable area me operational pilot se start (Makrana ✅).

---

## 19. Feature Tracking — Master Checklist (LIVE)

**Progress: 6 / 34 complete · 12 partial · 16 not started**

### Customer App — 4.5 / 6
- [x] Authentication & profiles *(phone OTP + addresses + language; email/social/family pending)*
- [x] Product catalogue & search *(barcode chain + categories; voice/image search pending)*
- [x] Cart & checkout *(fees, COD, offers core)*
- [ ] Payments & refunds *(COD+Razorpay ✅, refund flows partial → in progress)*
- [x] Live tracking *(state machine + OTP vault; live map pending)*
- [ ] Customer support *(tickets schema + Zaffy; flow wiring → in progress)*

### Rider App — 2 / 6
- [ ] Registration & verification *(KYC screen partial → in progress)*
- [x] Order allocation *(manual + accept; smart dispatch Phase 3)*
- [ ] Navigation & delivery *(OTP ✅, photo proof + navigation pending → in progress)*
- [ ] Earnings & settlements (Phase 2)
- [ ] Safety & SOS (Phase 1-later)
- [ ] External delivery integration (Phase 5)

### Store & Warehouse — 2 / 6
- [x] Store management *(per-store catalogue/pricing/capacity)*
- [x] Inventory management *(atomic reserve/release + movements)*
- [ ] Barcode scanning *(lookup chain ✅, scanner UI pending → in progress)*
- [ ] Picking & packing (Phase 2 — Picker app)
- [ ] Procurement & replenishment (Phase 2)
- [ ] Expiry & batch management (Phase 2)

### Business Portals — 1.5 / 5
- [ ] Merchant portal *(dashboard+inventory+orders ✅, settlements/analytics pending → in progress)*
- [x] Admin dashboard *(ops board + feature flags + audit logs + role security)*
- [ ] Supplier portal (Phase 2)
- [ ] Advertiser portal (Phase 4)
- [ ] Partner portal (Phase 5)

### Intelligence & Growth — 2 / 6
- [x] AI shopping assistant (Zaffy — hardened + rate-limited)
- [ ] Demand forecasting (Phase 3)
- [ ] Smart dispatch *(manual abhi → in progress)*
- [ ] Advertising engine (Phase 4)
- [ ] Wallet & loyalty (Phase 4)
- [x] Budget-based smart basket *(recipe shopping + budget flows live — membership/subscriptions Phase 4 me merge hoga)*

### Expansion — 0 / 5
- [ ] ZAFF Connect (Phase 5)
- [ ] ZAFF Logistics (Phase 5/6)
- [ ] ZAFF Marble (Phase 6 — Makrana pilot testbed)
- [ ] ZAFF Mobility (Phase 6)
- [ ] ZAFF Financial Services (Phase 6, regulatory-gated)

---

## 20. Architecture Recommendation (owner-approved)

> **"Backend shuru se multi-vertical aur multi-tenant ready rakho, lekin initially unnecessary microservices aur AI infrastructure mat banao. Modular architecture se start karo. Jab actual order volume aur operational complexity badhe, tab services separate karna."**

**Implementation of this directive (already in place):**
1. **Modular monolith** — Supabase Postgres + Edge Functions, domain-separated schemas/tables (stores, merchants, riders, orders, settlements) — services baad me extract ho sakti hain
2. **Multi-tenant foundations** — `stores` per-merchant, `store_products` per-store pricing, `service_zones` per-area, `user_roles` multi-role
3. **Feature flags for verticals** — `enable_dark_store`, `enable_p1_verticals` (500/day gate pattern) — naye verticals bina deploy ke on/off
4. **Integer-paise + UTC everywhere** — financial modules (wallet/settlements/ads) ke liye safe foundation
5. **Idempotent + audited** — har money-touching path idempotent, `audit_logs` me trail
6. **Shared infrastructure first** — AI layer (Zaffy) ek hi grounded function se shuru; forecasting engines tab jab transaction data hoga

**Is tarah ZAFF-IT ek delivery app tak limited nahi rahega — future ZAFF ecosystem ka commerce aur logistics foundation banega.**

---

*Linked docs: `BACKEND_AND_API_CONNECTION_GUIDE.md` · `API_CONTRACTS.md` · `CATALOGUE_DATA_SOURCES.md` · `QA_AND_SECURITY_AUDIT.md` · `security/SECURITY_AUDIT_REPORT.md` · `research/` (10-repo clean-room library)*
