# Repo 03 — Dark Store Audit Report

**URL:** https://github.com/Neel-Belsare/dark-store · **Cloned:** `ZAFF-IT-RESEARCH/03-Dark-Store`
**Last commit:** 2026-10-11 · **Size:** 123 files, ~20,000 LOC (mostly Python) · **Status:** Active-ish

## 1. Identity & Stack

| Layer | Technology |
|---|---|
| Dashboards | **Streamlit** + Plotly + pydeck + Folium (map analytics) |
| API | FastAPI + uvicorn + Pydantic v2 |
| DB | **Supabase** (Postgres + PostGIS) — same as ZAFF-IT! |
| ML | scikit-learn (routing/demand experiments in `notebooks/`) |
| Mobile | `mobile-app/` folder present |

"QuickZap ecosystem" branding — Aurangabad-focused quick-commerce pilot with 12 dark-store hubs.

## 2. Licence

- `LICENSE`: **MIT**, Copyright (c) 2026 Neel Belsare — clean, valid, attributable. ✅

## 3. Data Model (`supabase_schema.sql` — 8 tables)

`stores`, `dark_stores` (backward-compat twin), `riders`, `users`, `orders`, `order_items`, `store_inventory`, `admin_users`

- PostGIS optional-geo pattern; store seed via `INSERT ... ON CONFLICT` upserts — same technique our `004_seed_makrana.sql` uses.
- **Notable gap:** no `reserved/available` inventory split (single quantity column) → oversell risk under concurrency. ZAFF-IT's `003_atomic_rpcs.sql` is already stronger.

## 4. Architecture & Features

- Hub-network modelling (12 dark stores with lat/lng, catchment areas).
- Streamlit-based ops analytics (stock heatmaps, route folium maps) — cheap, effective internal-tool pattern.
- FastAPI service layer thin over Supabase.

## 5. Security Observations

- Project URL embedded in schema file (public anon reference).
- No RLS policies visible in schema dump — **auth was client-side or service-role only** (ZAFF-IT must keep RLS: we already do).

## 6. Bugs / Limitations

- `stores` vs `dark_stores` duplicate table (legacy compat) — data drift risk.
- No inventory reservation/atomicity; no order state machine beyond status column.
- Streamlit dashboards are single-user internal tools — not production consoles.

## 7. ZAFF-IT Extraction Plan

| Concept | Action |
|---|---|
| Dark-store hub catchment + PostGIS seed upserts | ADAPT concept (our seed already does this — validated) |
| `store_inventory` shape | REBUILD with reserved/available split (ours is superior) |
| Streamlit ops dashboards (stockout heatmap, rider map) | ADAPT idea for Phase 6 internal analytics console (free-tier friendly) |
| FastAPI thin-service style | N/A (we use Supabase Edge Functions) |

## 8. Verdict: **ADAPT (MIT)** — mining/concepts + Streamlit internal-analytics idea; do NOT copy inventory code (ours is architecturally stronger).
