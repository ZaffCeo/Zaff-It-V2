# Repo 05 — QuickCrate Audit Report

**URL:** https://github.com/arpitagarwal1301/quickcrate · **Cloned:** `ZAFF-IT-RESEARCH/05-QuickCrate`
**Last commit:** 2026-07-24 · **Size:** 234 files, ~4,800 LOC Kotlin · **Status:** Maintained until mid-2026

## 1. Identity & Stack

- **Kotlin Multiplatform** project: `androidApp/` + `shared/` (Compose-based UI, Room/SQLDelight-style local persistence via `shared/src`, gradle KTS).
- Offline-first Android shopping app: local catalogue/cart persistence, checkout recovery.
- `docs/` includes a reusable mobile project kickoff template.

## 2. Licence — ❌ NONE (explicitly pending)

- No root LICENSE file.
- `ROADMAP.md` line 105: *"Choose and add a root software license. The font OFL notices do not license the application code."*
- → Author has NOT granted any rights. Default copyright applies. Code reuse = infringement.
- (Also matches founder's earlier finding.)

## 3. Architecture & Concepts Worth Studying

- **Offline-first cart**: cart mutations write to local DB immediately, network sync retries later — recovery path if checkout fails mid-payment.
- **Sync conflict handling**: local-first entities with server reconciliation (study the sync resolver shapes).
- KMP shared module = one business-logic layer for Android/iOS (overkill for ZAFF-IT MVP but interesting later).

## 4. Security Observations

- Local storage security not audited (no licence anyway — reference only).
- Payment recovery flows: study how in-flight payment state is persisted (idempotency at client).

## 5. Bugs / Limitations

- iOS target completeness unclear; KMP adds toolchain complexity.
- Licence pending → author may pick a non-commercial licence.

## 6. ZAFF-IT Extraction Plan

| Concept | Action |
|---|---|
| Offline-first cart + checkout recovery | REBUILD as concept in our Expo app (AsyncStorage already used; add cart-recovery edge case tests) |
| Payment-retry persistence | ADAPT concept → our `checkout-create-order` idempotency key + client draft-order cache |
| KMP approach | REJECT for MVP (Expo covers Android+iOS) |
| Any source code | **REJECT — no licence** |

## 7. Verdict: **REBUILD (Level 2 behavioural study)** — no licence granted; extract offline-recovery *behaviour* spec only, implement natively in Expo.
