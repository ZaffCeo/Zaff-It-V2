# ZAFF-IT — Complete Security Audit Report (Phase 1)

Date: 2026-11-27 · Scope: full repository @ `arena/565f9ef2-zaff-it-v2` (tip `59c75eb`-era tree) + live Supabase project `mglypwlmwzktxnvlomke` (RLS/functions/storage/auth-config inspected via service access) + local red-team harness.

Method: repository recon → attack-surface enumeration → live privilege tests (`set role anon/authenticated` with simulated JWT claims, rolled back) → code-level payment/AI/logic analysis → local integration harness for the Zaffy edge function (16 cases) → false-positive elimination.

Status legend: **CONFIRMED** (reproduced/evidence) · **FALSE POSITIVE** (investigated, safe) · **NOT VERIFIED** (needs device/staging).

---

## 1. Executive summary

The platform's core financial path is **structurally sound**: server-authoritative pricing (`create_checkout_order` RPC, integer paise), atomic inventory reservation, UUID idempotency on orders, timing-safe Razorpay webhook HMAC with amount+currency match, RLS enabled on **100% of public tables** (verified live: zero exceptions), and no service-role key or secret material in the mobile bundle.

Two-phase audit found **1 HIGH exploitable logic flaw (S-01)**, **1 MEDIUM abuse vector (S-02)**, **3 LOW hardening items (S-03/04/05)**, plus prior-turn fixes already shipped (leaked ingest token rotation, stale deploy script, Android payment gap). All confirmed, safely-fixable findings were remediated in Phase 2 (see ZAFFIT_REMEDIATION_REPORT.md) and independently re-verified.

## 2. Architecture map (sensitive operations)

Mobile (Expo/RN 0.86) → Supabase Auth (phone OTP, SecureStore sessions, 1h JWT) → Edge Functions (verify_jwt or explicit token checks) → Postgres RLS / SECURITY DEFINER RPCs → Razorpay (test mode; webhook-signed lifecycle) → pg_cron/pg_net workers (token via locked ops table). Zaffy AI orchestrator (v14) sits behind verified JWT, executes allowlisted tools via user-scoped + service-role clients, proposals require UI confirmation. Full entry-point inventory: see ZAFFIT_ATTACK_SURFACE_MAP.md.

## 3. Findings

### S-01 · HIGH · CONFIRMED (reproduced live) — anonymous inventory-corruption via settle_delivered_order_inventory
- CWE-284/CWE-841; CVSS ≈ 8.2 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H)
- Evidence: function is SECURITY DEFINER, `proacl` granted EXECUTE to PUBLIC+anon, body had no auth/status/idempotency guard.
- Live PoC: `set role anon; select settle_delivered_order_inventory('<uuid>')` → returned `{"units_settled":0}` **successfully** (with a real order id it deducts stock).
- Double-deduct: repeated call hits the `ELSE` branch (`on_hand_qty = GREATEST(0, on_hand - qty)`) → deducts again → merchant stock corrupted; also forges `inventory_movements('order delivered')` rows.
- Impact: anonymous stock sabotage / premature settlement; audit-log pollution.
- Files: `infrastructure/database/011_delivery_assign_and_engines.sql` (origin), live DB.

### S-02 · MEDIUM · CONFIRMED (policy inspection) — storage upload abuse
- `product-images` (public bucket) had `file_size_limit=NULL`, `allowed_mime_types=NULL`; INSERT policy allows any **authenticated** user to upload any file type/size to the public bucket → free-hosting/malware-redirect abuse.
- Files: storage bucket config (live), policy `product_images_auth_upload`.

### S-03 · LOW · CONFIRMED — hardcoded Firebase web API key fallback
- `apps/mobile/src/services/firebaseAuth.ts:25` committed a live-looking `AIzaSy…` literal as fallback. Firebase web keys are public identifiers by design (risk realized only if HTTP-referrer restrictions are absent), but literals in source are bad practice and can't be rotated without a release.
- Also INFO: `rzp_test_…` Razorpay key id default (public identifier, documented).

