/**
 * Zaff Product Data Platform — catalog-ingest worker
 *
 * Founder policy (Nov 2026):
 *  - Sources: Open Food Facts first (free, ODbL/CC BY-SA). Wikimedia Commons
 *    fallback for generic unbranded items. Seller uploads remain the golden source.
 *  - AI (Gemini -> Groq -> OpenRouter chain) ONLY normalizes text fields
 *    (clean name, Hindi name, category pick from the real category table,
 *    short description). AI NEVER invents barcode / brand / MRP / weight /
 *    nutrition. Numeric + identity facts come exclusively from the source API.
 *  - Images: real source images preferred. Branded products keep the real
 *    packaging image (AI-generated branded packaging PROHIBITED). Unbranded
 *    items without an image get a wikimedia_image job; if Commons fails too,
 *    they stay needs_review for the (optional, later) generation queue.
 *  - Autonomy: verified+complete -> products.verification_status =
 *    'auto_published'; anything uncertain -> 'needs_review' (is_active=false
 *    until an admin approves). Duplicates -> catalog_merge_suggestions only.
 *
 * Invocation: pg_cron -> pg_net HTTP POST (x-ingest-token) or manual curl.
 * Auth: shared secret CATALOG_INGEST_TOKEN (verify_jwt=false + token check).
 */
import { createClient } from 'npm:@supabase/supabase-js@^2.49.0';
import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { z } from 'npm:zod@^3.24.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OFF_BASE = 'https://world.openfoodfacts.org';
const OFF_LICENSE = 'ODbL (database) / CC BY-SA 4.0 (images)';
const OFF_ATTRIBUTION = 'Data and images © Open Food Facts contributors (CC BY-SA 4.0)';
const USER_AGENT = 'ZAFF-IT-CatalogBot/1.0 (zaff.founder@gmail.com)';

const GEMINI_FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const OPENROUTER_FALLBACK_MODELS = ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-lightning:free'];

// All outbound fetches are time-bounded: a hung upstream (OFF API, LLM, R2)
// must never wedge a claimed queue job.
const FETCH_TIMEOUT_MS = 15000;
const LLM_TIMEOUT_MS = 20000;
const PUT_TIMEOUT_MS = 30000;

const bodySchema = z.object({ limit: z.number().int().min(1).max(20).default(5) }).strict();

// ---------------------------------------------------------------------------
// Cloudflare R2 image library (primary storage for the Product Data Platform).
// Founder verdict (Nov 2026): R2 primary for catalog images (10 GB free,
// zero egress), Supabase Storage stays for user uploads/private docs.
// Credentials live ONLY in edge-function secrets — never in the app or any
// public API response. Public serving happens through R2_PUBLIC_BASE
// (custom domain through Cloudflare CDN when configured).
// When unconfigured, workers keep the licensed remote source URL — no failure.
// ---------------------------------------------------------------------------
type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicBase: string };

function r2Config(): R2Config | null {
  const accountId = Deno.env.get('R2_ACCOUNT_ID');
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const bucket = Deno.env.get('R2_BUCKET');
  const publicBase = Deno.env.get('R2_PUBLIC_BASE');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase: publicBase.replace(/\/+$/, '') };
}

// Mirror a licensed source image into R2 and return the public CDN URL.
// Non-blocking by design: any failure returns null and the caller keeps the
// remote source URL (provenance + license travel with the record either way).
async function mirrorToR2(cfg: R2Config, productId: string, sourceUrl: string): Promise<string | null> {
  try {
    const r = await fetch(sourceUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength < 1024 || bytes.byteLength > 15 * 1024 * 1024) return null;
    const contentType = r.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest).slice(0, 4))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    const key = `products/${productId}/${hash}.${ext}`;
    const client = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      service: 's3',
      region: 'auto',
    });
    const put = await client.fetch(
      `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key}`,
      { method: 'PUT', body: bytes, headers: { 'Content-Type': contentType }, signal: AbortSignal.timeout(PUT_TIMEOUT_MS) },
    );
    if (!put.ok) return null;
    return `${cfg.publicBase}/${key}`;
  } catch {
    return null;
  }
}

