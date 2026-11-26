# Zaff Product Data Platform — Technical Blueprint (v1, implemented)

Status: **foundation LIVE in production** (Supabase) as of 2026-11-26.
Blueprint agreed with founder; every rule below is enforced in code, not just documented.

## What it is

A background pipeline that builds Zaff's product catalog from **free, licensed
sources** with **AI text enrichment**, **full provenance**, and **controlled
autonomy** (auto-publish only when verified; everything uncertain waits for an
admin). Image files are headed to **Cloudflare R2** as the primary library
(Supabase Storage remains for user uploads / private docs).

## Architecture (3-way separation — founder decision)

| Layer | Store | Contains |
|---|---|---|
| Metadata | PostgreSQL (Supabase) | names, barcodes, categories, licenses, verification state |
| Images | Cloudflare R2 (+ CDN) | original masters; creds never leave edge secrets |
| Access | Zaff Product API (edge functions) | authorized data + public image URLs |

## Database (migration 012)

- `products` + `hi_name`, `source_system` (default `seller`), `verification_status`
  (`unverified | auto_published | needs_review`).
- `catalog_ingest_queue` — job types: `off_barcode`, `off_search`,
  `wikimedia_image`, `image_generation`, `merge_check`. RLS on, service-role only.
- `product_provenance` — append-only: source, source_id, license, attribution,
  raw JSON snapshot. (ODbL / CC BY-SA compliance evidence.)
- `product_images` — kind `real|generated|seller`, `ai_generated` flag, license,
  status `approved|pending_review|rejected`. Public reads approved rows only.
- `catalog_merge_suggestions` — duplicates become suggestions; **never** an
  automatic destructive merge.

## Worker: `catalog-ingest` edge function (LIVE, v5)

Flow per job: claim batch (CAS `pending→processing`) → Open Food Facts fetch →
AI text enrichment (Groq `openai/gpt-oss-120b` verified working; Gemini /
OpenRouter fallbacks coded) → dedupe by barcode (existing rows get gap-fill
only) → insert product + provenance + image → job `done`.

**Hard rules (enforced):**
1. AI outputs a text-only JSON contract — it has **no field** for barcode /
   brand / MRP / weight / nutrition, so it cannot publish invented facts.
2. Category must exist in the real `categories` table; if the AI's pick is not
   in the list → `needs_review` (never live).
3. No LLM-verified category ⇒ product inserted under fallback category but
   **always** `needs_review` + `is_active=false`.
4. Branded product without a real image ⇒ `needs_review` (AI-generated branded
   packaging is **prohibited**).
5. Unbranded product without image ⇒ Wikimedia Commons fallback job; Commons
   results are accepted only with a CC / Public-domain license (unclear
   license ⇒ reject).
6. Every outbound fetch is time-bounded (15s source / 20s LLM / 30s R2 PUT) —
   a hung upstream cannot wedge the queue.

**Scheduler:** pg_cron job `zaff-catalog-ingest-kick` (`*/30 * * * *`) fires
pg_net POST → function. Token: secret `CATALOG_INGEST_TOKEN` (also embedded in
the cron command; cron.job readable by postgres role only).

**Image mirroring (R2):** when `R2_*` secrets are set, every licensed image is
copied into R2 (`products/<uuid>/<hash>.<ext>`) and public URLs point at
`R2_PUBLIC_BASE`; when unset, licensed remote URLs are used — no failure, no
policy change. Mirroring is non-blocking and recorded in job results
(`r2_mirrored`) and provenance.

## Delivering fast images (founder's 5 technologies)

- **Masters in R2** — original archival file per product.
- **Variants:** listing 200×200, detail 600×600 — serve via Cloudflare image
  transformation on the custom domain (verify current free-tier transformation
  allowance before enabling; store masters only for now).
- **CDN cache** via Cloudflare; repeat views never hit origin.
- **Lazy loading** in app (expo-image default caching + `loading` placeholders).
- **Responsive sizes** at the delivery layer, not extra storage objects.

## Founder setup checklist (to activate R2 mirroring)

1. Cloudflare dashboard → R2 → create bucket (e.g. `zaff-product-images`).
2. R2 → API tokens → Object Read & Write token scoped to the bucket.
3. Supabase → Edge Function secrets → set:
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
   `R2_PUBLIC_BASE` (custom domain e.g. `https://images.zaffit.in`, or the
   r2.dev public URL).
4. (Recommended) Cloudflare custom domain on the bucket → CDN caching.
5. Seed work: `INSERT INTO catalog_ingest_queue (job_type, payload, priority)
   VALUES ('off_barcode', '{"barcode":"<upc>"}', 50);` — the 30-min cron picks
   it up; or trigger manually:
   `curl -X POST $SUPABASE_URL/functions/v1/catalog-ingest -H "x-ingest-token: $TOKEN" -d '{"limit":10}'`.

Cost guard (founder's caveat): R2 free tier = 10 GB storage + free egress;
beyond that $0.015/GB-month. Batch ≤ 20 jobs/run; cron runs twice hourly.

## Phase plan

- **Phase 1 (now):** Grocery / fruits / vegetables / FMCG / dairy via OFF barcodes.
- **Phase 2:** Beauty & household (Open Beauty Facts) + bulk dataset imports.
- **Phase 3:** Electronics / fashion / furniture — seller-first + AI generic images.
- Image generation queue (`image_generation` job type reserved; FLUX/SD on
  RTX 3050 is optional background work, never a launch dependency).
- Public Product API for external developers: served from the same provenance-
  tagged tables once admin review tooling lands.

## Operations

- Queue health: `SELECT status, count(*) FROM catalog_ingest_queue GROUP BY 1;`
- Review queue: `SELECT * FROM products WHERE verification_status='needs_review';`
- Retry a failed job: `UPDATE catalog_ingest_queue SET status='pending', last_error=NULL WHERE id='…';`
- Provenance audit for one product: `SELECT * FROM product_provenance WHERE product_id='…';`
