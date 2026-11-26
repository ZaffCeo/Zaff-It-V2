# Repo 08 — QuickCart Stockout Risk Audit Report

**URL:** https://github.com/Harshil-Chauhan-DS/QuickCart-Stockout-Risk-Project · **Cloned:** `ZAFF-IT-RESEARCH/08-Stockout-Risk`
**Last commit:** 2026-08-24 · **Size:** 2 files · **Status:** Minimal upload repo

## 1. Identity & Contents

- `QuickCart_Harshil_Chauhan.ipynb` (63 KB) — single Jupyter notebook.
- `README.md` (3.3 KB).
- No source code, no dataset, no requirements file.

## 2. Licence — ❌ NONE

- No LICENSE file or claim. Default copyright. Notebook reading/learning = fine; redistribution/reuse = not permitted.

## 3. Methodology Study (Level 2 reading)

Notebook covers stockout-risk modelling in the shape founder described:
- Features: inventory levels, supplier lead time, **shelf-life**, calendar/seasonality factors.
- Target: probability of stockout per SKU per horizon.
- Typical pitfalls to verify while reading (founder's caution list): data leakage (using future sales as features), no time-based train/test split, no baseline comparison (naive "reorder point" rule).

## 4. ZAFF-IT Extraction Plan

| Concept | Action |
|---|---|
| Stockout-risk feature list (shelf-life, lead time, calendar) | ADAPT concept → Phase 6 `zaff-intelligence` feature spec |
| Leakage/time-split discipline | Our own acceptance criteria (offline evaluation gate per handoff doc §16 Phase 6) |
| Notebook/dataset | REJECT (no licence, no provenance) |

## 5. Verdict: **REBUILD (methodology reading only)** — 2-file repo; value = feature-idea list for our demand/stockout model. Production signal engine will be our own, with baseline-first validation.
