# Repo 04 — Blinkit Clone Audit Report

**URL:** https://github.com/kathirr007/blinkit-clone · **Cloned:** `ZAFF-IT-RESEARCH/04-Blinkit-Clone`
**Last commit:** 2026-06-16 · **Size:** 210 files, ~6,200 LOC · **Status:** Maintained until mid-2026

## 1. Identity & Stack

- Turborepo monorepo: `apps/api` (Node), `apps/admin`, `apps/web`, `packages/shared`.
- Prisma ORM, ESLint (@antfu config), lint-staged + simple-git-hooks — good engineering hygiene.
- Node ≥ 20.

## 2. Licence — ❌ NO CODE REUSE

- **No LICENSE file.**
- README §License (line 285): **"Private project - not for redistribution."**
- This is an explicit all-rights-reserved statement. Copying any source = copyright infringement.
- **Allowed:** publicly observable architecture, schema *shape concepts*, API design ideas (ideas are not copyrightable; expression is).

## 3. Data Model (Prisma — 21 models — high quality reference)

`User, Otp, RefreshToken, Address, Category, Product, ProductImage, ProductVariant, Inventory, InventoryLog, Cart, CartItem, Order, OrderItem, OrderStatusHistory, Payment, DeliveryAssignment, Review, Notification, Banner, Deal`

**This is a canonical quick-commerce schema** and closely validates ZAFF-IT's own design:
- `Product` separate from `ProductVariant` (SKU/pack-size) — matches our canonical-product + store-listing split.
- `Inventory` + `InventoryLog` — movement audit trail (we have `inventory_movements`).
- `OrderStatusHistory` — state-machine audit (we have order events).
- `DeliveryAssignment` — rider-task entity (matches our `delivery_tasks`).
- `Banner` + `Deal` — promo/sponsored placements (matches our ads tables).

## 4. Architecture

- Clean separation: api/admin/web/shared packages; shared types via `packages/shared`.
- OTP auth (`Otp` + `RefreshToken`) — same pattern as NeuraCart and ZAFF-IT.

## 5. Security Observations

- Prisma-level constraints; hooks-based linting. Deeper webhook/signature checks not audited (not needed — reference only).

## 6. Limitations for Us

- Express/Prisma stack ≠ our Supabase stack; licence forbids reuse anyway.
- No rider app visible (delivery handled via `DeliveryAssignment` table only).

## 7. ZAFF-IT Extraction Plan

| Concept | Action |
|---|---|
| 21-model canonical schema **shape** | STUDY → cross-check our `001_initial_schema.sql` (we already cover ~90%) |
| `ProductVariant` vs `Product` separation | ADAPT concept — ensures our pack-size variants are correct |
| `InventoryLog` movement types | ADAPT concept — enrich our movement enum if missing |
| `Banner`/`Deal` sponsored placements | ADAPT concept — our ads tables cover; compare fields |
| Any source code | **REJECT — written permission required** |

## 8. Verdict: **REJECT code / REUSE concepts (Level 1 architecture study)** — explicit "not for redistribution"; schema-shape ideas are free knowledge and our schema already aligns.
