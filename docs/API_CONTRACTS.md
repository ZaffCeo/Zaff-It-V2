# ZAFF-IT API Contracts Reference (v1.0)

> **Base URL (Edge Functions):** `https://<project-ref>.supabase.co/functions/v1`  
> **Base URL (PostgREST / RPC):** `https://<project-ref>.supabase.co/rest/v1`  
> **Money Format:** Strictly integer paise (`*_paise`, e.g. `19900` = ₹199.00). Zero floating-point currency values.  
> **Timestamps:** Strictly UTC ISO-8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`).

---

## Global Headers & Conventions

| Header | Required On | Description |
| :--- | :--- | :--- |
| `Authorization` | All authenticated endpoints | `Bearer <supabase_access_token>` |
| `apikey` | All PostgREST / Edge Function calls | `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| `Content-Type` | All JSON requests | `application/json` |
| `Idempotency-Key` | All mutating checkout, payment, and inventory endpoints | Client-generated UUID v4 (`550e8400-e29b-41d4-a716-446655440000`) |
| `X-Razorpay-Signature` | `POST /razorpay-webhook` only | HMAC-SHA256 hex digest of raw request body |

### Standard Error Envelope
All Edge Functions return a uniform JSON error payload:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Only 2 units available for Tata Salt 1kg.",
    "details": { "product_id": "prod_01J...", "available_to_sell": 2 },
    "request_id": "req_9a8b7c6d"
  }
}
```

| HTTP Status | Error Code | Meaning |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Missing or malformed request fields |
| `401` | `UNAUTHORIZED` | Missing, expired, or invalid Supabase JWT |
| `401` | `PAYMENT_SIGNATURE_INVALID` | Razorpay HMAC-SHA256 signature mismatch |
| `403` | `FORBIDDEN` | Authenticated user lacks required role (`customer`, `merchant`, `rider`, `admin`) |
| `404` | `NOT_FOUND` | Resource ID does not exist or is hidden by RLS |
| `409` | `INSUFFICIENT_STOCK` | `available_to_sell < requested_quantity` during atomic reservation |
| `409` | `IDEMPOTENCY_CONFLICT` | Same `Idempotency-Key` reused with a different request payload |
| `422` | `OUT_OF_SERVICE_ZONE` | Delivery coordinates fall outside active Makrana / city geofence |
| `429` | `RATE_LIMIT_EXCEEDED` | Gemini Free Tier or Nominatim geo-proxy rate limit reached |
| `500` | `INTERNAL_ERROR` | Unexpected server or database error |

---

## 1. Auth

### 1.1 Request Phone OTP
Uses Supabase Auth `/auth/v1/otp`.
- **POST** `https://<project-ref>.supabase.co/auth/v1/otp`
- **Auth:** Public (`apikey` header only)

```json
// Request
{
  "phone": "+919829012345"
}

// Response (200 OK)
{
  "message_id": "msg_01J..."
}
```

### 1.2 Verify Phone OTP
- **POST** `https://<project-ref>.supabase.co/auth/v1/verify`
- **Auth:** Public (`apikey` header only)

```json
// Request
{
  "phone": "+919829012345",
  "token": "123456",
  "type": "sms"
}

// Response (200 OK)
{
  "access_token": "eyJhbGci...",
  "refresh_token": "v1.MR...",
  "expires_in": 3600,
  "user": {
    "id": "usr_uuid",
    "phone": "+919829012345",
    "app_metadata": { "role": "customer" }
  }
}
```

### 1.3 Get / Update Current Profile
- **GET / PATCH** `/rest/v1/profiles?id=eq.<user_id>`
- **Auth:** `customer | merchant | rider | admin`

```json
// PATCH Request
{
  "full_name": "Amaan Khan",
  "preferred_language": "hi-Latn",
  "default_address_id": "addr_01J..."
}
```

### 1.4 Request Account Deletion (Compliance)
- **POST** `/functions/v1/auth-delete-account`
- **Auth:** `customer | merchant | rider`
- **Response (`202 Accepted`):** `{ "status": "scheduled_for_deletion", "scheduled_purge_at": "2026-12-26T08:55:00.000Z" }`

