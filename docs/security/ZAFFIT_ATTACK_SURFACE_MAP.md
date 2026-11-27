# ZAFF-IT — Attack Surface Map

Trust boundaries: [Internet] → [Supabase Edge gateway (JWT verify per function flag)] → [Edge Function] → [Postgres RLS / SECURITY DEFINER RPC] → [Razorpay]. Mobile holds ONLY public identifiers (anon key, Razorpay key id). Service-role key exists only inside Edge Functions.

## Entry points

| # | Entry point | Access | Auth mechanism | Sensitive ops | Verdict |
|---|---|---|---|---|---|
| 1 | Phone OTP login (`auth`) | public | Supabase Auth (6-digit, 60s exp, rate-limits) | session issue | OK; SMS creds pending (A-02) |
| 2 | `qa-auth-bridge` fn | public (verify_jwt=false) | x-qa-token secret + phone ALLOWLIST | creates QA sessions | OK; disable pre-launch (H-03) |
| 3 | RLS tables (all, verified 100%) | authenticated/anon | per-table policies + `has_role()` | CRUD | OK; isolation suite passed |
| 4 | SECURITY DEFINER RPCs | varies | internal guards | stock/orders/coupons/coins | S-01 fixed; others guarded (audited) |
| 5 | `checkout-create-order` | public (verify_jwt=true) | verified JWT + UUID Idempotency-Key | order creation, price recalc, stock reserve | OK — server-authoritative |
| 6 | `razorpay-webhook` | public (verify_jwt=false) | timing-safe HMAC + amount/currency match | payment capture, stock settle trigger | OK — strong |
| 7 | `order-lifecycle` | public (verify_jwt=false) | own auth.getUser + role checks + rider ownership | status transitions, OTP handover, coin awards | OK |
| 8 | `cart-preview` / `catalog-*` | public | JWT (cart-preview) / ENRICH token (catalog-enrich, now header-only) | price preview, enrichment | OK / S-05 fixed |
| 9 | `catalog-ingest` | public (verify_jwt=false) | x-ingest-token == secret (rotated 2026-11-27) | batch ingest writes | OK post-rotation |
| 10 | `r2-presign-upload` | public (verify_jwt=true) | verified JWT | presigned R2 uploads | OK; R2 secrets pending (A-04) |
| 11 | `zaffy-ai-assistant` v14 | public (verify_jwt=true) | verified JWT (anon demo gated by ALLOW_ZAFFY_ANON) | AI tools: catalogue reads, cart writes, proposal-confirmed order/merchant writes | OK — 16-case harness + RLS isolation passed |
| 12 | storage `product-images` | public read / authenticated write | bucket policies + NEW 5 MB + MIME limits | file upload | S-02 fixed |
| 13 | `auth-delete-account` | public (verify_jwt=true) | verified JWT | account deletion | OK |
| 14 | pg_cron jobs | internal (postgres) | locked ops tables (no literals) | worker kicks | OK post-rotation |

## Highest-value attack paths (all closed or gated)
1. anon → `settle_delivered_order_inventory` stock corruption — **CLOSED (S-01, verified)**.
2. client price/total tampering → server RPC recompute — **INEFFECTIVE by design**.
3. webhook forgery → HMAC timing-safe + amount match — **INEFFECTIVE**.
4. cross-tenant reads → RLS + ownership guards — **verified via isolation suite**.
5. Zaffy prompt-injection → untrusted-data framing + allowlisted tools + backend revalidation + proposal confirmation — **gated**; corpus testing pending (NOT VERIFIED).
6. Storage abuse hosting — **gated (S-02)**.
7. OTP brute force — 60s expiry + rate limits + delivery-OTP lock — **impractical**.
