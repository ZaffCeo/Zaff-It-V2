# Zaff Product Data Platform — Multi-Source Discovery & Meta Integration Research
**ZaffmIND Technologies · Research mission deliverables · 2026-11-26**
*(All volatile facts verified against official/current pages Nov 2026; unverified claims are explicitly marked ⚠️. Complements `docs/product-data-platform.md` v1.)*

---

## 1. Executive Recommendation

**Zaff ka independent catalog build karna 100% feasible hai — ₹0 budget se.** Lekin research ne 4Founder assumptions correct kiye:

1. **Bing Search API ab exist hi nahi karta** — Microsoft ne Aug 11, 2025 ko retire kar diya. Kabhi build na karein.
2. **Google Custom Search API naye customers ke liye band hai, Jan 1, 2027 ko poora shut down.** Google search results pe dependent architecture = dead end. Ye blessing hai: Zaff ko kisi bhi search engine pe dependent hona hi nahi hai.
3. **OpenMRP "open data" nahi hai** — ye ek commercial ERP SaaS hai (api.openmrp.ai, bearer-token API). ⚠️ Iska free quota/redistribution license verified nahi; ise paid B2B source maano, open dataset nahi.
4. **Unsplash images R2 me store nahi kar sakte** — API terms hotlinking mandatorily kehte hain. Pixabay/Wikimedia/OFF/Flickr-via-Openverse store kar sakte hain.

**Recommended stack (verified working in our prod already):** PostgreSQL/Supabase (source of truth) + Cloudflare R2 (images) + Open Food Facts (barcoded food) + AGMARKNET (mandi prices, Govt of India, free) + Wikimedia Commons/Openverse/Pixabay (licensed images) + Groq free LLM chain (already enriching Nutella → नुटेला today) + Supabase FTS (search) + pgvector (dedupe). Zero new monthly cost.

**Discovery ≠ permission:** search APIs sirf *URLs/kahaan dhoona hai* batate hain; underlying content ka license alag matter hai. Har stored record ke saath source + license + attribution store karna (jo hum already kar rahe hain) yahi iska jawab hai.

---

## 2. Search Provider Comparison (all verified Nov 2026)

| Provider | Official API | Free quota (current) | Card? | Commercial rights | Images | Prices | Storage/Redistribution for Zaff DB | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Bing Search APIs** | — | — | — | — | — | — | — | ❌ **RETIRED 11 Aug 2025**, decommissioned |
| **Google Custom Search JSON** | Yes (legacy) | 100/day (existing customers only) | No | Limited ToS | Images vertical | No | Snippets/links only; **API shuts 1 Jan 2027; closed to new signups** | ❌ Dead end |
| **Brave Search API** | Yes | $5 monthly credits ≈ 1,000 queries (free tier killed Feb 2026) | **Yes** | Paid plans grant storage/LLM rights; free credits = eval use | Yes (image vertical) | Partial (shopping snippets) | Paid tier: results storage allowed per plan; **redistribute snippets via own API = negotiable, not default** | ⚠️ Backup only ($5/1000 q) |
| **DuckDuckGo** | **No official API** | — | — | ToS prohibits automated extraction | — | No | ⚠️ Unofficial libs (ddgs) violate ToS for commercial storage; results originate from Bing/others | ❌ Not for master catalog |
| **SerpAPI** | Yes | 250 searches/month (recurring) | No | SERP data is Google's; display/redistribution restricted | Yes | Partial | ⚠️ Good for *discovery*, not for copying content into DB | ⚠️ Discovery-only |
| **Serper** | Yes | 2,500 queries (one-time), then ~$0.30–1.00/1k | No | Same Google-SERP restrictions | Yes | Partial | Same as SerpAPI | ⚠️ Discovery-only |
| **Tavily** | Yes | 1,000 credits/month (recurring) | No | Snippets for AI agents; content rights remain with origin sites | No | No | Same discovery-only rule | ⚠️ Discovery-only |
| **Firecrawl** | Yes | 1,000 credits/month (recurring) | No | Scrapes arbitrary pages — target site's own terms govern | via scrape | via scrape | Only store what the *target site's license* permits | ⚠️ For scraping sites that permit it (e.g., govt/CC sites) |
| **Exa** | Yes | Trial credits (one-time) | No | Neural search; contents billed separately | No | No | Same as above | Optional later |

