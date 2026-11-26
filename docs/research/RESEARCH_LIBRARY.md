# 📚 ZAFF-IT Repository Research Library — Master Audit Index

> **Principle (founder-approved):** In 10 repos ko jodkar software NAHI banana. Har repo se architecture, workflows, DB concepts aur algorithms **extract** karke ek unified ZAFF-IT platform banana hai. Jahan licence permission nahi, wahan sirf publicly observable behaviour/architecture ka independent analysis — reverse engineering licence bypass ka shortcut nahi.
>
> **Original repos untouched:** `~/ZAFF-IT-RESEARCH/01…10` (outside this repo). Production code me sirf licence-approved code ya independent implementation jaata hai.

## Audit Status — ✅ COMPLETE (10/10 cloned & verified on 2026-11-26)

| # | Repo | Licence (verified from source) | Stack | Size / Activity | Verdict |
|---|---|---|---|---|---|
| 1 | [NeuraCart](01-neuracart.md) | ✅ **MIT** (⚠️ Expo-template copyright line — attribute author) | Expo 57 + Node/Prisma, 18 modules, 31 models | 37k LOC · active | **ADAPT** |
| 2 | [FreshIn10](02-freshin10.md) | ⚠️ README claims "MIT" but **no LICENSE file** | Expo multi-app + Node | 19.8k LOC · stale | **REBUILD** (study only) |
| 3 | [Dark Store](03-dark-store.md) | ✅ **MIT** (c) 2026 Neel Belsare | Streamlit + FastAPI + Supabase/PostGIS | 20k LOC · active-ish | **ADAPT** |
| 4 | [Blinkit Clone](04-blinkit-clone.md) | ❌ README: **"Private project - not for redistribution"** | Turborepo + Prisma, 21 models | 6.2k LOC | **REJECT code / REUSE concepts** |
| 5 | [QuickCrate](05-quickcrate.md) | ❌ None; ROADMAP: "license decision pending" | Kotlin Multiplatform offline-first | 4.8k LOC | **REBUILD** |
| 6 | [QuickPICK](06-quickpick.md) | ❌ None | FastAPI + SQL, insecure defaults | 3.6k LOC · stale | **REJECT code / STUDY UI** |
| 7 | [Intelligence Suite](07-intelligence-suite.md) | ❌ None; dataset provenance unknown | PowerBI + Jupyter + CSVs | 16 files · stale | **REBUILD** (metrics reading) |
| 8 | [Stockout Risk](08-stockout-risk.md) | ❌ None (2 files) | 1 Jupyter notebook | — | **REBUILD** (methodology) |
| 9 | [QuickCommerce AI](09-quickcommerce-ai.md) | ✅ **MIT** (c) 2026 Mayank | FastAPI + SQLite recommender + assistant | 900 LOC · fresh | **ADAPT** (concepts) |
| 10 | [QuickCart Android](10-quickcart-android.md) | ❌ None | Kotlin Android, Room, repositories | 10k LOC | **REBUILD** (UI patterns) |

**Bottom line:** 3 repos MIT (NeuraCart, Dark Store, QuickCommerce-AI) → concept/schema extraction safe. 7 repos unlicensed/restricted → Level-1/2 study only. Zero code will be copied from unlicensed repos.

## Key Discoveries (source-verified, beyond founder's earlier notes)

1. **FreshIn10 ka README actually "MIT © FreshIn10" claim karta hai** — par LICENSE file absent. GitHub Docs ke mutabik README-claim alone valid grant nahi. Owner se proper LICENSE commit maango, tabhi ADAPT consider karo.
2. **NeuraCart ki LICENSE file Expo template ki hai** ("650 Industries, Inc.") — MIT rights still grant hote hain, par attribution `crastatelvin/neuracart` ko preserve karo.
3. **Blinkit Clone ka 21-model Prisma schema ZAFF-IT ke apne schema ko validate karta hai** — Product/Variant split, InventoryLog, OrderStatusHistory, DeliveryAssignment, Banner/Deal — hum sab already cover karte hain (yeh independent confirmation hai, copy nahi).
4. **Dark Store (MIT) ka Supabase stack hamare jaisa hi hai** — but uska inventory mein reserved/available split nahi hai; hamara atomic RPC design stronger hai. Streamlit internal-analytics idea Phase 6 ke liye note kiya.
5. **QuickPICK insecure patterns** (JWT default secret fallback, polling-as-realtime, ad-hoc fix SQL scripts committed) — documented as *negative lessons*; QA doc me already aligned.
6. **NeuraCart ke advanced models** — `ProofOfDelivery`, `RiderBatch`, `RiskFlag`, `WalletTransaction`, `Recipe/RecipeItem` — ZAFF-IT Phase 4/6 schema extensions ke liye spec ideas.

## Clean-Room Pipeline (ZAFF Repository Intelligence System)

```
Clone (done) → Agent 1: Repository Researcher (these reports)
            → Agent 2: System Architect (approve ZAFF spec deltas)
            → Agent 3: ZAFF Developer (independent implementation)
            → Agent 4: Licence & Security Auditor (provenance + checks)
```

Feature categories: **REUSE** (licence allows) · **ADAPT** (allowed, modified) · **REBUILD** (independent) · **REJECT** (legal/security/quality risk).

## Legal Position (India)

- Copyright Act 1957 §52(1)(ab)/(ac): lawful possession me software ko study/test karke ideas samajhna allowed — blanket commercial-clone permission NAHI.
- Ideas, schema *shapes*, workflows, metric definitions = free knowledge (not copyrightable). Source expression = copyrighted.
- Unlicensed repos (2,4,5,6,7,8,10): **koi code copy nahi** — sirf behaviour/architecture analysis.
- Commercial launch se pehle disputed cases par IP lawyer review — recommended gate (Phase 5 checklist me add karo).

## Repository Organization (actual, on disk)

```text
/home/user/ZAFF-IT-RESEARCH/          # OUTSIDE the git repo (untouched clones)
├── 01-NeuraCart/  …  10-QuickCart-Android/
/home/user/Zaff-It-V2/docs/research/  # IN repo — these audit reports
├── RESEARCH_LIBRARY.md (this file)
├── 01-neuracart.md … 10-quickcart-android.md
```

## Next Steps (Phase 0 → 1 gate)

- [x] Clone all 10 + licence verification (this audit)
- [x] Per-repo detailed reports (10 files)
- [ ] Owner permission request: FreshIn10 proper LICENSE (optional, low priority)
- [ ] Schema delta review: Blinkit/NeuraCart concepts vs our `001_initial_schema.sql` → approve any additions (POD/RiderBatch/RiskFlag/InventoryLog enums) as ZAFF's own design
- [ ] Freeze unified ZAFF-IT architecture → move to Phase 1 backlog