---

## 2. Stores & Zones (Geofence + Nominatim Proxy)

### 2.1 Check Serviceability & Geocode Address
Proxies Nominatim (1 req/sec guarded + cached in Postgres) and checks PostGIS zone polygons.
- **POST** `/functions/v1/geo-proxy`
- **Auth:** `customer | merchant | rider | admin`

```json
// Request (Mode A: Reverse Geocode + Zone Check)
{
  "action": "check_zone",
  "lat": 27.0397,
  "lng": 74.7219
}

// Response (200 OK)
{
  "serviceable": true,
  "zone": {
    "id": "zone_makrana_central",
    "name": "Makrana Central",
    "city": "Makrana",
    "min_order_paise": 9900,
    "base_delivery_fee_paise": 1500,
    "free_delivery_threshold_paise": 29900
  },
  "formatted_address": "Station Road, Makrana, Nagaur, Rajasthan 341505"
}
```

> If `serviceable: false` (e.g., Kuchaman, Didwana, Parbatsar, Borawar pre-launch), client displays the **Demand Voting** prompt (`POST /rest/v1/city_demand_votes`).

### 2.2 List Active Stores in Zone
- **GET** `/rest/v1/stores?zone_id=eq.<zone_id>&is_active=eq.true&select=id,name,store_type,is_open,eta_min_minutes,eta_max_minutes,banner_url`
- **Auth:** `customer | admin`

---

## 3. Catalogue

### 3.1 List Store Products (with Live `available_to_sell`)
- **GET** `/rest/v1/rpc/get_store_catalogue`
- **Auth:** `customer | merchant | admin`

```json
// Request Body (via POST /rest/v1/rpc/get_store_catalogue)
{
  "p_store_id": "str_01J...",
  "p_category_id": null,
  "p_search": "atta",
  "p_limit": 20,
  "p_offset": 0
}

// Response (200 OK)
[
  {
    "product_id": "prod_01J...",
    "name": "Aashirvaad Shudh Chakki Atta 5kg",
    "category_name": "Staples & Grains",
    "mrp_paise": 28500,
    "selling_price_paise": 24900,
    "available_to_sell": 18,
    "unit_label": "5 kg",
    "image_url": "https://media.zaff-it.in/catalogue/atta-5kg.webp"
  }
]
```

---

## 4. Cart

### 4.1 Validate Cart & Preview Totals (Server-Authoritative)
Single-store basket only (multi-store split baskets are explicitly excluded in v1).
- **POST** `/functions/v1/cart-preview`
- **Auth:** `customer`

```json
// Request
{
  "store_id": "str_01J...",
  "address_id": "addr_01J...",
  "coupon_code": "MAKRANA20",
  "items": [
    { "product_id": "prod_01J...", "quantity": 2 }
  ]
}

// Response (200 OK)
{
  "store_id": "str_01J...",
  "items": [
    {
      "product_id": "prod_01J...",
      "name": "Aashirvaad Shudh Chakki Atta 5kg",
      "quantity": 2,
      "unit_price_paise": 24900,
      "line_total_paise": 49800,
      "available_to_sell": 18
    }
  ],
  "subtotal_paise": 49800,
  "delivery_fee_paise": 0,
  "discount_paise": 2000,
  "handling_fee_paise": 200,
  "grand_total_paise": 48000,
  "coupon_applied": true
}
```

---

## 5. Checkout & Orders

### 5.1 Atomic Checkout & Order Creation
Validates zone, server-side prices, and atomically reserves stock (`reserved_quantity += qty`) inside PostgreSQL. If `payment_method = "razorpay"`, also creates a Razorpay Order on the server.
- **POST** `/functions/v1/checkout-create-order`
- **Auth:** `customer`
- **Required Header:** `Idempotency-Key: <uuid-v4>`