**Conclusion (important legal point):** Search providers' results (titles/snippets) me copyright underlying site ka hota hai. Zaff pipeline me search APIs sirf **link discovery** ke liye; actual product facts CC/ODbL/GODL sources (OFF, govt data, brand feeds, sellers) se aayenge. Brave paid tier ek practical "find me retailer pages for X barcode" layer hai — ₹420/1000 queries, sirf URL discovery.

---

## 3. Product Image Source Comparison (verified Nov 2026)

| Source | API | Free quota | License | Store copy in R2? | Attribution | Notes |
|---|---|---|---|---|---|---|
| **Open Food Facts / Beauty / Pet Food** | Yes (v2, free) | Fair-use, no hard cap published | DB = ODbL; images = CC BY-SA 4.0 | ✅ Yes | © OFF contributors | Already LIVE in our worker. ODbL = share-alike on the *database*, attribution mandatory. Images CC BY-SA = commercial OK with attribution + same-license share |
| **Wikimedia Commons** | Yes (MediaWiki API, no key) | ~200 req/min with proper User-Agent | Per-file CC / Public domain | ✅ Yes | File artist + license | Already LIVE (license-filtered: only CC/PD accepted) |
| **Openverse** | Yes (no key) | Anonymous 20/min + 200/day; OAuth app 100/min + 10k/day; enhanced 20k/day on request | Per-item CC/PD only | ✅ Yes (item license governs) | "Made with Openverse" + item attribution | Aggregates 700M+ CC items incl. Flickr, museums. Terms reserve right to charge heavy commercial use |
| **Pixabay** | Yes (key) | 100 req/60s; 24h cache rule | Pixabay Content License (commercial OK) | ✅ Yes (hotlinking actually forbidden → own copy is the intended use) | Not required | ❌ No scraping for ML training |
| **Unsplash** | Yes (key) | 50/hr demo → 1,000/hr production (approval) | Unsplash License | ❌ **NO** — must hotlink `photo.urls` for every use | Requested | AI/ML use only via Datasets program. Display-only usage |
| **Pexels** | Yes | 200/hr + 20k/mo — ⚠️ **new API keys currently paused** | Pexels License (commercial OK) | ✅ Yes | Not required | Re-check key availability before integrating |
| **Brand/manufacturer feeds** | Varies | — | Brand's own terms | Case-by-case | — | Best for branded packaging; needs per-brand agreements |
| **Zaff seller uploads** | Our app | — | Zaff-owned / seller-granted | ✅ Yes | Seller credit | Golden source for Makrana local products |
| **AI-generated generic** | Our pipeline | — | Zaff-owned; *model license governs* (FLUX-schnell Apache 2.0, SD community models vary ⚠️ verify per-model) | ✅ Yes | "AI-generated" flag | Only unbranded/generic produce; branded packaging PROHIBITED (already enforced in worker) |

**Image validation rules (already enforced in code, restated):** branded = real exact-product photo; generic produce = AI-OK; never unrelated-brand substitute; never strip watermarks; every image row stores source, original URL, creator, license, attribution, retrieval date, approval status, `ai_generated` flag; masters + optimized variants separated (R2 master + CDN 200px/600px WebP/AVIF transforms).

---

## 4. Price Source Comparison (verified Nov 2026)

