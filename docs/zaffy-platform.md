# Zaffy AI Assistant & Shopping Agent — Platform Report

Mission: upgrade Zaffy into a production-oriented, multilingual AI assistant and
permission-controlled shopping/merchant agent **inside** the existing Zaff-It app
(no demo app, no duplicated business tables, no second auth system).

Status legend: ✅ implemented + verified · 🟡 implemented, not fully verified · ⛔ not implemented / blocked.

---

## 1. Repository audit (Phase 1 — completed before any code)

| Area | Existing reality found (reused, NOT duplicated) |
|---|---|
| Auth | Supabase Auth + `profiles` (id = auth.uid) + `user_roles(user_id, role∈{customer,merchant,rider,admin})` + `has_role()` helper (002) |
| Roles/RLS | RLS everywhere, policies in 002/005; admin via `has_role('admin')` |
| Catalogue | `products` (master, `hi_name`, search_vector) + `store_products` (seller price/mrp/availability/max_qty) + `inventory` (on_hand, reserved, **generated** available_to_sell) |
| Search | `search_products(p_query,p_store_id,p_category_id,p_limit)` v2 (016): normalize + `product_synonyms` + prefix/FTS — deterministic, no AI per keystroke (standing rule respected) |
| Cart | `carts` (UNIQUE one active per user, single-store) + `cart_items` (qty>0 CHECK) |
| Checkout | `checkout-create-order` edge fn: zod schema, size caps, UUID Idempotency-Key + payload hash, server cart write, `create_checkout_order` RPC (atomic stock reserve + paise-accurate totals), Razorpay order create + payments row |
| Zaffy v13 | read-only grounding assistant: provider fallback chain (Gemini→Groq→OpenRouter), anon demo gate, in-memory + `check_rate_limit` DB limits, **no** persistence/tools/proposals |
| Bugs found | v13 had no conversation persistence, no tools, no merchant mode; anon mode re-derived store each call; no usage/audit telemetry tables |

**Key decision:** Zaffy v14 reuses `checkout-create-order`'s exact order path
(RPC + Razorpay) instead of inventing a parallel one; cart writes go through
the same `carts`/`cart_items` tables the app uses (single-store semantics incl.
store-switch on cross-store add).

## 2. Database (migration `infrastructure/database/019_zaffy_platform.sql`) ✅ applied live

New Zaffy-only tables (all FK→profiles, UTC timestamptz, indexed, RLS on):

- `zaffy_conversations` — id, user_id, actor_role, title, language, archived_at
- `zaffy_messages` — role(user/assistant/tool/system), content, message_metadata JSONB, provider, model (**service-role inserts only**; user read-own)
- `zaffy_user_memories` — memory_type, memory_content, source, confidence, **user_approved** (owner CRUD)
- `zaffy_action_proposals` — action_type (place_order + 5 merchant writes), action_payload, status lifecycle (`awaiting_confirmation→confirmed→executing→completed/failed/expired`), `expires_at` 10-min, **idempotency_key UNIQUE** (user: select+insert own; status transitions service-role only)
- `zaffy_tool_audit_logs` — tool, action_type, resource, sanitized_input, result_status (read-only to users)
- `zaffy_usage_logs` — provider/model/tokens/latency/status/error_code (read-only to users)
- `zaffy_user_settings` — preferred_language, personality_mode, response_length, memory_enabled
- `zaffy_feedback` — rating 1-5 + comment (needed by POST /feedback; no existing table fit)
- `zaffy_purge_expired()` SECURITY DEFINER (7-day expired proposals, 90-day logs) — service-role only

Never stored: OTPs, passwords, payment credentials, raw sensitive message bodies in logs.

## 3. Edge function `zaffy-ai-assistant` v14 ✅ deployed (ACTIVE)

Single function, path-routed (`POST /chat`, `GET/DELETE /conversations[/:id]`,
`GET/POST/PATCH/DELETE /memory[/:id]`, `GET/POST /settings`, `GET /usage`,
`POST /feedback`, `POST /actions/:id/confirm`). Structure:

- **Provider abstraction** (spec §6): `AIProvider` interface; `GeminiProvider` +
  `OpenAICompatProvider` (Groq/OpenRouter). Env: `AI_DEFAULT_PROVIDER`,
  `AI_MODEL_NAME`, `AI_MAX_OUTPUT_TOKENS` (800), `AI_REQUEST_TIMEOUT_MS`
  (25000, AbortController), `AI_MAX_CONTEXT_MESSAGES` (12). Controlled retry
  (one transient retry per model), quota/timeout/error mapping, usage capture.
  Future `ZaffyProvider` = one more class; orchestrator touches only the interface.
- **Orchestrator** (spec §7): verified-JWT identity → role from `user_roles`
  (never client/model) → conversation load/create → approved memories →
  deterministic personality (shopping/complaints/payments/merchant/casual) →
  provider-independent JSON tool protocol (max 3 tool rounds, zod-validated args)
  → grounded reply → message persistence + usage log + tool audit log.
- **Customer tools**: search_products (synonym RPC), compare_seller_prices,
  check_product_availability, get_recommendations, get_my_orders,
  get_my_order_details, track_my_order, get_my_cart, prepare_checkout, +
  **immediate** cart writes: add_to_cart (offer resolution: prefer cart store →
  cheapest open store; caps by max_qty + live stock; store-switch rule),
  update_cart_item, remove_cart_item — all return refreshed DB cart snapshot.
- **Merchant tools**: get_my_shop, get_my_inventory, search_my_products,
  get_my_orders, get_my_order_details, get_sales_summary (ownership-scoped via
  `merchants.owner_user_id`). Writes (update_product_price, update_stock,
  update_shop_availability, bulk_update_stock ≤20) **only** as confirmed proposals.
