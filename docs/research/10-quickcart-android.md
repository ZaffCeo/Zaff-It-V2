# Repo 10 — QuickCart Android Audit Report

**URL:** https://github.com/AbhishekKumar9648/QuickCart-App · **Cloned:** `ZAFF-IT-RESEARCH/10-QuickCart-Android`
**Last commit:** 2026-08-20 · **Size:** 73 files, ~10,000 LOC Kotlin · **Status:** Maintained until mid-2026

## 1. Identity & Stack

- Native **Kotlin Android** app (Jetpack Compose-era structure under `com.example`).
- Clean MVVM-ish layering: `data/{datasource, local(AppDao/AppDatabase/Entities), model, repository}` + `ui/components` + MainActivity + `AppContainer.kt` (manual DI).
- `web/` folder present (minor companion).

## 2. Licence — ❌ NONE

- No LICENSE file, no README licence claim → default copyright → **no code reuse**.

## 3. Architecture Concepts Worth Studying

- **Repository pattern** per domain: `AddressRepository, AuthRepository, CartRepository, OrderRepository` — mirrors our service/store split (zustand + supabase services).
- **Room local DB** (AppDao/AppDatabase) — offline cache of catalogue/cart (same goal as QuickCrate; simpler than KMP).
- **Direct buy-now flow** (last commit: "implement direct buy now functionality") — bypass-cart express checkout pattern.
- UI components: `BillBreakdownCard`, `CartFloatingBar`, `CategoryChipItem` — interaction patterns comparable to our Cart/FloatingCart designs.

## 4. Bugs / Limitations

- `com.example` package + example instrumented test = template-derived project.
- Local-only data layer (no backend visible) — catalogue/checkout behaviour is mock-driven.

## 5. ZAFF-IT Extraction Plan

| Concept | Action |
|---|---|
| Repository-per-domain + offline Room cache | ADAPT concept → our zustand store is equivalent; consider AsyncStorage caching layer for catalogue |
| Direct "Buy Now" express checkout | ADAPT concept → ProductDetail express flow (Phase 2 polish) |
| Bill breakdown card / floating cart bar | ADAPT UI concept — compare with our CartCheckoutScreen totals block |
| Any source code | **REJECT — no licence** |

## 6. Verdict: **REBUILD (Level 2 study)** — unlicensed; take interaction + architecture patterns only. Our Expo implementation remains independent.