| Source | Coverage | Freshness | Free? | Commercial rights | Verdict |
|---|---|---|---|---|---|
| **AGMARKNET via data.gov.in** | 3,000+ mandis, agri commodities; state/district/market/variety/grade; min/modal/max ₹/quintal | Daily (mandi-reported) | ✅ Free API key (data.gov.in register) | Government Open Data License – India (GODL): share + adapt + commercial WITH attribution | ✅ **P1 implement** — resource `9ef84268-d588-465a-a308-a864a43d0070` (current daily mandi), variety-wise resource `35985678-0d79-46b4-9ed6-6f13308a1d24` |
| **Open Food Facts** | Packaged food (no prices in most markets) | Static | ✅ | ODbL | ⚠️ Prices sparse; use for product facts, not prices |
| **OpenMRP (openmrp.ai)** | ⚠️ It is a **commercial ERP SaaS** (items/BOM/purchasing API with bearer key), NOT an open MRP database. India-barcode lookup exists (community usage) but terms/pricing unverified | — | ⚠️ Unverified | ⚠️ Assume proprietary | ❌ Do not build on it without a contract |
| **data.gov.in (other datasets)** | Consumer price indices, e-challan, etc. | Varies | ✅ | GODL | ✅ Secondary |
| **JioMart / Blinkit / Zepto** | Grocery retail prices | Live | ❌ No public API | ToS prohibit scraping | ❌ No legitimate route; only formal partnerships |
| **Amazon Product Advertising API** | Amazon catalog + prices | Live | API free, **requires working Amazon Associates account** (must drive sales) | **Affiliate-display only — redistribution in your own catalog/API is prohibited** | ❌ Not for master catalog |
| **Flipkart Affiliate API** | — | — | — | Program effectively closed to new partners | ❌ |
| **Rewalto / retail data vendors** | India retail prices, paid | Varies | ❌ Paid | Per contract | ⚠️ Only when revenue justifies (Phase 3+) |
| **Manufacturer MRP** (printed on pack, seller-entered) | India-wide | Until repack | ✅ (facts) | MRP is a statutory fact — not copyrightable | ✅ Seller-submitted MRP = primary for packaged goods |
| **Zaff own transactions** | Makrana | Live | ✅ Ours | Ours | ✅ Zaff selling price source of truth |

**Price-type discipline (immutable rule):** `price_type` enum — `mrp | manufacturer_suggested | mandi_wholesale | retail_reference | ecommerce_listing | local_vendor | zaff_selling | historical` — never mixed; every row carries product_id, type, amount+currency, unit/pack, location (pincode/mandi), source + source_record_id, captured_at, verified_at, license, confidence, verification_status. Stale prices are never shown as live (expiry window per type: mandi = report-date-bound, MRP = until repack, e-com = 48h then stale).

---

## 5. Meta Ecosystem & Model Comparison

### A. WhatsApp Business Platform (Cloud API) — India rates verified (post-July-1-2025 per-message model)
| Item | Rate / rule |
|---|---|
| Setup | Free (Meta direct, no BSP needed technically; BSPs add fees) |
| Service messages (replies inside customer-initiated 24h window) | **Free** (+1,000 free service msgs/month per number) |
| Utility template (order confirm, delivery update) | ~₹0.115–0.13/msg; **free if sent inside the 24h CSW** |
| Authentication template (OTP) | ~₹0.115/msg (⚠️ sources vary; check Meta rate card) |
| Marketing template | ~₹0.86–0.88/msg (never free) |
| Click-to-WhatsApp ad entry | 72h free window |
| Rules | Template approval required; customer opt-in mandatory for business-initiated; rate limits scale with quality rating (Tier: 1k→10k→100k/day) |
| **Zaff design** | Order confirm + ready-for-pickup + delivered = utility templates (₹0.115 each, or ₹0 inside CSW) — subscribe to Cloud API webhooks, reuse our STATUS_NOTIFY map. OTP stays on Firebase (₹0 via test numbers) — WhatsApp auth as fallback only |

### B. Instagram Graph API
Business/Creator account linked to a Facebook Page required; app review for `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages`. Free. Publish products/reels, read comments (catalog discovery of local demand), DM via Messaging API. Realistic for Zaff: auto-post deals + comment-to-DM support later.

### C. Facebook Graph + Marketing API
Page management, local awareness: free API access; **ads require budget**. Conversions API (server-side events) free — useful when we run paid ads (Phase 3+). Nothing here blocks free-tier launch.

### D. Meta Llama (models)
| Aspect | Detail |
|---|---|
| License | Llama Community License: commercial ✅ **below 700M MAU**; naming rule ("Built with Llama"); Acceptable Use Policy binds |
| Fits founder's RTX 3050 4GB | **Llama 3.2 3B Q4** (~2 GB) ✅ smooth; 7–8B Q4 (~4.5 GB) ❌ VRAM overflow (CPU-offload = slow, not a service). Truth: this laptop is a *test bench*, not production inference |
| Production path | Already running: **Groq free tier** (gpt-oss-120b enriching our catalog today) → Gemini free tier → OpenRouter free models. Local Llama = offline fallback only |

