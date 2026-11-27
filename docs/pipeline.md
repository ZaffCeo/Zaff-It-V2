# Zaff-It Delivery Pipeline

## Flow (founder-controlled — 2026-11-27 se)

```
Agent changes → commit + push (arena branch)
        ↓   (kuch automatic NAHI — na deploy, na PR)
Founder clicks "Create PR"   ← github.com/ZaffCeo/Zaff-It-V2/compare/main...arena/565f9ef2-zaff-it-v2
        ↓
CI checks (tsc + deno) PR par chalte hain
        ↓
Founder review karke "Merge" click karta hai
        ↓
Vercel Git integration → production deploy → zaff-it.vercel.app LIVE (~80s)
```

## Rules

- **arena/* pushes par kuch nahi hota:** branch preview deploys disabled (`vercel.json` → `git.deploymentEnabled`), auto-PR/auto-merge workflow removed (`.github/workflows/auto-pr-merge.yml` deleted).
- **PR sirf founder ke "Create PR" click par banta hai** — agent kabhi khud PR nahi banata; har wave ke baad sirf commit+push + Create-PR link deta hai.
- **Deploy sirf merge ke baad** — founder ki explicit merge action par Vercel production deploy karta hai (yeh "jaise hi merge ho to deploy" rule ab bhi active hai).
- CI checks (TypeScript + deno) har PR par automatic chalte hain — merge se pehle green hona chahiye.

## Manual controls (re-enable karna ho to)

- **Auto-merge wapas:** `.github/workflows/auto-pr-merge.yml` git history se restore karo (pull_request opened event par merge karta tha).
- **Branch preview deploys wapas:** `vercel.json` se `"git"` block hatao.

## Vercel projects

- **zaff-it** (`prj_fW26BEitqRmgwlPYoB2qUD3gMGQw`) — ACTIVE production, Git: `ZaffCeo/Zaff-It-V2`, production branch `main`.
- **zaff-it-old** (`prj_vsV8oLwUmdPomDyBxPIHsCGtCU1P`) — legacy (purana `Zaff-It-V-0.01` link); history/reference ke liye rakha hai.