// LLM output contract: TEXT ONLY. Any barcode/price/weight/nutrition field is
// rejected by design (the schema has nowhere to put it).
const enrichmentSchema = z.object({
  name_clean: z.string().trim().min(2).max(120).nullable(),
  hi_name: z.string().trim().min(2).max(120).nullable(),
  description: z.string().trim().min(10).max(400).nullable(),
  category_slug: z.string().trim().max(60).nullable(),
  unit_label: z.string().trim().max(40).nullable(),
});

function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

type LlmResult = { reply: string; provider: string; model: string };

async function callGemini(key: string, model: string, sys: string, user: string): Promise<string> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 400, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    },
  );
  if (!r.ok) throw new Error(`gemini ${model} HTTP ${r.status}`);
  const j = await r.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('gemini empty');
  return String(text);
}

async function callGroq(key: string, model: string, sys: string, user: string): Promise<string> {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`groq ${model} HTTP ${r.status}`);
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error('groq empty');
  return String(text);
}

async function callOpenRouter(key: string, model: string, sys: string, user: string): Promise<string> {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://zaff-it.vercel.app',
      'X-Title': 'ZAFF-IT CatalogBot',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`openrouter ${model} HTTP ${r.status}`);
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error('openrouter empty');
  return String(text);
}

async function enrichWithLLM(
  verified: Record<string, unknown>,
  categories: { slug: string; name: string }[],
): Promise<{ out: z.infer<typeof enrichmentSchema>; provider: string } | null> {
  const gemini = Deno.env.get('GEMINI_API_KEY');
  const groq = Deno.env.get('GROQ_API_KEY');
  const openrouter = Deno.env.get('OPENROUTER_API_KEY');
  if (!gemini && !groq && !openrouter) return null;

  const sys = [
    'You normalize grocery product data for an Indian hyperlocal store.',
    'You receive VERIFIED source data (Open Food Facts). You may clean spelling,',
    'derive a short natural-language description from the given ingredients/categories,',
    'translate the product name to Hindi (Devanagari), and pick ONE category_slug',
    'from the provided list. HARD RULES: never invent or alter barcode, brand, weight,',
    'MRP, nutrition or any numeric fact; if a field is unknown output null.',
    'Reply ONLY with JSON: {"name_clean": str|null, "hi_name": str|null,',
    '"description": str|null, "category_slug": str|null, "unit_label": str|null}',
  ].join(' ');

  const user = JSON.stringify({
    verified,
    allowed_category_slugs: categories.slice(0, 40).map((c) => c.slug),
  });

  const attempt = async (fn: () => Promise<string>): Promise<z.infer<typeof enrichmentSchema> | null> => {
    try {
      const parsed = enrichmentSchema.safeParse(JSON.parse(await fn()));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  let provider = '';
  let out: z.infer<typeof enrichmentSchema> | null = null;

  if (gemini) {
    const primary = Deno.env.get('GEMINI_MODEL') ?? GEMINI_FALLBACK_MODELS[0];
    for (const model of [primary, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== primary)]) {
      out = await attempt(() => callGemini(gemini, model, sys, user));
      if (out) { provider = `gemini:${model}`; break; }
    }
  }
  if (!out && groq) {
    const model = Deno.env.get('GROQ_MODEL') ?? GROQ_DEFAULT_MODEL;
    out = await attempt(() => callGroq(groq, model, sys, user));
    if (out) provider = `groq:${model}`;
  }
  if (!out && openrouter) {
    const primary = Deno.env.get('OPENROUTER_MODEL') ?? OPENROUTER_FALLBACK_MODELS[0];
    for (const model of [primary, ...OPENROUTER_FALLBACK_MODELS.filter((m) => m !== primary)]) {
      out = await attempt(() => callOpenRouter(openrouter, model, sys, user));
      if (out) { provider = `openrouter:${model}`; break; }
    }
  }
  return out ? { out, provider } : null;
}

type OffProduct = {
  code?: string;
  product_name?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  image_front_url?: string;
  image_url?: string;
  categories?: string;
  ingredients_text?: string;
  categories_tags?: string[];
};

async function fetchOffByBarcode(barcode: string): Promise<OffProduct | null> {
  const url = `${OFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,generic_name,brands,quantity,image_front_url,image_url,categories,ingredients_text,categories_tags`;
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) return null;
  const j = await r.json();
  if (j?.status !== 1 || !j?.product) return null;
  return j.product as OffProduct;
}