### E. Meta SAM / SAM 2 (Segment Anything)
Apache 2.0 (code + weights; ⚠️ verify exact checkpoint license in facebookresearch/sam2 before shipping). Use: product-photo background removal, catalog photo cleanup on CPU/GPU batch. **NOT** a barcode scanner or product recognizer — never position it as one. Runs: SAM2 tiny ~40MB, workable on 4GB VRAM for single images.

### F. Meta Content Library
Access restricted to approved academic researchers/nonprofits (via ICPSR). **No legitimate commercial use for Zaff catalog ingestion — excluded.**

---

## 6. License & Commercial Usage Matrix (decision table)

| Data source | License | Commercial use | Store | Redistribute via Zaff API | Attribution obligation |
|---|---|---|---|---|---|
| OFF / OBF / OPFF | ODbL (DB) / CC BY-SA (images) | ✅ | ✅ with share-alike on DB extracts | ✅ with attribution & share-alike | © OFF contributors |
| Wikimedia Commons | Per-file CC/PD | ✅ | ✅ | ✅ per-file license | Artist + license |
| Openverse items | CC/PD | ✅ | ✅ | ✅ | + "Made with Openverse" |
| Pixabay | Pixabay License | ✅ | ✅ | ✅ (not as stock-service dump) | None |
| Unsplash | Unsplash License | Display ✅ | ❌ hotlink-only | ⚠️ API-terms-limited | Requested |
| data.gov.in / AGMARKNET | GODL-India | ✅ | ✅ | ✅ with attribution | "Source: AGMARKNET, Dept. of Agriculture & Farmers Welfare" |
| Google/Bing/DDG/SerpAPI/Serper/Tavily results | Provider ToS + underlying site copyright | ⚠️ discovery only | ❌ content | ❌ | — |
| Amazon PA-API | Affiliate-display only | ❌ in own catalog | ❌ | ❌ | Link compliance |
| OpenMRP | ⚠️ Proprietary SaaS | Contract needed | ❌ default | ❌ default | — |
| Llama weights | Llama Community License | ✅ <700M MAU | ✅ | Model outputs ours | "Built with Llama" |
| SAM2 | Apache 2.0 | ✅ | ✅ | ✅ | NOTICE file |

---

## 7. Recommended Architecture (verified pieces already live in bold)

```
                        ┌────────────────────────────────────────────────┐
   DISCOVERY            │  OFF barcodes ✓LIVE · AGMARKNET cron (P1)      │
   (licensed only) ───▶ │  Wikimedia ✓LIVE · Openverse · Pixabay · sellers│
                        └───────────────┬────────────────────────────────┘
                                        ▼
                        ┌────────────────────────────────────────────────┐
   QUEUE                │ catalog_ingest_queue ✓LIVE (pg_cron→pg_net     │
                        │ → edge fn, 30min) + image_generation + prices  │
                        └───────────────┬────────────────────────────────┘
                                        ▼
                        ┌────────────────────────────────────────────────┐
   AI AGENTS            │ Groq gpt-oss-120b ✓LIVE → Gemini → OpenRouter   │
   (text-only contract) │ local Llama-3.2-3B = offline fallback · SAM2    │
                        └───────────────┬────────────────────────────────┘
                                        ▼
   ┌────────────────────┐   ┌────────────────────────────────────────────────┐
   │ CLOUDFLARE R2 ✓KEY │   │ POSTGRES (Supabase) = SOURCE OF TRUTH ✓LIVE     │
   │ masters + CDN      │◀──│ products·variants·barcodes·brands·categories    │
   │ 200px/600px WebP   │   │ product_images ✓·provenance ✓·prices(P1)·       │
   └────────────────────┘   │ sources·source_licenses·mappings·               │
                            │ ingestion_jobs ✓·verification_queue·            │
   ┌────────────────────┐   │ change_history·api_clients·api_usage_logs       │
   │ SEARCH: Supabase   │   └───────────────┬────────────────────────────────┘
   │ FTS now, pgvector  │                   ▼
   │ dedupe; Meili/Qdr  │   ┌────────────────────────────────────────────────┐
   │ only at scale (C)  │   │ ZAFF PRODUCT API (FastAPI/edge, P3)             │
   └────────────────────┘   │ /v1/products·barcode·categories·reference-prices│
                            └────────────────────────────────────────────────┘
```

