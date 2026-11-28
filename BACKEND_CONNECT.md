# 🔌 ZAFF-IT — Backend Connection Guide (स्टेप-बाय-स्टेप)

> Ye file aapko **zero se live backend** tak le jaati hai. Har step me exact commands, kahan se key milegi, aur kya expect karna hai — sab likha hai.
> **Time required:** ~45–60 minutes (pehli baar). Cost: **₹0** (sab free-tier).

---

## 📋 Overview — Architecture

```
Expo App (Customer/Merchant/Rider/Admin)
        │  HTTPS + JWT (Phone OTP login)
        ▼
Supabase ──► PostgreSQL (schema + RLS + atomic RPCs)
        │──► Edge Functions (checkout, orders, payments, AI)
        │──► Realtime (order status live sync)
        ▼
External (sab free-tier):
  • Cloudflare R2      → product images / KYC docs
  • Razorpay Test Mode → online payments (+COD)
  • OSM Nominatim/OSRM → address geocoding + routing
  • Gemini 2.5 Flash   → Zaffy AI assistant (read-only)
```

**SQL files (already in repo) — run in this order:**
`infrastructure/database/001_initial_schema.sql` → `002_rls_policies.sql` → `003_atomic_rpcs.sql` → `004_seed_makrana.sql`

**Edge Functions (already in repo) — `supabase/functions/`:**
`auth-delete-account` · `cart-preview` · `checkout-create-order` · `order-lifecycle` · `r2-presign-upload` · `razorpay-webhook` · `zaffy-ai-assistant`

---

## STEP 1 — Supabase Project banao (Database + Auth + Functions)

1. **https://supabase.com** → **Start your project** → GitHub/Google se sign-up (free).
2. **New project**:
   - Name: `zaff-it-prod` (ya `zaff-it-dev`)
   - Database Password: strong password **save kar lo** (db password, jwt nahi)
   - Region: **Singapore (ap-southeast-1)** ya **Mumbai (ap-south-1)** — Makrana/India ke liye Mumbai best hai
3. Project provision hone me ~2 min lagte hain.

### 1.1 SQL Schema run karo

Left sidebar → **SQL Editor** → **New query**. Ab repo ki 4 SQL files **ek-ek karke** paste karke **Run** karo (order important hai):

| # | File | Kya banata hai |
|---|------|----------------|
| 1 | `infrastructure/database/001_initial_schema.sql` | Enums, profiles, merchants, stores, zones (PostGIS), products, inventory |
| 2 | `infrastructure/database/002_rls_policies.sql` | Row-Level Security — har role sirf apna data dekhta hai |
| 3 | `infrastructure/database/003_atomic_rpcs.sql` | Atomic stock reservation + order create RPCs (oversell impossible) |
| 4 | `infrastructure/database/004_seed_makrana.sql` | Makrana zones (MKN-CENTRAL, MKN-BORAWAR-IND), demo stores, SKUs, promo `ZAFFMAKRANA` |

✅ Verify: **Table Editor** me `zones`, `stores`, `products`, `store_products` tables me Makrana seed data dikhna chahiye.

### 1.2 Phone (OTP) Auth enable karo

Sidebar → **Authentication → Providers → Phone**:
- **Enable** toggle ON
- SMS provider chuno (free/cheap options):
  - **SMS Gateway (Indian)** — abhi Demo OTP chal raha hai (`EXPO_PUBLIC_DEMO_OTP`). Gateway ke liye MSG91 / DLT-ready provider Supabase Auth → Phone me lagao, phir `EXPO_PUBLIC_DEMO_OTP=false` karo. Twilio/Firebase hata diya gaya hai.
  - **MSG91** (Indian, sasta) — Auth key daalo
- SMS template me ye rakho:
  ```
  ZAFF-IT: <Code> is your OTP. Need-It? Zaff-It!
  ```
- ⚠️ **Phone auth ke bina login nahi hoga.** Agar SMS setup nahi karna abhi: app dev-mode me fallback deta hai (agar Supabase keys .env me nahi hain to demo login chalta hai).

### 1.3 Keys copy karo

