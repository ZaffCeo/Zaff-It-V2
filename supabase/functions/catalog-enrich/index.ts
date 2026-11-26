// Catalog enrichment: fills products.image_url from Open Food Facts — free,
// open-licence product DB (images CC-BY-SA, attribution kept in product meta).
// Trigger: GET /functions/v1/catalog-enrich?token=<ENRICH_TOKEN secret>
// Processes up to LIMIT products with NULL image_url per call (repeatable).
// v3: 1.2s inter-request delay — OFF throttles rapid bursts with 503.
import { createClient } from 'npm:@supabase/supabase-js@^2.49.0';

const LIMIT = 10;
const OFF_DELAY_MS = 1200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req: Request): Promise<Response> => {
  const headers = { 'Content-Type': 'application/json' };

  const token = new URL(req.url).searchParams.get('token');
  const expected = Deno.env.get('ENRICH_TOKEN');
  if (!expected || !token || token !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'missing server config' }), { status: 500, headers });
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: products, error } = await admin
    .from('products')
    .select('id, name, brand')
    .is('image_url', null)
    .limit(LIMIT);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  }

  const results: Array<Record<string, unknown>> = [];
  let first = true;
  for (const p of products ?? []) {
    if (!first) await sleep(OFF_DELAY_MS);
    first = false;
    const search = `${p.brand ?? ''} ${p.name}`.trim();
    const q = encodeURIComponent(search);
    try {
      const r = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,brands,image_front_small_url`,
        { headers: { 'User-Agent': 'Zaff-It/1.0 (catalog enrichment)' } },
      );
      if (!r.ok) {
        results.push({ id: p.id, name: p.name, error: `OFF HTTP ${r.status}` });
        continue;
      }
      const j = await r.json();
      const hit = (j.products ?? []).find(
        (x: { image_front_small_url?: string }) =>
          typeof x.image_front_small_url === 'string' && x.image_front_small_url.length > 0,
      );
      if (hit?.image_front_small_url) {
        const { error: upErr } = await admin
          .from('products')
          .update({ image_url: hit.image_front_small_url })
          .eq('id', p.id);
        results.push({ id: p.id, name: p.name, updated: !upErr, image: hit.image_front_small_url });
      } else {
        results.push({ id: p.id, name: p.name, found: false });
      }
    } catch (e) {
      results.push({ id: p.id, name: p.name, error: String(e).slice(0, 150) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), { status: 200, headers });
});
