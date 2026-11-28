# Zaff-It Web — Cloudflare Workers Deploy Runbook

**Live URL:** `https://zaff-it-v2.ripplebitceo.workers.dev` (worker name `zaff-it-v2`)
**Repo:** `ZaffCeo/Zaff-It-V2` · Production branch: `main` (auto-deploy on push)
**Setup date:** 2026-11-28

## Build & Deploy configuration (Cloudflare dashboard → Worker → Settings → Build & Deploy)

| Field | Value |
|---|---|
| Deploy command | `cd apps/mobile && CI=1 npx expo export --platform web --output-dir dist && cd ../.. && npx wrangler deploy` |
| Build command | *(empty — deploy command handles build too)* |
| Install command | default (`npm clean-install`) |
| Node | 22 (auto-detected) |

> Why deploy-command-does-build: Workers Builds runs `npx wrangler deploy` as the deploy
> step; the Expo export must produce `apps/mobile/dist` BEFORE wrangler packages assets
> (`wrangler.jsonc` → `assets.directory: ./apps/mobile/dist`).

## Environment variables (Build → Variables and Secrets)

| Key | Type | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Text | `https://mglypwlmwzktxnvlomke.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **Secret** | Full 3-segment JWT (~208 chars). MUST be in the **Build** variables list (not runtime bindings) — `EXPO_PUBLIC_*` is inlined by Metro at bundle time. **Gotcha (2026-11-28):** a paste-truncated key (no signature segment) shipped once → all Supabase calls 401. Verify length ends with a long signature. Masked as `••••` in logs — that is normal. |
| `NODE_VERSION` | Text | `22` |

## Serving architecture
- `wrangler.jsonc`: explicit `main: worker/index.ts` + `assets.binding: ASSETS`
  + `not_found_handling: single-page-application` (SPA deep-link fallback — do NOT
  also add a `_redirects` file; Pages-style `_redirects` triggers an infinite-loop
  validation error in Workers assets mode).
- `worker/index.ts`: `env.ASSETS.fetch(request)` passthrough; returns real error text
  on failure instead of an opaque 500.

## Verified-good signals (from build log)
- `Web Bundled ... (1313 modules)` → `Exported: dist`
- `Read 61 files from the assets directory ...`
- `Uploaded zaff-it-v2` + `Deployed zaff-it-v2 triggers` + workers.dev URL printed
- `✨ Success! Build completed.`

## Lessons learned (do not re-fight these)
1. Workers (not Pages) flow → wrangler config REQUIRED at repo root (workspace-root
   detection error otherwise).
2. `_redirects` + `not_found_handling` together = deploy-time API error (100324).
3. Worker name in `wrangler.jsonc` must equal the Cloudflare worker name (`zaff-it-v2`).
4. `EXPO_PUBLIC_*` values are frozen into the JS bundle at build time — changing the
   dashboard value requires a REBUILD, not a redeploy of the same bundle.
5. Sandbox/agent fetchers may 500 on workers.dev while browsers work fine — verify
   with a real browser (incognito + hard refresh) before debugging serving.
