# Repo 02 — FreshIn10 Audit Report

**URL:** https://github.com/gk155586/FreshIn10 · **Cloned:** `ZAFF-IT-RESEARCH/02-FreshIn10`
**Last commit:** 2026-06-03 · **Size:** 2,533 files, ~19,800 LOC · **Status:** Stale (~6 months)

## 1. Identity & Stack

- Expo frontend split into `admin/`, `delivery/`, `web/` apps.
- Node backend at `backend/api`.
- ⚠️ Repo hygiene is poor: `node_modules - Copy`, `dist - Copy`, and dozens of `check_*.js / fix_*.ts / debug` scripts are **committed to git**.

## 2. Licence — ⚠️ AMBIGUOUS (treat as ALL-RIGHTS-RESERVED until resolved)

- **No LICENSE file** in the repo.
- README §License says **"MIT © FreshIn10"**.
- Per GitHub Docs: a licence *claim* in a README without a LICENSE file is **not a valid grant** — the copyright-holder intent is unclear (who is "FreshIn10"? no legal name).
- **Action:** before ANY code reuse, ask the owner for a proper LICENSE commit. Until then → behaviour/architecture study only.

## 3. Architecture

- Multi-app workspace: separate admin, delivery-partner and customer web frontends against one backend/api — mirrors ZAFF-IT's 4-surface model.
- Backend appears script-heavy (seed/fix scripts committed at top level) rather than migration-managed.

## 4. Data Model

No SQL/Prisma schema files found in scan — schema lives in code/runtime. No canonical schema to audit.

## 5. Security Observations

- `generate-token.js` and `fix_main_admin.ts` scripts committed — risk of hard-coded secrets in history (not audited in depth; repo is reference-only for us).
- No migration system → drift risk.

## 6. Bugs / Limitations

- Committed build artifacts (`dist - Copy`, `node_modules - Copy`) — bloats repo, signals no CI discipline.
- Debug scripts (`fix-roles.js`, `fix_main_admin.ts`) committed = data fixes done ad-hoc in production DBs.

## 7. ZAFF-IT Extraction Plan

| Concept | Action |
|---|---|
| Separate rider/admin/customer frontends | Already our design — validation only |
| Order management flow | Behavioural study (Level 2) — do NOT copy code (licence ambiguity) |
| Anti-patterns (script-fix culture, committed artifacts) | LESSON: ZAFF-IT enforces migrations + clean git |

## 8. Verdict: **REBUILD (Level 1/2 study only)** — licence claim unenforceable/ambiguous; repo hygiene weak. Extract order-lifecycle *behaviour* only; zero code reuse.
