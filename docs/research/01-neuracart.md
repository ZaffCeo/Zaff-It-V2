# Repo 01 — NeuraCart Audit Report

**URL:** https://github.com/crastatelvin/neuracart · **Cloned:** `ZAFF-IT-RESEARCH/01-NeuraCart`
**Last commit:** 2026-11-24 · **Size:** 369 files, ~37,000 LOC · **Status:** Actively developed

## 1. Identity & Stack

| Layer | Technology |
|---|---|
| Mobile app (customer) | Expo SDK 57 + expo-router + NativeWind (Tailwind), React 19 |
| Secondary apps | `admin/` (Expo), `delivery/` (Expo rider app) |
| Backend | Node.js + TypeScript (`backend/src/modules/*`), Prisma ORM |
| Infra | docker-compose present; uploads dir for media |

## 2. Licence

- `LICENSE` file present: **MIT**.
- ⚠️ Copyright line reads *"650 Industries, Inc. (aka Expo)"* — this is the **default Expo template licence file**, not a custom one. MIT grants use/modification/commercial rights regardless, but:
  - Preserve the notice verbatim if any code is reused.
  - The template artifact suggests the author didn't customize it; treat as MIT with attribution `crastatelvin/neuracart`.

## 3. Architecture

- **18 backend modules**: `auth, addresses, products, orders, payments, delivery, logistics, admin, deals, notifications, realtime, recs (recommendations), reviews, risk, scheduling, store, money, ai` — Zod validation via `*.schemas.ts` per module.
- Modular monolith — exactly the architecture ZAFF-IT's handoff doc mandates.

## 4. Data Model (31 Prisma models)

Core: `User, OtpCode, RefreshToken, Address, Product, Store, Order, OrderItem, OrderStatusHistory, OrderTracking, DeliveryPartner`
Advanced/interesting: `Wallet + WalletTransaction, LoyaltyAccount, ReferralCode, ProductReview, Recipe + RecipeItem, HelpArticle, ChatSession + ChatMessage, DeliverySlot, Subscription, FlashDeal, RiderBatch, ProofOfDelivery, RiskFlag, PushToken, AIJobLog`

**Directly relevant to ZAFF-IT:** `OtpCode`+`RefreshToken` (phone OTP auth), `RiderBatch` (batch dispatch), `ProofOfDelivery` (OTP/POD), `RiskFlag` (fraud/ops flags), `OrderStatusHistory` + `OrderTracking` (state machine audit), `DeliverySlot`.

## 5. Security Observations

- OTP + refresh-token separation (good pattern to mirror).
- Server-side Zod schemas for every module (client never trusted — matches ZAFF rule).
- Not yet audited: rate limiting, idempotency on checkout, payment webhook verification.

## 6. Bugs / Limitations Found

- Prisma migrations show repeated schema re-alignment (`fix_order_number_address_typo_redundant_indexes`, `align_localmart_schema`) — schema churned during dev.
- No test coverage visible at root; uploads stored on local disk (not object storage).
- AI module (`ai/`, `AIJobLog`) present — review needed before trusting cost controls.

## 7. ZAFF-IT Extraction Plan

| Concept | Action |
|---|---|
| OTP auth + refresh tokens shape | REBUILD independently (we already have via Supabase Auth) |
| `ProofOfDelivery`, `RiderBatch`, `RiskFlag`, `OrderStatusHistory` | ADAPT concept → extend our PostgreSQL schema |
| Module-per-domain layout | ADAPT — validates our Edge Function domain split |
| Recipe shopping (Recipe/RecipeItem) | Future Zaffy "Recipe Shopping" feature spec reference |
| Wallet/loyalty/referral | Phase 6+ — NOT MVP (handoff doc §17) |

## 8. Verdict: **ADAPT (MIT)** — closest living reference to ZAFF-IT; copy *concepts & schema shapes*, not code (our stack is Supabase/Expo different backend).
