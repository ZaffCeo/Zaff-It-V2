# Repo 09 — QuickCommerce AI Audit Report

**URL:** https://github.com/Mayank786-12/QuickCommerce-AI · **Cloned:** `ZAFF-IT-RESEARCH/09-QuickCommerce-AI`
**Last commit:** 2026-11-19 · **Size:** 45 files, ~900 LOC · **Status:** Fresh (recent commit)

## 1. Identity & Stack

- **FastAPI** backend (`backend/app/`): `routes/{products,orders,analytics,assistant}.py`, `services/recommendation.py`, `schemas.py`, `seed_data.py`.
- SQLite (`quickcommerce.db` committed) + simple frontend (`src/`, ~900 LOC total — small demo).
- Licence: **MIT**, Copyright (c) 2026 Mayank — clean ✅.

## 2. Architecture & Concepts

- **Recommendation service** (`services/recommendation.py`) — co-purchase/popularity style suggestions exposed via products routes.
- **AI assistant route** (`routes/assistant.py` + `AssistantQuestion` Pydantic schema) — Q&A over catalogue, mirroring our Zaffy pattern.
- Pydantic request/response separation — clean contract discipline for a small repo.

## 3. Security Observations

- Committed SQLite DB = seed/demo data only (fine for reference, never for prod).
- Assistant appears un-grounded (no tool-calling to live stock/price) — exactly the guardrail handoff doc §9 warns about; Zaffy must stay tool-grounded (our Edge Function already is).

## 4. Bugs / Limitations

- No auth layer visible; no cost/rate limiting on assistant route.
- Recommendation logic scale limits (in-memory) — demo-grade.

## 5. ZAFF-IT Extraction Plan

| Concept | Action |
|---|---|
| Recommendation service interface shape | ADAPT concept → Zaffy "related products" endpoint spec |
| Assistant request/response contract | ADAPT concept → compare with our `zaffy-ai-assistant` payload |
| Demo grounding gap | LESSON: already handled — Zaffy is read-only + tool-grounded |
| Any source code | Optional (MIT allows) — but our Deno/Supabase stack makes direct reuse impractical; prefer REBUILD |

## 6. Verdict: **ADAPT (MIT) — concepts only in practice**; stack mismatch makes code reuse low-value, licence risk zero.