async function fetchCommonsImage(query: string): Promise<{ url: string; attribution: string; license: string } | null> {
  try {
    const api =
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search' +
      `&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=600&gsrsearch=${encodeURIComponent(query)}`;
    const r = await fetch(api, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!r.ok) return null;
    const j = await r.json();
    const pages = j?.query?.pages ? Object.values(j.query.pages) : [];
    for (const p of pages as Record<string, never>[]) {
      const info = (p as { imageinfo?: Record<string, unknown>[] }).imageinfo?.[0];
      if (!info) continue;
      const meta = (info.extmetadata ?? {}) as Record<string, { value?: string }>;
      const license = meta.LicenseShortName?.value ?? '';
      if (!/CC|Public domain/i.test(license)) continue; // license-unclear -> skip (policy)
      const url = (info.thumburl ?? info.url) as string | undefined;
      if (url && /\.(jpe?g|png)$/i.test(url)) {
        return {
          url,
          license: `${license} (Wikimedia Commons)`,
          attribution: meta.Artist?.value?.replace(/<[^>]+>/g, '').slice(0, 120) ?? 'Wikimedia Commons contributors',
        };
      }
    }
  } catch {
    // network/API failure -> null (caller queues generation/review)
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonError(405, 'METHOD_NOT_ALLOWED', 'POST only');

  const token = Deno.env.get('CATALOG_INGEST_TOKEN');
  if (!token || req.headers.get('x-ingest-token') !== token) {
    return jsonError(401, 'UNAUTHORIZED', 'Invalid ingest token');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return jsonError(500, 'CONFIG', 'Server config missing');
  const db = createClient(supabaseUrl, serviceKey);

  let body = { limit: 5 };
  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (parsed.success) body = parsed.data;
  } catch {
    // empty body ok
  }

  // Claim a batch (single-worker safe: status CAS pending->processing)
  const { data: jobs, error: claimErr } = await db
    .from('catalog_ingest_queue')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('status', 'pending')
    .in('job_type', ['off_barcode', 'off_search', 'wikimedia_image', 'agmarknet_price'])
    .order('priority', { ascending: true })
    .limit(body.limit)
    .select('*');

  if (claimErr) return jsonError(500, 'DB', claimErr.message);
  if (!jobs?.length) {
    return new Response(JSON.stringify({ processed: 0, message: 'queue empty' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Category domain for LLM mapping (live table, never invented)
  const { data: catRows } = await db.from('categories').select('slug, name').limit(40);
  const categories = (catRows ?? []) as { slug: string; name: string }[];
  // NOT NULL safety fallback: first active category by sort_order. Products
  // landing here WITHOUT an LLM-verified category are forced needs_review, so
  // the fallback never silently publishes a miscategorized product.
  const { data: defaultCat } = await db
    .from('categories')
    .select('id')
    .eq('is_active', true)
    .order('sort_order')
    .limit(1)
    .maybeSingle();

  const results: Record<string, unknown>[] = [];

  for (const job of jobs as {
    id: string;
    job_type: string;
    payload: { barcode?: string; query?: string; product_id?: string; image_query?: string; commodity?: string };
  }[]) {
    try {
      // ---------------- off_barcode ----------------
      if (job.job_type === 'off_barcode' && job.payload.barcode) {
        const barcode = job.payload.barcode.replace(/\D/g, '');
        const off = await fetchOffByBarcode(barcode);
        if (!off) {
          await db.from('catalog_ingest_queue').update({
            status: 'failed', last_error: 'not_found_on_off', updated_at: new Date().toISOString(),
          }).eq('id', job.id);
          results.push({ job: job.id, status: 'failed', reason: 'not_found_on_off' });
          continue;
        }

        const brand = (off.brands ?? '').split(',')[0]?.trim() ?? '';
        const name = (off.product_name ?? off.generic_name ?? '').trim();
        const imageUrl = off.image_front_url ?? off.image_url ?? '';
        const verified: Record<string, unknown> = {
          barcode,
          name_from_source: name || null,
          generic_name: off.generic_name ?? null,
          brand_from_source: brand || null,
          quantity_from_source: off.quantity ?? null,
          categories_tags: off.categories_tags?.slice(0, 8) ?? [],
          has_image: Boolean(imageUrl),
        };

        const ai = await enrichWithLLM(verified, categories);
        const categorySlug = ai?.out.category_slug && categories.some((c) => c.slug === ai.out.category_slug)
          ? ai.out.category_slug
          : null;
        const { data: catRow } = categorySlug
          ? await db.from('categories').select('id').eq('slug', categorySlug).maybeSingle()
          : { data: null };

        // Non-destructive dedupe: existing product -> fill gaps only.
        const { data: existing } = await db
          .from('products')
          .select('id, name, hi_name, description, image_url, category_id, unit_label, verification_status, source_system')
          .eq('barcode', barcode)
          .maybeSingle();

        const needsReview = !name || (!imageUrl && Boolean(brand)) || !categorySlug;
        const newName = ai?.out.name_clean ?? name;
        const newSlug = slugify(`${newName}${brand ? `-${brand}` : ''}`);
        let r2Mirrored = false;
        const resolvedCategoryId = catRow?.id ?? defaultCat?.id ?? null;
        if (!resolvedCategoryId) throw new Error('no_categories_configured');

        let productId: string;
        if (existing) {
          productId = existing.id;
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (!existing.hi_name && ai?.out.hi_name) patch.hi_name = ai.out.hi_name;
          if (!existing.description && ai?.out.description) patch.description = ai.out.description;
          if (!existing.unit_label && ai?.out.unit_label) patch.unit_label = ai.out.unit_label;
          if (!existing.image_url && imageUrl) patch.image_url = imageUrl;
          if (!existing.category_id && catRow?.id) patch.category_id = catRow.id;
          await db.from('products').update(patch).eq('id', existing.id);
        } else {
          const { data: created, error: createErr } = await db
            .from('products')
            .insert({
              barcode,
              sku: barcode, // NOT NULL; source barcode doubles as the ingest SKU
              name: newName,
              slug: `${newSlug}-${barcode.slice(-6)}`,
              brand: brand || null,
              description: ai?.out.description ?? null,
              hi_name: ai?.out.hi_name ?? null,
              unit_label: ai?.out.unit_label ?? off.quantity ?? '1 pack',
              image_url: imageUrl || null,
              category_id: resolvedCategoryId,
              is_veg: /vegetarian|veg/i.test(off.ingredients_text ?? ''), // NOT NULL col; best-effort from source, admin-editable
              source_system: 'open_food_facts',
              verification_status: needsReview ? 'needs_review' : 'auto_published',
              is_active: !needsReview,
            })
            .select('id')
            .single();
          if (createErr || !created) throw new Error(createErr?.message ?? 'product insert failed');
          productId = created.id;
        }

        // Provenance (append-only, always)
        await db.from('product_provenance').insert({
          product_id: productId,
          source_system: 'open_food_facts',
          source_id: barcode,
          license: OFF_LICENSE,
          attribution: OFF_ATTRIBUTION,
          raw_snapshot: {
            name, brand, quantity: off.quantity ?? null,
            categories: off.categories ?? null,
            ingredients_excerpt: (off.ingredients_text ?? '').slice(0, 300) || null,
            image_url: imageUrl || null,
            fetched_with: ai ? ai.provider : 'llm_unavailable',
          },
        });

        // Image record (real only; generation is a separate future queue).
        // R2 mirror attempt first: owned copy on CDN, remote URL as fallback.
        if (imageUrl) {
          const cfg = r2Config();
          const hostedUrl = cfg ? await mirrorToR2(cfg, productId, imageUrl) : null;
          await db.from('product_images').insert({
            product_id: productId,
            url: hostedUrl ?? imageUrl,
            kind: 'real',
            license: 'CC BY-SA 4.0 (Open Food Facts)',
            attribution: OFF_ATTRIBUTION,
            ai_generated: false,
            status: 'approved',
          });
          if (hostedUrl) await db.from('products').update({ image_url: hostedUrl }).eq('id', productId);
          r2Mirrored = Boolean(hostedUrl);
        } else if (!brand) {
          // Generic unbranded product without image -> Commons fallback job.
          await db.from('catalog_ingest_queue').insert({
            job_type: 'wikimedia_image',
            priority: 60,
            payload: { query: name, product_id: productId },
          });
        } else {
          // Branded without image: AI generation PROHIBITED -> review.
          await db.from('catalog_ingest_queue').update({
            status: 'needs_review',
            last_error: 'branded_no_image_manual_photo_required',
            updated_at: new Date().toISOString(),
          }).eq('id', job.id);
          results.push({ job: job.id, status: 'needs_review', reason: 'branded_no_image' });
          continue;
        }

        await db.from('catalog_ingest_queue').update({
          status: 'done',
          result: {
            product_id: productId,
            enriched_by: ai ? ai.provider : 'source_only',
            verification_status: needsReview ? 'needs_review' : 'auto_published',
            review_reason: needsReview ? (!categorySlug ? 'unmapped_category' : (!name ? 'missing_name' : 'branded_no_image')) : null,
            deduped: Boolean(existing),
            r2_mirrored: r2Mirrored,
          },
          updated_at: new Date().toISOString(),
        }).eq('id', job.id);
        results.push({ job: job.id, status: 'done', product_id: productId });
        continue;
      }

      // ---------------- wikimedia_image ----------------
      if (job.job_type === 'wikimedia_image') {
        const query = job.payload.query ?? '';
        const productId = job.payload.product_id;
        const img = query ? await fetchCommonsImage(query) : null;
        if (img && productId) {
          const cfg = r2Config();
          const hostedUrl = cfg ? await mirrorToR2(cfg, productId, img.url) : null;
          const finalUrl = hostedUrl ?? img.url;
          await db.from('product_images').insert({
            product_id: productId,
            url: finalUrl,
            kind: 'real',
            license: img.license,
            attribution: img.attribution,
            ai_generated: false,
            status: 'approved',
          });
          await db.from('products').update({ image_url: finalUrl }).eq('id', productId);
          await db.from('product_provenance').insert({
            product_id: productId,
            source_system: 'wikimedia_commons',
            source_id: img.url.slice(0, 180),
            license: img.license,
            attribution: img.attribution,
            raw_snapshot: { query, r2_mirrored: Boolean(hostedUrl) },
          });
          await db.from('catalog_ingest_queue').update({
            status: 'done', result: { image_url: finalUrl, r2_mirrored: Boolean(hostedUrl) }, updated_at: new Date().toISOString(),
          }).eq('id', job.id);
          results.push({ job: job.id, status: 'done', source: 'commons' });
        } else {
          await db.from('catalog_ingest_queue').update({
            status: 'needs_review',
            last_error: 'no_licensed_commons_image',
            updated_at: new Date().toISOString(),
          }).eq('id', job.id);
          results.push({ job: job.id, status: 'needs_review', reason: 'commons_empty' });
        }
        continue;
      }

      // ---------------- agmarknet_price ----------------
      // data.gov.in AGMARKNET daily mandi prices (GODL license, attribution
      // seeded in sources/source_licenses). Dormant until the founder sets
      // DATA_GOV_IN_API_KEY; jobs then upsert mandi_prices (raw commodity
      // level) — product mapping is a separate reviewable step, never forced.
      if (job.job_type === 'agmarknet_price') {
        const apiKey = Deno.env.get('DATA_GOV_IN_API_KEY');
        if (!apiKey) {
          await db.from('catalog_ingest_queue').update({
            status: 'needs_review',
            last_error: 'missing_data_gov_in_api_key (register free at data.gov.in)',
            updated_at: new Date().toISOString(),
          }).eq('id', job.id);
          results.push({ job: job.id, status: 'needs_review', reason: 'missing_api_key' });
          continue;
        }
        const commodity = job.payload.commodity ?? '';
        const params = new URLSearchParams({
          'api-key': apiKey,
          format: 'json',
          limit: '200',
        });
        if (commodity) params.set('filters[commodity]', commodity);
        const agResp = await fetch(
          `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?${params.toString()}`,
          { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
        );
        if (!agResp.ok) throw new Error(`agmarknet HTTP ${agResp.status}`);
        const ag = await agResp.json();
        const records = Array.isArray(ag?.records) ? ag.records : [];
        let upserted = 0;
        for (const rec of records as {
          commodity?: string; variety?: string; grade?: string; market?: string;
          district?: string; state?: string; min_price?: string; modal_price?: string;
          max_price?: string; arrival_date?: string;
        }[]) {
          const num = (v?: string) => (v && !isNaN(parseFloat(v)) ? parseFloat(v) : null);
          const row = {
            commodity: (rec.commodity ?? '').trim(),
            variety: (rec.variety ?? '').trim() || null,
            grade: (rec.grade ?? '').trim() || null,
            mandi: (rec.market ?? '').trim(),
            district: (rec.district ?? '').trim() || null,
            state: (rec.state ?? '').trim() || null,
            min_price: num(rec.min_price),
            modal_price: num(rec.modal_price),
            max_price: num(rec.max_price),
            price_unit: 'quintal',
            arrival_date: (rec.arrival_date ?? '').split('T')[0] || null as string | null,
            source_record: `agmarknet:${(rec.commodity ?? '')}:${(rec.market ?? '')}:${(rec.arrival_date ?? '')}`,
          };
          if (!row.commodity || !row.mandi || !row.arrival_date) continue;
          const { error: upErr } = await db.from('mandi_prices').upsert(row, {
            onConflict: 'commodity,variety,grade,mandi,arrival_date',
          });
          if (!upErr) upserted += 1;
        }
        await db.from('catalog_ingest_queue').update({
          status: 'done',
          result: { records_seen: records.length, mandi_rows_upserted: upserted, license: 'GODL-India' },
          updated_at: new Date().toISOString(),
        }).eq('id', job.id);
        results.push({ job: job.id, status: 'done', upserted });
        continue;
      }

      await db.from('catalog_ingest_queue').update({
        status: 'failed', last_error: 'unsupported_job_type', updated_at: new Date().toISOString(),
      }).eq('id', job.id);
      results.push({ job: job.id, status: 'failed' });
    } catch (e) {
      await db.from('catalog_ingest_queue').update({
        status: 'failed',
        last_error: e instanceof Error ? e.message.slice(0, 200) : 'unknown',
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);
      results.push({ job: job.id, status: 'failed' });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
