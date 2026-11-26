# Repo 06 — QuickPICK Audit Report

**URL:** https://github.com/tharunramasamy/QuickPICK-App · **Cloned:** `ZAFF-IT-RESEARCH/06-QuickPICK`
**Last commit:** 2026-02-03 · **Size:** 66 files, ~3,600 LOC · **Status:** Stale (~10 months)

## 1. Identity & Stack

- Python **FastAPI** backend (`backend/`) + web frontend (`frontend/`).
- `schema.sql` (14 tables), `models.py`, `auth.py` (JWT HS256), `realtime_service.py` (polling-based "realtime").

## 2. Licence — ❌ NONE

- No LICENSE file; no licence claim found in README.
- Default copyright applies → **no code reuse**.

## 3. Data Model (schema.sql — 14 tables)

`cities, inventory_locations, product_categories, products, inventory_stock, users, user_profiles, customers, delivery_partners, orders, order_items, payment_transactions, delivery_tracking, user_activity_logs`

- Role separation (users/user_profiles/customers/delivery_partners) mirrors our profiles+roles design.
- `user_activity_logs` — audit-logging idea (we cover via audit tables).

## 4. Security Observations — ⚠️ DO NOT COPY PATTERNS

- `auth.py`: JWT HS256 with **default secret fallback** `"your-secret-key-change-in-production"` — classic secret-in-code anti-pattern.
- 24-hour token expiry with no refresh rotation.
- `fix_passwords.sql`, `fix_db_constraint.py`, `force_drop_constraint.py` committed — production fixes done as ad-hoc scripts (no migrations).
- "Realtime" implemented via polling (founder's earlier review already flagged this).

## 5. Bugs / Limitations

- Debug scripts (`debug_*.py`, `diagnosis_*.txt`) committed at repo root.
- No RLS/row-level ownership model; authorization via role string in JWT only.

## 6. ZAFF-IT Extraction Plan

| Concept | Action |
|---|---|
| Role-based dashboard UX shapes (status timelines) | Level-2 UI behaviour study only |
| `delivery_tracking` event table | ADAPT concept (our order events + rider tasks cover) |
| JWT-default-secret anti-pattern | LESSON: documented in our QA doc — Supabase Auth avoids this entirely |
| Polling-as-realtime | LESSON: we use Supabase Realtime (WebSocket) — keep |
| Any source code | **REJECT — no licence** |

## 7. Verdict: **REJECT code / STUDY UI concepts (Level 2)** — no licence + insecure defaults; value is negative-lesson documentation + dashboard interaction patterns.