**Separation of truths:** master product facts = Zaff-owned; seller prices/inventory/offers live in Zaff-It ops tables (never merged into master); every master row immutable-attributed + change_history appended.

---

## 8. Database Schema Proposal (delta on migration 012 — tables marked ✓ exist)

```sql
-- Permanent public ID: ZP-000000001 (assigned on approval, never reused)
create sequence if not exists zaff_product_id_seq;
alter table products add column if not exists zaff_product_id text
  unique generated always as ('ZP-' || lpad(nextval('zaff_product_id_seq')::text, 9, '0')) stored;
-- (apply only to approved rows via partial trigger; draft rows stay NULL)

create table product_variants (            -- pack sizes/sizes/colors
  id uuid pk default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  variant_name text not null, barcode text, unit_label text not null,
  attributes jsonb not null default '{}', is_default boolean default false,
  created_at timestamptz default now(), unique (product_id, variant_name));

create table barcodes (                    -- EAN/UPC/GTIN many-to-one
  barcode text pk, product_id uuid not null references products(id),
  variant_id uuid, source_system text not null, verified boolean default false,
  created_at timestamptz default now());

create table brands (id uuid pk, slug text unique, name text not null,
  hi_name text, logo_url text, is_verified boolean default false);

create table product_attributes (          -- normalized specs
  id uuid pk, product_id uuid not null references products(id),
  attribute_key text not null, attribute_value text not null,
  source_system text, confidence numeric default 0.5,
  verification_status text default 'unverified',
  unique (product_id, attribute_key));

create table product_prices (              -- price types NEVER mixed (see §4)
  id uuid pk, product_id uuid not null references products(id), variant_id uuid,
  price_type text not null check (price_type in ('mrp','manufacturer_suggested',
    'mandi_wholesale','retail_reference','ecommerce_listing','local_vendor',
    'zaff_selling','historical')),
  amount_paise integer not null, currency text default 'INR',
  unit_label text, location_type text check (location_type in
    ('pincode','district','mandi','national')), location_value text,
  source_system text not null, source_record_id text,
  captured_at timestamptz not null default now(),
  verified_at timestamptz, valid_until timestamptz,
  license text, confidence numeric default 0.5,
  verification_status text default 'unverified');
create index on product_prices (product_id, price_type, captured_at desc);

create table sources (id uuid pk, slug text unique, name text,
  base_url text, license_slug text, attribution_template text,
  is_enabled boolean default true);
create table source_licenses (slug text pk, name text, commercial_use boolean,
  attribution_required boolean, share_alike boolean, summary text, reference_url text);
create table source_product_mappings (     -- every external identity link
  id uuid pk, product_id uuid, source_slug text, source_id text,
  url text, fetched_at timestamptz, unique (source_slug, source_id));

-- ingestion_jobs ≈ catalog_ingest_queue ✓ (add job_type 'agmarknet_price')
-- verification_queue: products.verification_status ✓ + admin UI (P1)
create table change_history (              -- immutable audit of every edit
  id uuid pk, entity text not null, entity_id uuid not null,
  actor text, diff jsonb not null, created_at timestamptz default now());
create table api_clients (id uuid pk, name text, key_hash text not null,
  plan text default 'free', rate_limit_per_min int default 60,
  is_active boolean default true, created_at timestamptz default now());
create table api_usage_logs (id bigint generated always as identity pk,
  client_id uuid, endpoint text, status_code int, latency_ms int,
  created_at timestamptz default now());
```

---

## 9. AI Catalog Agent Workflow (15 steps, controlled autonomy)