Sidebar → **Project Settings → API**:
- **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
- **anon public key** → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- (**service_role** key sirf Edge Functions me use hogi — app me KABHI mat daalo)

---

## STEP 2 — App ko backend se jodo (.env)

Repo root me `.env.example` ko copy karke `.env` banao:

```bash
cp .env.example apps/mobile/.env
```

`apps/mobile/.env` me (Step 1.3 wali values daalo):

```env
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_APP_NAME=ZAFF-IT
EXPO_PUBLIC_DEFAULT_CITY=Makrana
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key...
```

> ⚠️ `.env` git me commit NAHI hota (.gitignore me hai) — ye sahi hai. Sirf `.env.example` template repo me hai.

---

## STEP 3 — Edge Functions deploy karo

Supabase CLI chahiye:

```bash
npm install -g supabase
supabase login          # browser khulega, Supabase account se login karo
supabase link --project-ref YOUR-PROJECT-REF   # Settings → General → Reference ID
```

Ab saare functions deploy karo (repo root se):

```bash
supabase functions deploy cart-preview
supabase functions deploy checkout-create-order
supabase functions deploy order-lifecycle
supabase functions deploy auth-delete-account
supabase functions deploy r2-presign-upload
supabase functions deploy razorpay-webhook --no-verify-jwt   # webhook HMAC khud verify karta hai
supabase functions deploy zaffy-ai-assistant
```

### 3.1 Server-only secrets set karo (kabhi .env me nahi!)

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...service-role-key...
supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
supabase secrets set RAZORPAY_KEY_SECRET=your-razorpay-key-secret
supabase secrets set RAZORPAY_WEBHOOK_SECRET=your-webhook-secret
supabase secrets set R2_ACCOUNT_ID=your-cloudflare-account-id
supabase secrets set R2_ACCESS_KEY_ID=your-r2-access-key
supabase secrets set R2_SECRET_ACCESS_KEY=your-r2-secret-key
supabase secrets set R2_BUCKET_NAME=zaff-it-media
supabase secrets set GEMINI_API_KEY=your-google-ai-studio-key
supabase secrets set NOMINATIM_USER_AGENT=ZAFF-IT-Makrana/1.0 (ops@zaffmind.in)
```

✅ Verify: Supabase Dashboard → **Edge Functions** → 7 functions "Active" dikhne chahiye. Test:
```bash
curl "https://YOUR-PROJECT-REF.supabase.co/functions/v1/cart-preview" \
  -H "Authorization: Bearer YOUR_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"items":[]}'
```

---

## STEP 4 — Payments (Razorpay Test Mode — ₹0)

1. **https://dashboard.razorpay.com** signup (free) → KYC baad me jab live jana ho
2. **Test mode** ON rakho (dashboard top-right toggle)
3. **Account & Settings → API Keys → Generate Test Key**:
   - `rzp_test_...` → `RAZORPAY_KEY_ID` (Step 3.1) + app me `EXPO_PUBLIC_RAZORPAY_KEY_ID`
4. **Settings → Webhooks → Add New Webhook**:
   - URL: `https://YOUR-PROJECT-REF.supabase.co/functions/v1/razorpay-webhook`
   - Secret: ek random string banao → yehi `RAZORPAY_WEBHOOK_SECRET` me set kiya
   - Events: `payment.captured`, `payment.failed`, `refund.processed`
5. Test payment: app me checkout → test card `4111 1111 1111 1111`, any future expiry, any CVV.

> COD app me already supported hai — koi setup nahi chahiye (merchant cash-handling flow rider OTP ke saath hai).

---

## STEP 5 — Cloudflare R2 (images/KYC storage — 10 GB free)

1. **https://dash.cloudflare.com** → **R2 Object Storage** → **Create bucket** → name: `zaff-it-media` (region: APAC)
2. R2 → **Overview → Manage R2 API Tokens → Create API Token** (Object Read & Write, scope: sirf `zaff-it-media`):
   - Access Key ID → `R2_ACCESS_KEY_ID`
   - Secret Access Key → `R2_SECRET_ACCESS_KEY`
   - Account ID (dashboard home/right sidebar) → `R2_ACCOUNT_ID`