### S-04 · LOW · CONFIRMED — Razorpay WebView overly permissive navigation
- `RazorpayCheckoutScreen` used `originWhitelist={['*']}` — any navigation target (except handled intent://) would load inside the payment WebView. Mitigated by fixed source HTML + server-side confirmation, but defense-in-depth demands a Razorpay-domain allowlist.

### S-05 · LOW · CONFIRMED — secret in URL query string
- `catalog-enrich` accepted `?token=<ENRICH_TOKEN>`; query strings persist in proxy/CDN logs → credential leakage risk.

### Prior-turn findings (already remediated, re-confirmed in this audit)
- Leaked catalog-ingest cron token in migration 012 → ROTATED 2026-11-27 (secret + locked ops table + cron SQL lookup; old token inert). CONFIRMED FIXED.
- Stale `functions:deploy` (3 wrong slugs) → fixed to the 10 real slugs. CONFIRMED FIXED.
- Android Razorpay gap (web-only checkout) → WebView checkout screen shipped; **device E2E NOT VERIFIED** (needs dev-client/APK).
- Migration workflow inconsistency → `docs/database-migrations.md` canonical guide shipped.

### FALSE POSITIVES (verified safe — do not "fix")
| Item | Why safe (evidence) |
|---|---|
| `get_my_delivery_otp` anon grant | Internal `auth.uid()` + order-ownership guard (function def) |
| `merchant_khata_summary` anon grant | Binds to `auth.uid()` merchant; returns `bound:false` otherwise |
| `approve_catalog_product` PUBLIC grant | `if not is_admin() then raise` guard |
| `assign_zaff_product_id` anon grant | BEFORE-trigger only; not RPC-meaningful |
| `search_products`/catalog anon reads | Public catalogue by design; RLS-scoped writes elsewhere |
| Razorpay webhook | timingSafeEqual HMAC + amount/currency match (code lines 19–115) |
| `order-lifecycle` verify_jwt=false | Own `auth.getUser()` + role verification + rider-ownership checks |
| Mobile secrets | No SERVICE_ROLE/sk_live/AKIA in client; only .example files committed; 0 console.log |
| OTP brute force | 6-digit, 60s expiry, verify rate-limit 30/hr + 5-try DB lock on delivery OTP |
| qa-auth-bridge exposure | Secret-token gated + phone ALLOWLIST (3 QA numbers); pre-launch disable recommended (INFO) |

### NOT VERIFIED (requires device/staging/credentials)
- Android device E2E payment (WebView checkout) — logic tsc-clean; needs APK.
- Live Zaffy tool-loop against real Gemini (sandbox egress blocked); 16-case local harness passed.
- Load/performance under real traffic; concurrent-checkout stress (RPC uses FOR UPDATE row locks — design verified, load NOT run).
- Live SMS OTP delivery (Twilio creds null — phone OTP delivery is a launch blocker until configured).

### INFO
- `security_captcha_enabled:false` (bot-signup hardening option for launch).
- `android.allowBackup` unset (default; SecureStore items are Keystore-backed and excluded) — explicit `false` recommended.
- Supabase `audit_log_disable_postgres:true` (platform default; app-level audit_logs + zaffy audit tables compensate).
- Zaffy v14 residual limits documented in `docs/zaffy-platform.md` §9 (no streaming, deterministic memory extraction, deny-by-default rider tools).

## 4. Business-logic review (payments/marketplace)
- Client amount tampering: ineffective — checkout RPC recomputes from store_products; coupon via `validate_coupon` with per-user caps; delivery fees zone-derived server-side. **No exploit found.**
- Zero/negative price/qty: DB CHECKs (`qty > 0`, prices ≥ 0, selling ≤ MRP in app paths) + zod caps. **No exploit found.**
- Coupon/reward farming: per_user limits + coins ledger service-role-only (`award/redeem_coins` ACL). **No exploit found.**
- COD + delivered-OTP: 5-try lock; OTP retrieval ownership-guarded. **No exploit found.**

## 5. Test results (executed)
- Live SQL privilege tests: anon/authenticated/merchant isolation incl. zaffy_* RLS suite (earlier this session) and S-01 repro.
- Zaffy local harness: 16/16 (auth, validation, rate-limit, anon gate, honest provider failure).
- Static: `tsc --noEmit` EXIT=0; `deno check` on all touched functions EXIT=0.

## 6. Overall assessment
**Solid core with one high-severity logic flaw (now fixed).** Financial integrity controls are above-average for this stack. Launch readiness gated by external items (Razorpay webhook registration, SMS/Twilio creds, R2×5 for uploads, device E2E payments).
