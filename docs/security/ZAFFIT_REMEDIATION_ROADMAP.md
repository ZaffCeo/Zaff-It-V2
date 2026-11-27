# ZAFF-IT — Remediation Roadmap (Phase 1 output)

Priority order: P0 security → P1 launch integrity → P2 hardening → P3 info.

| ID | Severity | Priority | Component | Root cause | Solution | Plan | Acceptance criteria | Tests | Blockers |
|---|---|---|---|---|---|---|---|---|---|
| S-01 | HIGH | P0 | `settle_delivered_order_inventory` (live DB; origin 011) | SECURITY DEFINER + PUBLIC/anon EXECUTE + no status/idempotency guard | Revoke anon/PUBLIC; add `status='delivered'` + movements-idempotency guards | Migration `021` (OR REPLACE, additive) | anon call → permission denied; authenticated → business-guard errors; rider-trigger path intact | Live `set role anon` repro before/after | none |
| S-02 | MEDIUM | P0 | storage `product-images` | No size/MIME limits on public bucket | 5 MB limit + image MIME allowlist | Bucket UPDATE (non-destructive) | Bucket meta shows limits | Live bucket inspect | none |
| S-03 | LOW | P1 | `firebaseAuth.ts` | API key literal fallback | Env-only (empty default) | 1-line change | grep finds no literal | tsc + grep | Firebase release env for prod value |
| S-04 | LOW | P1 | `RazorpayCheckoutScreen` | `originWhitelist:['*']` | Razorpay-domain allowlist | 1-line change | WebView only loads razorpay origins | tsc; device test pending | device E2E |
| S-05 | LOW | P1 | `catalog-enrich` | Token in URL query | Header-only auth + doc update | Code change | `?token=` no longer accepted | deno check; manual curl with header | none (internal fn) |
| A-01 | — | P1 | Android payments | No native checkout (web-only) | WebView checkout screen (shipped prior turn) | — | Device E2E success/failed/dismissed flows | **NOT VERIFIED** | dev-client/APK build |
| A-02 | — | P1 | SMS OTP | Twilio creds null | Founder registers/configures SMS provider | dashboard config | Real OTP delivered | NOT VERIFIED | external creds |
| A-03 | — | P1 | Razorpay webhook | Webhook not yet registered | Founder registers `…/functions/v1/razorpay-webhook` in dashboard | — | Live payment flips payments.status | NOT VERIFIED | external dashboard |
| A-04 | — | P2 | R2×5 secrets | Missing → Parchi photo upload blocked | Founder adds R2 secrets | — | Upload E2E | NOT VERIFIED | external creds |
| H-01 | INFO | P2 | Auth config | captcha disabled | Enable captcha at launch if bot signups observed | dashboard | — | — | founder decision |
| H-02 | INFO | P2 | app.json | `allowBackup` unset | Set `android.allowBackup: false` at release build time | config change | manifest reflects | build-time | next EAS build |
| H-03 | INFO | P2 | qa-auth-bridge | QA bootstrap fn public (token-gated) | Disable/rotate QA token before public launch | secret removal | fn 401s | live check | founder launch plan |
| H-04 | INFO | P3 | Git history | Old ingest token remains in history (inert) | Optional history purge | founder-owned force-push | — | — | founder decision |

Dependency note: S-01/S-02 fixes were applied live (non-destructive, additive) in Phase 2 with owner-visible SQL in `021_security_hardening_2.sql`; no production data touched.