3. (Optional) Public CDN: bucket → **Settings → Public Access → Custom Domain** (e.g. `media.zaff-it.in`) → `EXPO_PUBLIC_MEDIA_BASE_URL` me daalo.

---

## STEP 6 — Zaffy AI (Gemini — free)

1. **https://aistudio.google.com** → Google account se login
2. **Get API key → Create API key** → copy karo → `GEMINI_API_KEY`
3. Model repo me already `gemini-2.5-flash` set hai (`.env.example` → `GEMINI_MODEL`).
4. AI **read-only** hai: catalogue/stock/price tools query karta hai; order, price, stock, refund me hand nahi lagata (doc ke guardrails ke hisab se).

---

## STEP 7 — App chalao 🚀

```bash
npm install --legacy-peer-deps    # pehli baar
npm run dev                        # Expo dev server (Metro)
# Expo Go app (Play Store) se QR scan karo, ya:
# Android emulator: a  |  iOS sim: i
```

**Login flow:** phone number → OTP → session. Agar SMS provider set nahi hai aur Supabase keys bhi nahi hain → app **demo mode** me chalta hai (Makrana seed data ke saath poora flow test kar sakte ho).

### Release build (baad me)

```bash
cd apps/mobile
npx eas login
npx eas build --platform android --profile preview    # APK for testing
npx eas build --platform android --profile production # Play Store AAB
```

---

## 🔧 Troubleshooting

| Problem | Fix |
|---|---|
| `Invalid API key` in app | `.env` me anon key galat/truncated — Settings → API se dobara copy karo, app restart karo (`npx expo start -c`) |
| OTP SMS nahi aa raha | Abhi **Demo OTP** mode hai (code login screen par dikhta hai). Real SMS ke liye Indian gateway (MSG91/DLT) Supabase Auth → Phone me configure karo |
| `new row violates row-level security policy` | 002_rls_policies.sql run nahi hua, ya user ka `profiles.role` set nahi hai — Table Editor → profiles check karo |
| Checkout `429` / stock error | 003_atomic_rpcs.sql run hai? SQL Editor me `\df` — RPCs list honi chahiye |
| Webhook signature failed | Razorpay webhook secret === `RAZORPAY_WEBHOOK_SECRET` supabase secret — same string honi chahiye |
| Functions deploy fail | `supabase link` hua hai? `supabase functions list` se check karo |
| Images upload fail | R2 token scope "Object Read & Write" hai? Bucket name secret se match? |
| Free-tier pause | Supabase free project ~7 din inactive hone par pause hota hai — dashboard se **Restore** karo |

---

## 💰 Free-Tier Limits (kab upgrade karna hai)

| Service | Free limit | Upgrade jab |
|---|---|---|
| Supabase | 500 MB DB, 50K MAU, 5 GB egress | DB > 400 MB ya pilot live ho |
| Cloudflare R2 | 10 GB storage, $0 egress | Catalogue+KYC > 10 GB |
| Razorpay | Test mode free | Live Makrana launch (KYC ke baad) |
| Gemini AI | Free RPD/RPM limits | Daily queries limit touch karein |
| Expo EAS | 15 builds/month | Zyada builds chahiye |
| OSM | 1 req/sec (Nominatim) | > 50–100 concurrent orders |

---

## ✅ Go-Live Checklist (Makrana Pilot)

- [ ] 4 SQL files run + seed data verify
- [ ] Phone OTP auth working (real SMS)
- [ ] 7 Edge Functions deployed + secrets set
- [ ] Razorpay webhook test payment captured
- [ ] R2 image upload test
- [ ] Zaffy AI reply test
- [ ] Merchant order accept → rider OTP → delivered — poora flow live test
- [ ] Supabase **daily backup** ON (Settings → Database → Backups)
- [ ] `.env` kabhi git me push nahi hua (double-check `git status`)

**Docs reference:** `docs/BACKEND_AND_API_CONNECTION_GUIDE.md` (deep API contracts) · `docs/API_CONTRACTS.md` (payload schemas) · `docs/QA_AND_SECURITY_AUDIT.md` (security checklist)