```json
// Request
{
  "store_id": "str_01J...",
  "address_id": "addr_01J...",
  "payment_method": "razorpay",
  "coupon_code": "MAKRANA20",
  "delivery_instructions": "Call on arrival near Marble Mandi gate",
  "items": [
    { "product_id": "prod_01J...", "quantity": 2 }
  ]
}

// Response (201 Created)
{
  "order_id": "ord_01J...",
  "order_number": "ZAF-20261126-0042",
  "status": "pending_payment",
  "fulfillment_mode": "merchant_fulfilled",
  "grand_total_paise": 48000,
  "payment": {
    "provider": "razorpay",
    "razorpay_order_id": "order_P9xAbC123456",
    "amount_paise": 48000,
    "currency": "INR"
  },
  "created_at": "2026-11-26T08:55:00.000Z"
}
```

> For `payment_method: "cod"`, `status` starts as `"placed"` and `payment` is `{ "provider": "cod", "razorpay_order_id": null }`.

### 5.2 Cancel Order (Customer)
Allowed only before status reaches `picked_up`. Atomically releases `reserved_quantity`.
- **POST** `/functions/v1/order-cancel`
- **Auth:** `customer`
- **Required Header:** `Idempotency-Key: <uuid-v4>`

```json
// Request
{ "order_id": "ord_01J...", "reason": "Ordered by mistake" }

// Response (200 OK)
{ "order_id": "ord_01J...", "status": "cancelled", "cancelled_at": "2026-11-26T08:58:00.000Z" }
```

---

## 6. Merchant Ops

### 6.1 Update Order Fulfillment Status
- **POST** `/functions/v1/merchant-order-action`
- **Auth:** `merchant` (verified store owner)
- **Required Header:** `Idempotency-Key: <uuid-v4>`

```json
// Request
{
  "order_id": "ord_01J...",
  "action": "mark_ready_for_pickup",
  "rejection_reason": null
}
// Allowed actions: "accept" | "reject" | "mark_packing" | "mark_ready_for_pickup"

// Response (200 OK)
{
  "order_id": "ord_01J...",
  "status": "ready_for_pickup",
  "updated_at": "2026-11-26T09:05:00.000Z"
}
```

### 6.2 Toggle Store Open / Closed
- **PATCH** `/rest/v1/stores?id=eq.<store_id>`
- **Auth:** `merchant` (RLS checks `owner_user_id = auth.uid()`)

```json
{ "is_open": false }
```

---

## 7. Inventory

### 7.1 Adjust Store Stock (`on_hand_quantity` & Price)
- **POST** `/rest/v1/rpc/adjust_store_inventory`
- **Auth:** `merchant | admin`

```json
// Request
{
  "p_store_id": "str_01J...",
  "p_product_id": "prod_01J...",
  "p_delta_on_hand": 25,
  "p_new_selling_price_paise": 24500
}

// Response (200 OK)
{
  "product_id": "prod_01J...",
  "on_hand_quantity": 45,
  "reserved_quantity": 2,
  "available_to_sell": 43,
  "selling_price_paise": 24500,
  "updated_at": "2026-11-26T09:10:00.000Z"
}
```

---

## 8. Rider Dispatch & Media

### 8.1 Request Cloudflare R2 Signed URL (Shift Selfie / KYC)
- **POST** `/functions/v1/r2-signed-url`
- **Auth:** `rider | merchant | admin`

```json
// Request
{
  "purpose": "rider_shift_selfie",
  "content_type": "image/jpeg",
  "file_ext": "jpg"
}

// Response (200 OK)
{
  "upload_url": "https://<account-id>.r2.cloudflarestorage.com/zaff-it-media/shifts/...",
  "object_key": "shifts/usr_01J/2026-11-26/selfie_9f8e.jpg",
  "expires_in_seconds": 120
}
```

### 8.2 Start / End Rider Shift
- **POST** `/functions/v1/rider-shift`
- **Auth:** `rider`

```json
// Request
{
  "action": "start_shift",
  "selfie_object_key": "shifts/usr_01J/2026-11-26/selfie_9f8e.jpg",
  "lat": 27.0397,
  "lng": 74.7219
}

// Response (200 OK)
{ "shift_id": "shf_01J...", "status": "active", "started_at": "2026-11-26T09:12:00.000Z" }
```

