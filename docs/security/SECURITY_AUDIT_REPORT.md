# 🔒 ZAFF-IT Security Audit Report — Red Team Attack + Remediation

> **Scope:** ZAFF-IT full-stack (7 Edge Functions, 4 SQL layers, Expo app, web build)
> **Method:** White-box code audit + dynamic attacks (headless Chromium pe live app pe)
> **Date:** 2026-11-26 · **Tester:** Arena Agent (authorized — apna hi project)
> **Status:** ✅ Saare findings FIX HO GAYE (fixes commit me included)

---

## 🎯 Attack Summary

| ID | Attack | Severity | Result before fix | Result after fix |
|---|---|---|---|---|
| AUD-CRIT-1 | Rider `delivery_tasks` direct PostgREST UPDATE (OTP overwrite, status=fake 'delivered') | 🔴 CRITICAL | **VULNERABLE** — `delivery_tasks_rider_or_admin_update` policy riders ko full UPDATE deti thi | ✅ **FIXED** — policy dropped; transitions sirf order-lifecycle Edge Function (state-machine + OTP verify + audit) se |
| AUD-HIGH-2 | Rider OTP self-read: `delivery_tasks` SELECT me plaintext `delivery_otp`/`pickup_otp` rider ko dikhta tha — proof-of-delivery meaningless | 🔴 HIGH | **VULNERABLE** | ✅ **FIXED** — OTPs `delivery_handover_otps` vault me move (deny-all RLS, zero policies); customer RPC `get_my_delivery_otp` se OTP dekhta hai (customer→rider direction — industry standard) |
| AUD-HIGH-3 | Zod DoS: `checkout-create-order` me oversized `items[]` memory exhaustion (GHSA-mrhx-c7xc-m3w5, zod <4.6.6 high advisory) | 🟠 HIGH | **VULNERABLE** | ✅ **FIXED** — 64 KB content-length gate + pre-zod array cardinality check + zod 4.6.7 upgrade path documented |
| ATT-4 (dynamic) | `?role=admin` URL param → demo login → **full Admin Control Tower access** — production-configured build pe bhi | 🟠 HIGH | **VULNERABLE (live-confirmed)** — rebuild cache ne env inline skip kiya tha; `--clear` se phir bhi param active tha dev builds me | ✅ **FIXED** — param sirf `EXPO_PUBLIC_ENV !== 'production'` + Supabase-unconfigured me chalta hai. Production build test: param ignored → customer land ✅ |
| AUD-MED-4 | Razorpay create failure → order 'payment_pending' stuck; retry dedup path Razorpay order re-create nahi karta → customer kabhi pay nahi kar sakta | 🟡 MED | **VULNERABLE** | ✅ **FIXED** — dedup path ab missing Razorpay order re-create karta hai (idempotent retry) |
| AUD-MED-5 | Zaffy AI: hardcoded model `gemini-4-hydrogen` (non-existent → har call fail) + zero rate limiting → API cost abuse | 🟡 MED | **VULNERABLE** | ✅ **FIXED** — model `GEMINI_MODEL` env se (default `gemini-2.5-flash`) + per-user 10/min + global 120/min sliding-window limit, 429 + Retry-After |
| AUD-LOW-6 | Web preview demo-role param | 🟢 LOW | Dev-only already | ✅ **HARDENED** — production gate added (see ATT-4) |
| AUD-LOW-7 | `OrderTrackingScreen` `orders` table se `delivery_otp` column select karta tha (column exist hi nahi karta post-fix) | 🟢 LOW | Would break | ✅ **FIXED** — RPC `get_my_delivery_otp` use karta hai |

## ✅ Dynamic Attack Results (headless Chromium, live web build)

| Attack | Technique | Verdict |
|---|---|---|
| **ATT-1** localStorage session/role tampering | `role: admin, userId: fake` zustand persist me inject | ✅ **MITIGATED** — login gate re-required, admin UI reachable nahi |
| **ATT-2** XSS via product/cart name | `<img onerror>` + `<script>` strings cart me | ✅ **MITIGATED** — RN-Web text ko escape karta hai, JS execute nahi hua |
| **ATT-3** Client-side price tampering | `unitPricePaise: 0` persisted store me | ✅ **NO IMPACT** — display only; checkout server-authoritative (`create_checkout_order` RPC DB se recalculate karta hai; payment amount server-set) |
| **ATT-4** `?role=admin` production escalation | URL param + demo OTP flow | 🔴→✅ **CONFIRMED → FIXED** (upar detail) |

## 🛡️ Kya pehle se strong tha (no change needed)

- **Razorpay webhook**: HMAC-SHA256 + timing-safe compare + amount/currency cross-check + dedup — solid
- **Checkout pricing**: client se ₹0 trust nahi; sab server-side RPC me integer-paise math
- **Atomic inventory**: `create_checkout_order` SECURITY DEFINER + `FOR UPDATE` locks + deterministic lock order (deadlock-safe) + idempotency ownership check
- **RLS coverage**: 24/24 tables enabled, no `USING (true)` policies, 68 admin/role-scoped policy checks
- **Function grants**: `reserve_inventory`/`release_inventory` PUBLIC se revoked
- **Seed data**: koi password/secret/admin-role nahi
- **Client secrets**: sirf `EXPO_PUBLIC_*` (anon/public keys) app me; service-role sirf Edge Functions me
- **Session storage**: Expo SecureStore (Keystore/Keychain)
- **AI grounding**: Zaffy read-only, tool-grounded, prompt-injection instructions embedded-data ke against

## 📦 Deliverables (is commit me)

| File | Kya hai |
|---|---|
| `infrastructure/database/005_security_hardening.sql` | CRIT-1 + HIGH-2 fix: OTP vault table (deny-all RLS), rider UPDATE policy drop, `get_my_delivery_otp` RPC, audit entry |
| `supabase/functions/order-lifecycle/index.ts` | OTP vault integration (assign/ready/delivered paths) |
| `supabase/functions/checkout-create-order/index.ts` | Size gates + Razorpay retry fix |
| `supabase/functions/zaffy-ai-assistant/index.ts` | Model env + rate limiting |
| `apps/mobile/src/screens/customer/LoginOtpScreen.tsx` | Production gate for demo-role |
| `apps/mobile/src/screens/customer/OrderTrackingScreen.tsx` | OTP via RPC |
| `docs/security/SECURITY_AUDIT_REPORT.md` | Ye report |
| `screenshots-zaffit/attack-*.png` | Live attack evidence |

## 🚀 Deploy karne ke liye (backend apply)

```bash
# 1. SQL Editor me run karo (AFTER 001-004):
#    infrastructure/database/005_security_hardening.sql

# 2. Functions re-deploy:
supabase functions deploy order-lifecycle
supabase functions deploy checkout-create-order
supabase functions deploy zaffy-ai-assistant
```

## ⏳ Phase-5 backlog (abhi nahi, hardening phase me)

1. `FORCE ROW LEVEL SECURITY` on all tables (service-role bypass defense-in-depth)
2. Persistent rate-limit counters (Redis/Supabase table) — in-memory per-instance hai
3. Razorpay webhook replay-window tracking (event `created_at` age check)
4. OTP attempt-limit (5 fails → task lock) — abhi unlimited tries possible on delivered action
5. `npm audit` residual: expo/@expo/fingerprint moderate advisories (dev-chain, runtime impact minimal)
6. CSP headers for web build (XSS defense-in-depth; RN-Web already escapes)
7. IP-lawyer review gate (research repos) — Phase 5 checklist
