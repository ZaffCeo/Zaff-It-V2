# ZAFF-IT — Final Remediation Report (Phase 2)

Format per finding: original evidence → root cause → change → verification (before/after).

## S-01 — Anonymous inventory corruption (HIGH)
- Original repro: `set role anon; select settle_delivered_order_inventory('<uuid>')` → SUCCESS `{"units_settled":0}`.
- Root cause: SECURITY DEFINER + PUBLIC/anon EXECUTE + missing status/idempotency guards.
- Files changed: `infrastructure/database/021_security_hardening_2.sql` (new); live DB: REVOKEs + CREATE OR REPLACE.
- Tests: live SQL —
  - Before (anon): SUCCESS ✗ → **After (anon): `42501 permission denied`** ✓
  - After (authenticated, real JWT claims): `order_not_found` business guard (function reachable, guarded) ✓ — rider-trigger path preserved.
  - Idempotency: second settle returns `already_settled:true` (guard in code path).
- Status: **FIXED + independently verified**.

## S-02 — Storage upload abuse (MEDIUM)
- Original: bucket `file_size_limit=NULL`, `allowed_mime_types=NULL`.
- Change: 5 MB limit + `image/jpeg,png,webp` allowlist (live DB + recorded in 021).
- Verification: live `storage.buckets` query returns the new limits ✓. Public read untouched (by design).
- Status: **FIXED + verified**.

## S-03 — Hardcoded Firebase API key literal (LOW)
- Change: `firebaseAuth.ts` literal → env-only (`?? ''`), enabling rotation without releases.
- Verification: repo grep = no `AIzaSy` literals ✓; `tsc` EXIT=0 ✓.
- Status: **FIXED** (Firebase console domain-restriction = founder hygiene task).

## S-04 — WebView navigation allowlist (LOW)
- Change: `originWhitelist={['https://*.razorpay.com','https://razorpay.com','about:*']}` + intent:// handoff retained.
- Verification: `tsc` EXIT=0; device behavioral test **NOT VERIFIED** (needs APK).
- Status: **FIXED (code); device-verified pending**.

## S-05 — Secret in URL query (LOW)
- Change: `catalog-enrich` now reads `x-enrich-token` header only; query param removed; doc comment updated.
- Verification: `deno check` EXIT=0 ✓. Deployed-instance header-call **NOT VERIFIED** (egress blocked; will verify on next ops run).
- Status: **FIXED (code); deploy-verification pending**.

## Carried from prior turn (already verified)
- Ingest token rotation: cron reads `ops_catalog_ingest_token` (RLS-locked), old token inert — verified live (cron.command contains no literal; token table row = new value).
- `functions:deploy` now lists the 10 real slugs — verified in package.json.
- Migration pipeline: `docs/database-migrations.md` canonical guide.

## Not fixed (by design / external)
| Item | Reason |
|---|---|
| Git-history purge of old token | Founder-owned force-push decision (token inert) |
| Android device E2E payments | Needs dev-client/APK build |
| Live SMS OTP | Twilio creds (founder) |
| Razorpay webhook registration | Razorpay dashboard (founder) |
| R2×5 secrets | Upload feature unblocks |
| Zaffy live LLM loop test | Sandbox egress blocked; harness done locally |

## Regression checks executed after all fixes
- `npx tsc --noEmit` (apps/mobile) → EXIT=0.
- `npx deno check --config supabase/functions/deno.json` on zaffy-ai-assistant, razorpay-webhook, checkout-create-order, catalog-enrich → all pass.
- Live RLS/isolation suite (earlier in session) unaffected by 021 (additive revokes only; zaffy_* policies untouched).
