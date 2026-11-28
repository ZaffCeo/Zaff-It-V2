// geocode-makrana — Genuine Makrana location search for the address picker.
//
// Strategy (all FREE, no API key):
//   1. geocode_cache table (service client) — 30-day cache, polite to upstream
//   2. OpenStreetMap Nominatim — real OSM data of Makrana (viewbox-bounded, IN only)
//   3. Fallback: our OWN verified active stores (genuine DB coordinates) + zone centers
//
// Input:  { query: string }   (1-120 chars)
// Output: { ok, source: 'cache'|'osm'|'fallback'|'empty', results: [{name, full, lat, lng, type}] }
//
// NOTE: sandbox egress cannot reach nominatim/supabase — runtime test happens from app.

import { createClient } from 'npm:@supabase/supabase-js@^2.49.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonError = (status: number, code: string, message: string, requestId: string) =>
  new Response(JSON.stringify({ ok: false, error: code, message, request_id: requestId }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

// Makrana bounding box (lat 26.99–27.10, lng 74.66–74.82) — covers city + Borawar side
const VIEWBOX = '74.66,27.10,74.82,26.99';
const CACHE_TTL_DAYS = 30;

type GeoResult = { name: string; full: string; lat: number; lng: number; type: string };

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonError(405, 'METHOD_NOT_ALLOWED', 'POST only', requestId);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return jsonError(401, 'UNAUTHORIZED', 'Invalid or expired Supabase JWT', requestId);
  }

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid JSON body', requestId);
  }
  const query = String(body.query ?? '').trim().slice(0, 120);
  const cacheKey = `makrana:${query.toLowerCase()}`;

  const admin = createClient(supabaseUrl, serviceKey);

  // 1. Cache first
  try {
    const { data: cached } = await admin
      .from('geocode_cache')
      .select('results, source, created_at')
      .eq('query_key', cacheKey)
      .maybeSingle();
    if (cached) {
      const ageDays = (Date.now() - new Date(cached.created_at as string).getTime()) / 86_400_000;
      if (ageDays < CACHE_TTL_DAYS) {
        return new Response(
          JSON.stringify({ ok: true, source: 'cache', results: cached.results, request_id: requestId }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
      }
    }
  } catch {
    // cache miss/failure → continue upstream
  }

  // 2. Nominatim (OSM) — bounded to Makrana
  let osmResults: GeoResult[] = [];
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query || 'Makrana')}` +
      `&format=jsonv2&addressdetails=1&limit=8&countrycodes=in&viewbox=${VIEWBOX}&bounded=1`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Zaff-It-Makrana-Pilot/1.0 (in-app address picker)' },
    });
    if (resp.ok) {
      const rows = (await resp.json()) as Array<{
        display_name: string;
        name?: string;
        lat: string;
        lon: string;
        type?: string;
      }>;
      osmResults = rows.map((r) => ({
        name: (r.name || r.display_name.split(',')[0] || 'Location').trim(),
        full: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        type: r.type ?? 'place',
      }));
    }
  } catch {
    // upstream failure → fallback below
  }

  if (osmResults.length > 0) {
    try {
      await admin.from('geocode_cache').upsert({
        query_key: cacheKey,
        results: osmResults,
        source: 'osm',
        created_at: new Date().toISOString(),
      });
    } catch {
      // cache write failure is non-fatal
    }
    return new Response(
      JSON.stringify({ ok: true, source: 'osm', results: osmResults, request_id: requestId }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  // 3. Fallback: genuine data from our own DB — active stores + zone centers
  const fallback: GeoResult[] = [];
  try {
    const { data: stores } = await admin
      .from('stores')
      .select('name, address_line1, lat, lng')
      .eq('is_active', true)
      .limit(12);
    for (const s of stores ?? []) {
      fallback.push({
        name: String(s.name),
        full: `${s.address_line1}, Makrana`,
        lat: Number(s.lat),
        lng: Number(s.lng),
        type: 'store',
      });
    }
    const { data: zones } = await admin
      .from('service_zones')
      .select('name, center_lat, center_lng')
      .eq('is_active', true)
      .limit(5);
    for (const z of zones ?? []) {
      fallback.push({
        name: `${z.name} (zone center)`,
        full: `${z.name}, Makrana, Rajasthan`,
        lat: Number(z.center_lat),
        lng: Number(z.center_lng),
        type: 'zone',
      });
    }
  } catch {
    // even DB failed → return empty
  }

  return new Response(
    JSON.stringify({
      ok: true,
      source: fallback.length > 0 ? 'fallback' : 'empty',
      results: fallback,
      request_id: requestId,
    }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});