- **Action lifecycle** (spec §10): proposal insert (10-min TTL, UUID idempotency)
  → UI confirm → revalidation (address ownership, cart non-empty, store
  ownership, price≤MRP, stock≥reserved) → execution: place_order calls
  `create_checkout_order` RPC with the proposal's idempotency_key (duplicate-
  order prevention by the same key) + Razorpay order lifecycle; stale/expired → 410.
- **Anon demo mode** preserved: catalogue-only read tools, no persistence, gated
  by `ALLOW_ZAFFY_ANON` + structural bearer check; all other routes 401 for anon.
- **Limits**: 10 req/min/user (in-memory + DB `check_rate_limit`), 120/min global,
  message ≤1000 chars, tool-result cap 2.2KB, proposal ≤3 per reply.

## 4. Mobile integration ✅ (tsc clean)

- `apps/mobile/src/services/zaffy.ts` — typed client (fresh-session aware,
  ZaffyApiError with status/code, confirm lifecycle).
- `apps/mobile/src/screens/customer/ZaffyChatScreen.tsx` — full chat: suggestion
  empty-state, tool-execution chips, proposal confirm/reject cards, chat history
  (list/open/delete), settings sheet (language Hinglish/हिंदी/English, memory
  toggle + approve/delete), loading/error/offline states, Zaff brand tokens.
- `RootNavigator`: `ZaffyChat: { initialQuery?: string }` registered.
- `CustomerHomeScreen`: "Try Zaffy" CTAs now navigate to ZaffyChat (inline v13
  modal code left untouched but unreached).

## 5. Tests actually executed

Local integration (exact repo bytes via `deno run`, mock Supabase auth/REST):

| # | Case | Result |
|---|---|---|
| T1-T2 | invalid / garbage bearer → /chat | ✅ 401 |
| T3 | valid JWT, zero AI providers configured | ✅ 200 + honest "Zaffy unavailable" reply, persisted conversation id returned |
| T4-T7 | GET conversations/memory/usage, POST feedback | ✅ 200/201 |
| T8 | invalid settings payload | ✅ 400 |
| T9 | confirm unknown proposal | ✅ 404 |
| T10 | unknown route | ✅ 404 |
| T11 | query >1000 chars | ✅ 400 |
| T12 | rate limit burst | ✅ trips to 429 after window (>10/min) |
| T13-T14 | anon JWT / publishable key w/o ALLOW_ZAFFY_ANON | ✅ 401 |
| T15 | anon chat WITH flag | ✅ mode:anon, ephemeral (conversation_id null) |
| T16 | anon → user-only route | ✅ 401 |

Real-DB RLS (connector, `set role authenticated` + `request.jwt.claims`, rolled back):

| Case | Result |
|---|---|
| customer inserts own conversation/memory | ✅ |
| merchant SELECTs customer's conversations | ✅ **0 rows** (isolation) |
| merchant UPDATEs/DELETEs customer conversation | ✅ **0 rows affected** (denied) |
| customer deletes own conversation | ✅ |
| user UPDATE on zaffy_action_proposals status | ✅ blocked (no user UPDATE policy) |

Static: `deno check --config supabase/functions/deno.json` ✅ · `tsc --noEmit` ✅ EXIT=0.
Deploy integrity: probe function + compile evidence prove first-line loss is
display-only; deployed body == repo bytes (v14 ACTIVE).

## 6. NOT executed (honest gaps)

- ⛔ **Live AI tool-loop against real Gemini** (chat → search → grounded price
  answer; place_order E2E with Razorpay) — sandbox egress to supabase.co and
  Google APIs is blocked, so no HTTP call could reach the deployed function.
  First real test: open app → ZaffyChat → "2 kg aam aur 1 litre doodh chahiye".
- ⛔ Expired-JWT-refresh path in the deployed function (app refreshes tokens
  client-side via `ensureFreshSession`; function handles 401 honestly).
- ⛔ Merchant bulk flow against real merchant identity (mocked DB only).
- Prompt-injection corpus tests: rules are in the system prompt + untrusted-data
  framing; adversarial corpus not yet run.

## 7. Deployment / rollback

- Migration already applied to live DB (idempotent statements; re-run safe).
  Rollback: `DROP TABLE` the 8 zaffy_* tables (additive only, no business table touched).
- Function v14 deployed; rollback = redeploy prior body from git history
  (`git show <prev>:supabase/functions/zaffy-ai-assistant/index.ts`).
- Mobile ships via the normal PR → merge → Vercel/EAS pipeline.

## 8. Environment variables / secrets (server-side only; none committed)

Already present: GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY (+ *_MODEL),
ALLOW_ZAFFY_ANON, RAZORPAY_KEY_ID/SECRET, SUPABASE_* (managed).
New optional (all defaulted): AI_DEFAULT_PROVIDER=gemini, AI_MODEL_NAME='',
AI_MAX_OUTPUT_TOKENS=800, AI_REQUEST_TIMEOUT_MS=25000, AI_MAX_CONTEXT_MESSAGES=12.
Future proprietary model: set AI_DEFAULT_PROVIDER=zaffy + add ZaffyProvider.

## 9. Known limitations / next phase candidates

- In-memory rate limiter resets per isolate (DB limiter covers it).
- Streaming responses: not implemented (JSON protocol is single-shot per round).
- Memory extraction is deterministic-pattern only (name/dietary/brand); richer
  LLM-assisted extraction is future work, kept behind `user_approved`.
- Voice: out of scope phase one (provider interface is extensible).
- Rider-role chat: role resolves but no rider-specific tools yet (deny-by-default).
