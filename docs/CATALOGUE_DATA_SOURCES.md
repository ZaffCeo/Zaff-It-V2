# 🛒 ZAFF-IT — Product Catalogue Data Sources: Kaun sa kab use kare

> **Project context:** ZAFF-IT = hyperlocal quick-commerce (kirana merchant marketplace + delivery), Makrana pilot.
> **Budget:** ₹0 free-tier MVP stack — isliye har source ka "free kitna hai" verdict nichod me hai.
> **Verdict legend:** ✅ Use now · ⚠️ Later/phase-gated · ❌ Skip

---

## 1. Barcode / Product Lookup (Merchant Inventory ke liye) ✅

Merchant app me **Scan Barcode** feature hai — merchant apna product scan karta hai aur naam/brand/pack-size/image auto-fill hota hai. Ye teen sources app me **chain** bana ke use ho rahe hain (`apps/mobile/src/services/productLookup.ts`):

| Priority | Source | Kya milta hai | Free limit | Cost |
|---|---|---|---|---|
| 1️⃣ | **Open Food Facts India** (world.openfoodfacts.org) | Packaged food: naam, brand, quantity, image, ingredients, Nutri-Score | Unlimited (ODbL attribution) | ₹0 |
| 2️⃣ | **Open Products Facts** (world.openproductsfacts.org) | Non-food packaged items (home care, hardware, cosmetics) | Unlimited | ₹0 |
| 3️⃣ | **UPCitemdb Trial API** (api.upcitemdb.com) | Global UPC/EAN: title, brand, model, images, category | **100 req/day, 6/min, per-IP — NO API KEY** | ₹0 (paid: $99/mo) |

**App me kaise chalta hai:** scan → OFF (food) → OPF (non-food) → UPCitemdb (global fallback) → nahi mila to merchant manually entry karta hai. Price/MRP hamesha merchant hi set karta hai (DB me paise integers me).

**License note:** OFF/OPF data ODbL license me hai — attributions docs me rakha hai. UPCitemdb free tier me attribution required.

### ⚠️ GS1 India (DataKart) — abhi NAHI, baad me

- DataKart **sirf brand owners** ke liye free hai jo GS1 barcode subscription (₹40K+/year) lete hain — ye ek "publish" portal hai, public lookup API nahi.
- Retailer/app ke liye GS1 India ka "Verified by GS1" access paid hai.
- **Kab useful hoga:** Jab ZAFF-IT me bade brands ke SKUs aayenge (dark store phase), tab har merchant se uska GS1 product data sheet (excel) maang lo — 90% FMCG brands GS1 India me registered hain. App abhi OFF chain se kaam chalata hai.
- FSSAI/MRP verified data chahiye to future me GS1 India retail subscription evaluate karo (scaling ke baad).

---

## 2. ONDC — Phase 7 Expansion Channel ⚠️

ONDC ek **network** hai (Beckn protocol), app nahi. ZAFF-IT ke liye 2 raste:

| Path | Cost | Kab |
|---|---|---|
| **Path 1: SNP partner** (Mystore, SellerApp jaise Seller Network Participant ke through Makrana merchants ko ONDC pe becho) | ₹0–50K setup, 1–4 weeks | **Phase 7** — jab Makrana pilot stable ho. Merchants ki extra sales channel milega |
| **Path 2: Apna ONDC seller app banao** (Beckn protocol + TSP onboarding) | ₹5–25 lakh + TSP fees | Sirf tab jab scale proven ho |

- ONDC commission ₹0 hai, par network fee 1–3% + logistics apna absorb karna hota hai.
- **MVP verdict:** SKIP. Ye competition nahi, **additional distribution channel** hai — apna dispatch/pilot pehle prove karo (handoff doc ka expansion gate rule).
- Baad me useful hoga kyunki ZAFF-IT ka catalogue/price/inventory schema already Beckn-style separated hai (canonical products + store-specific listing).

---

## 3. Shopify Storefront API ❌ (abhi)

- Sirf tab kaam aata hai jab kisi D2C brand (boAt, Mamaearth) ke saath direct partnership ho aur unki Shopify store ka storefront token mile.
- Makrana kirana pilot ke liye irrelevant. Skip.

---

## 4. Scraping APIs — Amazon/Flipkart/Myntra/BigBasket ❌

| Source | Verdict | Kyun |
|---|---|---|
| **Webfusion Data** (India E-com scraping API) | ❌ Skip | (1) Platforms ki ToS ke against scraping — legal risk. (2) ZAFF-IT ka model hyperlocal hai: **merchant apna price set karta hai**, national e-com price comparison hamare product me fit nahi. (3) Paid monthly cost — budget me nahi. |
| **Anakin (IndiaMART B2B)** | ❌ Skip (abhi) | B2B wholesale sourcing = alag product. Future me "Merchant Supply / bulk procurement" feature banaya jaye (kirana owner apna stock yahan se khareede) tab revisit karo. |
| **Merchant Data** (D2C brand intelligence) | ❌ Skip | Brand research tool hai, pilot ke liye zaroorat nahi. |

---

## 5. Kaggle Indian E-Commerce Datasets ✅ (dev/testing ke liye)

- Flipkart/Amazon/Myntra ke lakhs of products CSV/JSON — **bilkul free**.
- **Use cases ZAFF-IT me:**
  1. **Dev fixtures** — local demo/qa environment me realistic catalogue seed data ( naam, category, price patterns) generate karne ke liye (production seed = `004_seed_makrana.sql` hi hai, real Makrana stores).
  2. **Phase 6 ZAFF Intelligence** — demand forecasting / stockout risk models practice karne ke liye historical data (handoff doc ke AI guardrails ke hisab se model sirf decision aid hai).
- **Integration:** koi API nahi — offline dataset download karke scripts/ me converter likho. Production DB me kabhi direct copy nahi karna (MRP/discounts stale hote hain).

---

## 🎯 Final Integration Plan (ZAFF-IT)

| Phase | Kya karna hai | Source |
|---|---|---|
| **Abhi (MVP)** | Barcode scan chain: OFF → OPF → UPCitemdb (✅ code me integrated) | 3 free APIs |
| **Phase 2-3** | Merchant catalogue bulk-import via CSV (merchant apni list upload kare) | Merchant data |
| **Phase 5** | GS1 data sheets se verified SKUs jab bade brands aayen | GS1 (offline sheets) |
| **Phase 6** | Kaggle datasets se forecasting models train/test | Kaggle (offline) |
| **Phase 7** | SNP partner ke through ONDC network — extra sales channel | ONDC (via SNP) |

**Code files:**
- `apps/mobile/src/services/openFoodFacts.ts` — OFF lookup (existing)
- `apps/mobile/src/services/productLookup.ts` — **multi-source chain** (naya)
- `apps/mobile/src/screens/merchant/MerchantInventoryScreen.tsx` — scan feature (uses chain)
