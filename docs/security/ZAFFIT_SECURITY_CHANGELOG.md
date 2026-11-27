# ZAFF-IT — Security Changelog (this mission)

## Modified
- `apps/mobile/src/services/firebaseAuth.ts` — removed hardcoded Firebase API-key literal (S-03).
- `apps/mobile/src/screens/customer/RazorpayCheckoutScreen.tsx` — originWhitelist → Razorpay domains only (S-04).
- `supabase/functions/catalog-enrich/index.ts` — token auth moved from URL query to `x-enrich-token` header (S-05).

## New
- `infrastructure/database/021_security_hardening_2.sql` — S-01 revokes + guarded/idempotent settle function; S-02 bucket limits (applied live, non-destructive).
- `docs/security/ZAFFIT_COMPLETE_SECURITY_AUDIT_REPORT.md` (Report A)
- `docs/security/ZAFFIT_REMEDIATION_ROADMAP.md` (Report B)
- `docs/security/ZAFFIT_ATTACK_SURFACE_MAP.md` (Report C)
- `docs/security/ZAFFIT_REMEDIATION_REPORT.md` (Report D)
- `docs/security/ZAFFIT_FINAL_SECURITY_STATUS.md` (Report E)
- `docs/security/ZAFFIT_SECURITY_CHANGELOG.md` (this file)

## Database changes (live, non-destructive)
- REVOKE EXECUTE (public, anon) on `settle_delivered_order_inventory(uuid)` + `trg_settle_on_delivered()`.
- CREATE OR REPLACE `settle_delivered_order_inventory(uuid)` with `status='delivered'` + movements-idempotency guards (same signature; rider-trigger path preserved).
- `storage.buckets['product-images']`: `file_size_limit=5242880`, `allowed_mime_types=[image/jpeg,image/png,image/webp]`.

## Deleted
- (none)

## Configuration changes
- None beyond DB/storage items above (function env/secrets unchanged this phase).

## Dependencies added/removed
- None this phase (react-native-webview was added in the prior audit-fix commit).

## Key architectural decisions
- Fix S-01 as additive SQL guards + revokes (no business logic rewritten, trigger contract preserved).
- Keep storage bucket public-read (product images are public by design); constrain the WRITE side.
- Header-only token auth for internal enrich function (no external consumers).
- Evidence preserved: before/after anon repro documented in Report D; false-positive rationale in Report A to prevent future "fixes" that would break legit flows.