### 8.3 Get OSRM Delivery Route & ETA
- **POST** `/functions/v1/geo-proxy`
- **Auth:** `rider | admin`

```json
// Request
{
  "action": "route",
  "origin": { "lat": 27.0397, "lng": 74.7219 },
  "destination": { "lat": 27.0451, "lng": 74.7310 }
}

// Response (200 OK)
{
  "distance_meters": 1450,
  "duration_seconds": 280,
  "polyline": "u{~vFvyys@..."
}
```

### 8.4 Update Delivery Status (Pickup / Delivered)
- **POST** `/functions/v1/rider-delivery-action`
- **Auth:** `rider`
- **Required Header:** `Idempotency-Key: <uuid-v4>`

```json
// Request
{
  "delivery_id": "del_01J...",
  "action": "mark_delivered",
  "delivery_otp": "4821",
  "cash_collected_paise": 48000
}

// Response (200 OK)
{
  "delivery_id": "del_01J...",
  "order_status": "delivered",
  "delivered_at": "2026-11-26T09:24:00.000Z"
}
```

---

## 9. Razorpay Webhooks

### 9.1 Payment & Refund Webhook Receiver
- **POST** `/functions/v1/razorpay-webhook`
- **Auth:** `--no-verify-jwt`; authenticated strictly via `X-Razorpay-Signature` (`HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)`).
- **Idempotency:** Uses `x-razorpay-event-id` header stored in `webhook_events` (`UNIQUE`) to ignore duplicate retries safely.

```json
// Incoming Razorpay Payload (Subset)
{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_P9xDef789012",
        "order_id": "order_P9xAbC123456",
        "amount": 48000,
        "currency": "INR",
        "status": "captured"
      }
    }
  }
}

// Response (200 OK — returned within 5s)
{ "received": true, "deduplicated": false }
```

---

## 10. Admin

### 10.1 Toggle Feature Flags (Including Dark Store Activation)
- **PATCH** `/functions/v1/admin-feature-flags`
- **Auth:** `admin`

```json
// Request (Activate at 500 orders/day)
{
  "flag_key": "dark_store_enabled",
  "is_enabled": true,
  "reason": "Makrana pilot crossed 500 daily orders"
}

// Response (200 OK)
{
  "flag_key": "dark_store_enabled",
  "is_enabled": true,
  "updated_at": "2026-11-26T09:30:00.000Z"
}
```

### 10.2 Create / Update Geofence Zone
- **POST / PATCH** `/functions/v1/admin-zones`
- **Auth:** `admin`

```json
// Request
{
  "name": "Makrana Marble Mandi",
  "city": "Makrana",
  "min_order_paise": 9900,
  "base_delivery_fee_paise": 1500,
  "is_active": true,
  "polygon_geojson": { "type": "Polygon", "coordinates": [[[74.71, 27.03], [74.74, 27.03], [74.74, 27.05], [74.71, 27.05], [74.71, 27.03]]] }
}
```

---

## 11. Zaffy AI (Read-Only Grounded Assistant)

Powered by **Gemini API Free Tier** (`gemini-2.5-flash` / `gemini-2.5-flash-lite`).  
**Hard Guardrail:** Zaffy AI runs with a read-only database query toolset. It **never** modifies prices, inventory, refunds, or rider assignments.

### 11.1 Ask Zaffy AI
- **POST** `/functions/v1/zaffy-ai`
- **Auth:** `customer | merchant | rider | admin`

```json
// Request
{
  "query": "Where is my order ZAF-20261126-0042?",
  "store_id": "str_01J...",
  "locale": "en-IN"
}

// Response (200 OK)
{
  "reply": "Your order ZAF-20261126-0042 is currently packed and awaiting rider pickup from the store.",
  "grounded_entities": [
    { "type": "order", "id": "ord_01J...", "status": "ready_for_pickup" }
  ],
  "model": "gemini-2.5-flash",
  "read_only_verified": true
}
```
