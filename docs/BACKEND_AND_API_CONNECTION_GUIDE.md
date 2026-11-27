# ZAFF-IT Backend & API Connection Guide (100% Free-Tier MVP Stack)

> **Project:** ZAFF-IT ("Need It? Zaff-It!") — Hyperlocal Quick-Commerce & Services Ecosystem  
> **Company:** ZaffmIND Technology / ZAFF Group  
> **Pilot Region:** Makrana, Rajasthan (Merchant-Fulfilled Pilot → Dark Store at 500 orders/day)  
> **Architecture:** Modular Monolith on a single canonical PostgreSQL schema, 100% Free-Tier & Open-Source MVP infrastructure, upgrading only after revenue.

---

## 1. Free-Tier Stack Overview & Revenue Upgrade Triggers

ZAFF-IT's MVP is engineered to run at **₹0/month infrastructure cost** during development and the Makrana merchant-first pilot, without sacrificing data integrity, security, or migration readiness.

| Layer | Free-Tier / Open-Source Provider | Free-Tier Limits & Hard Constraints | Revenue Upgrade Trigger | Next Paid Tier |
| :--- | :--- | :--- | :--- | :--- |
| **Database, Auth, Realtime & Serverless** | [Supabase Free Tier](https://supabase.com/pricing) | 500 MB Postgres DB (shared CPU, 500 MB RAM), 50,000 MAUs, 5 GB egress + 5 GB cached egress, 500,000 [Edge Function invocations/mo](https://supabase.com/docs/guides/functions/pricing) (150s timeout, 2s CPU), 1 GB storage. **Pauses after 7 days of inactivity.** | DB > 400 MB, MAUs > 40,000, egress > 4 GB/mo, or live pilot requires zero auto-pause | **Supabase Pro** ($25/mo) |
| **Media & KYC Object Storage** | [Cloudflare R2 Free Tier](https://developers.cloudflare.com/r2/pricing/) | 10 GB-month Standard Storage, 1M Class A ops (PUT/POST/LIST), 10M Class B ops (GET), **$0 egress fees**. | Product images + Rider KYC selfies exceed 10 GB or > 1M writes/mo | **R2 Pay-as-you-go** ($0.015/GB-mo, $0 egress) |
| **Maps, Geocoding & Routing** | [OSM Nominatim](https://operations.osmfoundation.org/policies/nominatim/) + [OSRM](https://github.com/project-osrm/osrm-backend) | Nominatim public API: **max 1 req/sec**, mandatory custom `User-Agent`, no heavy autocomplete. OSRM `router.project-osrm.org` is a demo server without SLA. | Pilot exceeds ~50–100 concurrent active orders or geocoding approaches 1 req/sec | **Self-hosted OSRM + Nominatim** on a small VPS (~₹400–₹800/mo) with Rajasthan OSM extract |
| **Payments** | [Razorpay Test Mode](https://razorpay.com/docs/webhooks/validate-test) + COD | ₹0/mo in Test Mode (`rzp_test_*`), full UPI/Card/Netbanking simulation + HMAC-SHA256 webhooks. | Launching real-money paid orders in Makrana after Razorpay merchant KYC approval | **Razorpay Live Mode** (Standard MDR per transaction, no monthly fee) |
| **Zaffy AI Assistant** | [Gemini API Free Tier](https://aistudio.google.com/docs/rate-limits) | ₹0/mo via Google AI Studio Free Tier; strict per-project RPM/TPM/RPD limits (RPD resets midnight Pacific). | Daily Zaffy AI queries approach Free Tier RPD/RPM limits | **Gemini API Tier 1** (Pay-as-you-go via Google AI Studio) |
| **Mobile Builds & OTA** | [Expo / EAS Free Tier](https://expo.dev/pricing) | 15 Android + 15 iOS cloud builds/mo (low-priority queue, 45-min timeout), 1,000 MAUs on Expo Update, unlimited Expo Submit. | Monthly active users > 1,000 or release velocity needs > 15 Android builds/mo | **Expo Starter** ($19/mo + usage) or GitHub Actions local Gradle builds |
| **Source Control & CI** | GitHub Free | Unlimited public/private repos, 2,000 GitHub Actions mins/mo on private repos. | Team > 3+ devs needing advanced branch protections/SAML or > 2,000 private CI mins | **GitHub Team** ($4/user/mo) |
| **Fulfilment Model** | Merchant-Fulfilled Pilot | Uses existing Makrana partner merchant inventory (`fulfillment_mode = 'merchant_fulfilled'`). | **Sustained volume reaches 500 orders/day in Makrana** | **Dark Store Mode** (`dark_store_enabled = true` feature flag on existing canonical tables) |

### Core Architectural Guardrails (Non-Negotiable)
1. **Money in Integer Paise:** Every monetary column and API field (`*_paise`) is stored and transmitted as a 64-bit integer (`BIGINT` / `INTEGER`, e.g., `₹199.00` = `19900`). Never use floating-point numbers.
2. **UTC Timestamps:** Store and return all timestamps in UTC ISO-8601 (`TIMESTAMPTZ`). Format to `Asia/Kolkata` (`IST`, `+05:30`) only in the UI.
3. **Atomic Inventory Reservation:** Stock is never decremented blindly. Checkout atomically reserves inventory such that `available_to_sell = on_hand_quantity - reserved_quantity >= requested_quantity` inside a single PostgreSQL transaction.
4. **Idempotency:** Checkout, payment initiation, and Razorpay webhooks require idempotency keys to prevent duplicate orders or double charges on flaky mobile networks.
5. **Zaffy AI Read-Only Boundary:** Zaffy AI (`gemini-2.5-flash` / `gemini-2.5-flash-lite` on Free Tier) is strictly read-only. It never autonomously alters prices, stock, refunds, or rider assignments.

---

## 2. Step-by-Step Infrastructure Setup

### Step 1: Create the Supabase Project
1. Sign in at [supabase.com](https://supabase.com) and create a new organization (e.g., `zaffmind-tech`).
2. Click **New Project**:
   - **Name:** `zaff-it-prod` (or `zaff-it-dev` for staging — remember Free Tier allows 2 active projects).
   - **Database Password:** Generate a strong 24+ character password and store it in your password manager (never commit it to Git).
   - **Region:** Select **South Asia (Mumbai) — `ap-south-1`** for lowest latency to Makrana, Rajasthan.
3. Once provisioned, go to **Project Settings → API** and note:
   - `Project URL` → maps to `EXPO_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`
   - `anon` `public` key → maps to `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → maps to `SUPABASE_SERVICE_ROLE_KEY` (**Edge Functions only — NEVER put in Expo `.env`**)

---

### Step 2: Run SQL Migrations (`001` – `004`)
Install the [Supabase CLI](https://supabase.com/docs/guides/cli) locally and link your project:

```bash
# 1. Authenticate CLI
npx supabase login

# 2. Link to your remote project (run inside ZAFF-IT repo root)
npx supabase link --project-ref <your-project-ref>
```

> **Canonical migrations:** `infrastructure/database/*.sql` in filename order (see `docs/database-migrations.md`). `supabase/migrations/` is not used.
- `001_core_schema.sql` — Extensions (`postgis`, `pgcrypto`), enums (`user_role`, `order_status`, `fulfillment_mode`, `payment_method`), `profiles`, `zones`, `stores`, `feature_flags` (including `dark_store_enabled = false`).
- `002_catalogue_and_inventory.sql` — `categories`, `products`, `store_inventory` (with `on_hand_quantity`, `reserved_quantity`, generated `available_to_sell`), `cart_items`, and `coupons`.
- `003_orders_payments_dispatch.sql` — `orders`, `order_items`, `payment_transactions`, `webhook_events`, `rider_shifts`, `deliveries`, `audit_logs`, plus atomic checkout RPC (`create_order_atomic`) and inventory release functions.
- `004_rls_and_indexes.sql` — Row-Level Security (RLS) policies enforcing strict tenant/role isolation (`customer`, `merchant`, `rider`, `admin`) and performance indexes.

Push all migrations to Supabase:

```bash
npx supabase db push
```

> **Alternative (Dashboard):** If you cannot use the CLI, open **SQL Editor** in the Supabase Dashboard and run `001` through `004` sequentially. Verify that all tables appear under **Table Editor** with RLS enabled.

---

### Step 3: Deploy Supabase Edge Functions & Set Secrets
All sensitive third-party calls (R2 signing, Razorpay order creation & webhook verification, Nominatim/OSRM proxy with caching/rate-limiting, Gemini Zaffy AI, and atomic checkout orchestration) live in `supabase/functions/`.

1. Set server-only secrets (never exposed to the mobile app):

```bash
npx supabase secrets set \
  R2_ACCOUNT_ID="<cloudflare-account-id>" \
  R2_ACCESS_KEY_ID="<r2-access-key>" \
  R2_SECRET_ACCESS_KEY="<r2-secret-key>" \
  R2_BUCKET_NAME="zaff-it-media" \
  R2_PUBLIC_BASE_URL="https://media.zaff-it.in" \
  RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxxxx" \
  RAZORPAY_KEY_SECRET="<razorpay-test-secret>" \
  RAZORPAY_WEBHOOK_SECRET="<razorpay-webhook-secret>" \
  GEMINI_API_KEY="<google-ai-studio-free-key>" \
  NOMINATIM_USER_AGENT="ZAFF-IT-Makrana/1.0 (ops@zaffmind.in)" \
  OSRM_BASE_URL="https://router.project-osrm.org"
```

2. Deploy all Edge Functions:

```bash
npx supabase functions deploy checkout-create-order
npx supabase functions deploy razorpay-webhook --no-verify-jwt
npx supabase functions deploy r2-signed-url
npx supabase functions deploy geo-proxy
npx supabase functions deploy zaffy-ai
```

> **Important:** `razorpay-webhook` MUST be deployed with `--no-verify-jwt` because Razorpay servers do not send a Supabase user JWT; authentication is enforced via HMAC-SHA256 signature verification on the `X-Razorpay-Signature` header.

---

### Step 4: Configure Phone OTP Authentication
ZAFF-IT uses Indian mobile number (`+91`) Phone OTP as the primary authentication method:

1. In Supabase Dashboard, go to **Authentication → Providers → Phone**.
2. Toggle **Enable Phone provider** ON.
3. **Free-Tier Development & Pilot Tip:**
   - During development and closed internal testing, configure **Test Phone Numbers and OTPs** in **Authentication → Providers → Phone → Test Phone Numbers** (e.g., `+919999999999=123456`) so you spend ₹0 on SMS gateways while testing all 4 roles (`customer`, `merchant`, `rider`, `admin`).
   - When ready for external Makrana pilot users, connect an Indian DLT-compliant SMS provider (e.g., MSG91 / Twilio / Fast2SMS) supported by Supabase Phone Auth or a custom Send SMS Auth Hook Edge Function.
4. Go to **Authentication → URL Configuration** and add your Expo deep link scheme (e.g., `zaffit://auth-callback`).
5. Ensure your `profiles` trigger (`handle_new_user`) assigns default role `customer` on signup; `merchant`, `rider`, and `admin` roles are promoted only by an `admin` via `admin-set-role` (and mirrored into `auth.users.raw_app_meta_data` so RLS policies read `auth.jwt() -> 'app_metadata' ->> 'role'` with zero extra DB joins).

---

### Step 5: Set Up Cloudflare R2 & Signed URLs
Cloudflare R2 stores product photos, merchant storefront banners, and private Rider KYC/shift selfies with **$0 egress**.

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2 Object Storage → Create bucket**.
   - Name: `zaff-it-media`
   - Location: **Asia-Pacific (APAC)** (closest to India).
2. Configure **CORS Policy** on `zaff-it-media` (Settings → CORS Policy) so the Expo app can upload directly via presigned `PUT` URLs:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "x-amz-acl"],
    "MaxAgeSeconds": 3600
  }
]
```

3. Create an **R2 API Token** (**R2 → Manage R2 API Tokens → Create API Token**):
   - Permissions: **Object Read & Write** scoped strictly to `zaff-it-media`.
   - Copy `Access Key ID`, `Secret Access Key`, and your `Account ID` into `supabase secrets set` (Step 3).
4. **Access Pattern:**
   - **Public Catalogue Images (`catalogue/*`):** Serve via an R2 custom domain (e.g., `https://media.zaff-it.in/catalogue/...`) cached by Cloudflare CDN.
   - **Private KYC & Shift Selfies (`kyc/*`, `shifts/*`):** Keep private. The Rider app calls `POST /functions/v1/r2-signed-url` to get a short-lived (120-second) S3v4 presigned `PUT` URL for upload, and Admins get a 300-second presigned `GET` URL for verification.

---

### Step 6: Configure Razorpay Test Keys & HMAC-SHA256 Webhook
1. Create a free account at [dashboard.razorpay.com](https://dashboard.razorpay.com) and ensure the top toggle is set to **Test Mode**.
2. Go to **Account & Settings → API Keys → Generate Test Key**:
   - Copy **Key Id** (`rzp_test_...`) → set as both `RAZORPAY_KEY_ID` (Edge Function secret) and `EXPO_PUBLIC_RAZORPAY_KEY_ID` (public client key for Razorpay Checkout SDK).
   - Copy **Key Secret** → set ONLY as `RAZORPAY_KEY_SECRET` in Supabase Edge Function secrets.
3. Configure the Webhook (**Account & Settings → Webhooks → + Add New Webhook**):
   - **Webhook URL:** `https://<your-project-ref>.supabase.co/functions/v1/razorpay-webhook`
   - **Secret:** Generate a strong 32-char random string and save it as `RAZORPAY_WEBHOOK_SECRET` in Supabase secrets.
   - **Active Events:** Select `payment.captured`, `payment.failed`, `order.paid`, and `refund.processed`.
4. **Verification Rule:** Per [Razorpay Webhook Security Docs](https://razorpay.com/docs/webhooks/validate-test), `razorpay-webhook` MUST compute `HMAC-SHA256` using `RAZORPAY_WEBHOOK_SECRET` over the **raw HTTP request body string** (before `JSON.parse`) and compare it in constant time against the `X-Razorpay-Signature` header, returning HTTP `200` within 5 seconds.

---

### Step 7: Connect the Expo React Native App via `.env`
1. Copy the template to create your local environment file:

```bash
cp .env.example .env
```

2. Fill in ONLY `EXPO_PUBLIC_*` variables in `.env` (see `.env.example`).
3. Ensure `.env` is listed in `.gitignore` so it is never committed to GitHub.
4. In `src/lib/supabase.ts`, initialize the Supabase client with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, backed by `expo-secure-store` (for auth tokens) and `@react-native-async-storage/async-storage`.
5. All Geo/Maps calls from the app go through `POST /functions/v1/geo-proxy` (which caches Nominatim results in Postgres and attaches the compliant `User-Agent` header so mobile clients never violate Nominatim's 1 req/sec policy).

---

### Step 8: Build the Android APK via Expo EAS Free Tier
1. Install EAS CLI and log in:

```bash
npm install -g eas-cli
eas login
```

2. Configure `eas.json` with a `preview` profile that outputs an installable `.apk` for Makrana pilot testers (merchants, riders, and internal QA):

```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "preview": {
      "android": { "buildType": "apk" },
      "env": {
        "EXPO_PUBLIC_ENV": "pilot"
      }
    },
    "production": {
      "android": { "buildType": "app-bundle" }
    }
  }
}
```

3. Trigger a cloud build (uses 1 of your 15 free monthly Android builds):

```bash
eas build --platform android --profile preview
```

4. Once complete, scan the QR code or share the `.apk` download link with Makrana pilot merchants and riders. To conserve your 15 free builds/month, use **Expo Go** or a single **Development Build** for daily UI iteration and reserve `eas build` for native dependency changes and pilot releases.

---

## 3. Dark Store Activation Playbook (500 Orders/Day Trigger)
Per ZAFF-IT's Makrana Pilot Policy, you do **not** need a new database or separate app when launching your first Dark Store:
1. All `stores` rows have `store_type` (`'merchant'` | `'dark_store'`).
2. When Makrana daily volume sustains **500 orders/day**, an `admin` sets `feature_flags.dark_store_enabled = true` via `PATCH /functions/v1/admin-feature-flags` and onboards the Dark Store location in `stores` with `store_type = 'dark_store'`.
3. Inventory, picker/packer states, and rider dispatch automatically route Dark Store orders through the same canonical tables.