1. Discover (licensed source only) → 2. Extract structured fields (source-side, not AI) → 3. Normalize names (LLM text-only) → 4. Translate hi/en (+ optional regional) → 5. Brand/category/variant classification (against real table slugs only) → 6. Barcode/GTIN match → 7. Duplicate detection (barcode exact → pgvector embedding cosine ≥0.92 → LLM tie-break) → 8. Image comparison (perceptual hash first; SAM2 cleanup only) → 9. License check (allow-list from `source_licenses`) → 10. Price/timestamp validation (schema §4) → 11. Enrich missing text (LLM, never numeric/identity facts) → 12. Confidence score (weighted: source trust 0.4 + completeness 0.3 + match quality 0.2 + freshness 0.1) → 13. Uncertain ⇒ verification_queue (admin approval UI) → 14. Eligible ⇒ publish + assign ZP-ID → 15. Every mutation ⇒ change_history.
**Invention firewall (already enforced):** LLM JSON contract has no barcode/MRP/weight/nutrition fields; numeric+identity facts flow only from source APIs.

## 10. Image Ingestion & Verification Workflow
Source fetch → license filter (CC/PD/brand-approved only) → size/type validation (1KB–15MB, image/*) → perceptual-hash duplicate check → R2 master store ✓ (key: `products/<uuid>/<hash>.ext`) → CDN transforms (200px listing / 600px detail WebP+AVIF) → AI-generic only for unbranded (flagged, prompt stored) → admin approval for `pending_review` → hotlink-only sources (Unsplash) rendered directly, never mirrored.

## 11. Price Discovery & Validation Workflow
AGMARKNET daily cron (commodity+variety+grade+mandi+date matched, ₹/quintal → per-kg normalize with unit guard) → MRP from OFF `quantity`/seller entry (statutory fact) → local vendor submissions (app) → Zaff transaction price (own orders) → validate (type-specific bounds, freshness window) → confidence score → publish only `verified`; stale rows auto-downgraded, never presented as live.

## 12. Public Zaff Product API v1 (design)
| Endpoint | Notes |
|---|---|
| `GET /v1/products?cursor=&limit=` | keyset pagination, max 100 |
| `GET /v1/products/{zp_id}` | ZP-000000001 |
| `GET /v1/products/barcode/{code}` | EAN/UPC |
| `GET /v1/categories` · `GET /v1/brands` | reference data |
| `GET /v1/products/{id}/images` | approved images + license + attribution |
| `GET /v1/products/{id}/reference-prices` | price_type-filtered, stale excluded |

Auth: `Authorization: Bearer zp_live_…` — **stored hashed** (SHA-256, never plaintext); plans: free (60 req/min, 10k/day) / growth / commercial (redistribution contract required). Cache: CDN 5-min on public GETs + `ETag`. Versioning: URL path `/v1/`. Abuse: per-key rate limit (Postgres counter window), IP burst guard, key revocation flag, usage logs every call. Never exposed: seller costs, customer data, private inventory, unapproved source content.

## 13. Security & Abuse-Prevention Rules
Hashed keys only · service-role isolation (RLS verified 37+ tables) · per-client quotas + daily budget · anomaly alerts (PostHog free 1M events/mo ✓) · read-only public API (writes via admin only) · attribution embedded in responses (license compliance travels with data) · rate-limit 429 + Retry-After · webhook HMAC for outbound · secrets only in Supabase/Vercel vaults, never client.

## 14. Three Cost Scenarios (monthly, current official prices)

**A. Zero/near-zero MVP (Phase 1–2) — ₹0**
Supabase Free (500MB DB, 500k fn invocations) · R2 Free 10GB + free egress · Groq Free (LLM ✓ already proving it) · Tavily 1k + SerpAPI 250 + Brave $5-credit + Serper 2500 one-time (discovery) · data.gov.in Free · Sentry Free 5k errors · PostHog Free 1M events · Supabase FTS + pgvector (no Meili/Qdrant yet) · pg_cron ₹0. **Real risk: Supabase free projects pause after 1 week inactivity → keep cron traffic (we already have 3 jobs).**

**B. Low-cost production (~$30–45/mo ≈ ₹2,600–3,900)**
Supabase Pro $25 (8GB, no pause) · R2 ~$0–2 (10–100GB) · Brave Search ~$5 (~1k queries) · Groq paid pennies (fallback) · domain+CDN ₹100 · everything else stays free-tier.

**C. Scalable commercial (~$150–400/mo)**
Supabase Pro + compute add-ons · Meilisearch Cloud €30–50 or self-host on VPS $10 · Qdrant Cloud $25–50 (or pgvector longer) · R2 100–500GB ~$2–8 · Brave/Tavily paid quotas $10–30 · Sentry Team $29 · Redis (Upstash PAYG) · FastAPI service on VPS $12–24.

## 15. Phased Implementation Roadmap
- **P0 ✅ DONE (migration 012 + worker v5):** provenance, queue, OFF→LLM→publish E2E, R2-mirror-ready, 30-min cron.
- **P1 (next):** schema delta §8 applied (ZP-ID, variants, barcodes, prices, sources/licenses, change_history) · AGMARKNET price jobs · admin verification/review web UI · Meilisearch-free Supabase FTS app search.
- **P2:** Openverse/Pixabay image jobs + seller photo upload pipeline · WhatsApp Cloud API utility notifications (order lifecycle) · coupon/flash UI (pending P1 backlog).
- **P3:** Public API v1 + api_clients (FastAPI or Supabase edge + custom domain) · OpenMRP-style vendor contracts if ever needed · Amazon/JioMart only via formal partnerships.
- **P4:** pgvector dedupe polish + SAM2 image cleanup + recommendations feeding get_recommended_products.

## 16. Exact Tools / Links
OFF API https://world.openfoodfacts.org/data · data.gov.in https://data.gov.in (register → API key; resource `9ef84268-d588-465a-a308-a864a43d0070`) · Openverse https://api.openverse.org/v1/images/?license_type=commercial · Commons API https://commons.wikimedia.org/w/api.php · Pixabay https://pixabay.com/api/docs/ · Brave https://brave.com/search/api/ · Tavily https://tavily.com · SerpAPI https://serpapi.com · R2 https://developers.cloudflare.com/r2/ · Groq https://console.groq.com · WhatsApp Cloud API https://developers.facebook.com/docs/whatsapp/cloud-api · Instagram Graph https://developers.facebook.com/docs/instagram-platform · SAM2 https://github.com/facebookresearch/sam2 · Ollama https://ollama.com · aws4fetch (in prod ✓) · Supabase FTS/pgvector (in prod ✓).

## 17. Risks, Limitations, Alternatives
| Risk | Mitigation |
|---|---|
| ODbL share-alike contaminates proprietary DB | Keep third-party DB extracts separable (provenance rows ✓); derived DB = Zaff's own schema+additions, attribution kept |
| Govt API downtime | Cache last-good mandi prices; mark data-date prominently |
| Free tiers change (Brave killed free Feb 2026; Google CSE dying 2027) | Vendor-independent design ✓; discovery layer swappable |
| Unsplash hotlink mandate | Exclude from store-pipeline; Pixabay/Commons cover |
| OpenMRP confusion | Treated as paid vendor only |
| 4GB VRAM laptop | Test-bench only; production = Groq/Gemini free chain (already live) |
| WhatsApp auth pricing drift | OTP stays Firebase; WhatsApp = notifications first |
| Supabase free pause | Cron traffic ✓ + P-B upgrade at revenue |

## 18. Prioritized Implementation Checklist
1. ✅ Migration 013 applied+verified (2026-11-26): ZP-ID trigger, variants, barcodes, attributes, product_prices, mandi_prices, sources/licenses seeded, change_history, api_clients, approve_catalog_product RPC, catalog_review_queue view
2. ✅ agmarknet_price job type added (queue constraint + worker v6 handler; dormant until DATA_GOV_IN_API_KEY secret — founder registers free at data.gov.in)
3. ✅ CatalogReviewScreen live in admin app (Catalog tab) — RLS-guarded, RPC-backed
4. ✅ ZP-ID trigger E2E tested: needs_review→admin_verified assigned ZP-000000001 (test cleaned, sequence reset)
5. ☐ WhatsApp Cloud API app + 2 utility templates (order confirm, out-for-delivery)
6. ☐ Openverse job type (higher-volume image fallback)
7. ☐ Seller photo upload → R2 signed-URL flow
8. ☐ Supabase FTS search endpoint for app
9. ☐ Public API v1 skeleton + hashed API keys
10. ☐ change_history writer + admin audit view
11. ☐ PostHog/Sentry wiring on catalog worker errors
12. ☐ Phase-3 decision gate: Meilisearch/Qdrant only after >50k SKUs or >100 API clients
