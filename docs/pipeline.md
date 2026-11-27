# Zaff-It Delivery Pipeline

## Automatic flow (setup: 2026-11-27)

```
Agent/founder push → arena/* branch
        ↓
GitHub Action "Auto PR + Merge"
        ↓  (PR create + merge — pull_request event pe bhi)
main updated
        ↓
Vercel Git integration (project "zaff-it" ← ZaffCeo/Zaff-It-V2)
        ↓
Production build (~70-90s) → zaff-it.vercel.app LIVE
```

## Rules

- `arena/*` branch par har push ek PR kholega/merge karega (workflow: `.github/workflows/auto-pr-merge.yml`).
- `main` par sirf merged PR ka code aata hai — direct push nahi.
- Merge ke turant baad Vercel production deploy khud start hota hai; `zaff-it.vercel.app` alias khud update hota hai.
- Branch (preview) deploys: har arena push ka preview URL bhi milta hai (`zaff-it-git-<branch>-farzand-alis-projects.vercel.app`).

## Manual fallback

- PR create GITHUB_TOKEN se blocked ho to agent/founder manually PR kholta hai — workflow us PR ko `opened` event par khud merge kar deta hai.
- Repo setting (one-time, founder console): Settings → Actions → General → **"Allow GitHub Actions to create and approve pull requests"** — isse PR create bhi fully automatic ho jayega.

## Vercel projects

- **zaff-it** (`prj_fW26BEitqRmgwlPYoB2qUD3gMGQw`) — ACTIVE production, Git: `ZaffCeo/Zaff-It-V2`.
- **zaff-it-old** (`prj_vsV8oLwUmdPomDyBxPIHsCGtCU1P`) — legacy (purana `Zaff-It-V-0.01` link); history/reference ke liye rakha hai, delete optional.
