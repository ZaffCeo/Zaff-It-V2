# 🔐 ZAFF-IT Security & Infra Status — Kya hai, Kya missing tha, Kya add kiya

> Owner request: *"Platform par security lage hue hai jaise Rate limiter, Load balancer etc — sab features hai ya nahi? Nahi to apne dimaag laga ke kar do."*
> Ye document poora honest answer hai. Date: 2026-11-26.

---

## 1. Security Feature Matrix (current state)

| Feature | Status | Detail |
|---|---|---|
| **Authentication** | ✅ | Supabase phone OTP, SecureStore sessions, JWT everywhere |
| **RLS (Row-Level Security)** | ✅ | 24/24 tables, 68 role-scoped policies, no `USING(true)` |
| **OTP vault** | ✅ (005) | `delivery_handover_otps` deny-all RLS; rider/customer direct read impossible |
| **Rider privilege escalation** | ✅ FIXED | CRIT-1 policy drop — transitions sirf via order-lifecycle |
| **OTP brute-force lock** | ✅ **NEW (is round)** | 5 wrong attempts → vault `locked=true` (HTTP 423); task reassignment auto-resets |
| **Rate limiting — AI (Zaffy)** | ✅ **UPGRADED** | 10/min per-user + 120/min global; **ab DB-backed persistent** (`check_rate_limit` RPC, 006) — restarts/multi-instance me bhi kaam karta hai (in-memory fallback rakha hai) |
| **Rate limiting — Auth/OTP** | ✅ **NEW client guard** | 60s resend cooldown (SMS-pumping guard); server-side Supabase built-in OTP windows bhi active hain |
| **Rate limiting — checkout/other functions** | 🟡 Partial | Body-size gates + cardinality checks (HIGH-3 fix); per-IP limits → Phase-5 (needs edge proxy/Redis) |
| **Persistent rate-limit store** | ✅ **NEW (006)** | `rate_limit_events` table + atomic SECURITY DEFINER RPC, granted sirf service_role+authenticated ko |
| **FORCE RLS (owner bypass lock)** | ✅ **NEW (006)** | Sensitive 5 tables: vault, payments, settlement_ledger, audit_logs, rate_limit_events |
| **Input validation** | ✅ | Zod schemas + pre-zod 64KB/100-item gates (HIGH-3) |
| **Payment integrity** | ✅ | Razorpay HMAC webhook + timing-safe compare + server-side amount verify |
| **SQL injection** | ✅ | PostgREST parameterized + zod; no string SQL |
| **XSS** | ✅ | RN-Web auto-escape (ATT-2 live-verified) |
| **Secrets management** | ✅ | Service-role sirf Edge Functions; app me sirf public anon keys; scan clean |
| **Audit logs** | ✅ | `audit_logs` me har critical transition + security changes |
| **Security headers (web)** | ✅ **NEW** | `vercel.json`: HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy + immutable asset caching |
| **Demo-role escalation** | ✅ FIXED | `?role=admin` production builds me gated (ATT-4 live-verified) |

## 2. Infra-level features (managed platforms de rahe hain — humein alag se nahi banana)

| Feature | Kahan covered | Note |
|---|---|---|
| **Load balancing** | ✅ Vercel edge network (web) + Supabase (DB/API) | Global anycast LB automatic — hum config nahi karte |
| **DDoS protection / WAF** | ✅ Vercel + Supabase baseline | Heavy attack traffic ke liye Cloudflare in front (Phase-5 option) |
| **Auto-scaling** | ✅ Vercel serverless/CDN + Supabase | Traffic ke hisaab se automatic |
| **HTTPS/TLS** | ✅ Automatic certificates | HSTS ab humne add kiya (006 round) |
| **Backups** | 🟡 Supabase daily backups (paid tier) | Free tier pe manual dumps — Phase-5 me scheduled logical backups |
| **Secrets rotation** | 🟡 Manual | Rotate keys quarterly — calendar item |
| **Uptime monitoring** | ⬜ | BetterStack/UptimeRobot free tier — Phase-5 setup |
| **Error tracking** | ⬜ | Sentry (Expo + Edge Functions) — Phase-5 first item |

## 3. Is round me ADD kiya gaya (code)

1. **`infrastructure/database/006_rate_limits.sql`** — persistent rate-limit store + atomic `check_rate_limit` RPC + FORCE RLS (5 sensitive tables)
2. **`order-lifecycle`** — OTP attempt lockout (5 fails → 423 LOCKED; reassignment resets)
3. **`zaffy-ai-assistant`** — DB-backed per-user limit check (persistent), in-memory fallback intact
4. **`LoginOtpScreen`** — 60-second resend cooldown + countdown UI
5. **`vercel.json`** — security headers + SPA rewrites + immutable JS caching

## 4. Phase-5 backlog (jab volume aaye)

- Per-IP rate limiting at edge (Cloudflare Worker ya Vercel middleware) — abhi user-level coverage hai
- Redis (Upstash) for ultra-low-latency shared counters — DB RPC ~5-10ms overhead
- Sentry + uptime monitors
- Razorpay webhook replay-window (event age check)
- CSP header (RN-web inline scripts ke saath careful tuning chahiye)
- Scheduled DB backups verification drill
