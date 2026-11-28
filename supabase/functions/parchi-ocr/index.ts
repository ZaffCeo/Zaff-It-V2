// parchi-ocr — Handwritten parchi / receipt → shopping-list items (Hindi, English, Hinglish).
// Engine: Gemini 2.0 Flash vision (GEMINI_API_KEY edge secret, already provisioned for
// zaffy-ai-assistant). Free tier, fast, best-in-class for Indic handwriting.
//
// Auth: caller Supabase JWT (verified via auth.getUser — service role never leaves server).
// Input: { image_base64: string, mime: 'image/jpeg' | 'image/png' }  (<= ~4MB base64)
// Output: { ok, items: [{ name, qty }], provider }
//
// NOTE: sandbox cannot reach supabase.co/generativelanguage (egress policy) — runtime
// smoke-test happens from the app (user browser → edge). Code follows cart-preview
// auth pattern exactly.

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

const PROMPT = `You are the OCR engine for Zaff-It, a Makrana (Rajasthan) grocery app.
Extract the shopping list from this image: it may be a handwritten "parchi", a printed
receipt, or a WhatsApp chat screenshot. Language can be Hindi (देवनागरी), English,
Hinglish (Hindi words in Latin script), or a mix.

Rules:
- Return ONLY JSON: {"items":[{"name":"<item as written or best transliteration>","qty":<number>}]}
- qty: visible quantity, else 1. Clamp 1-50.
- Max 40 items. Skip shop headers, totals, phone numbers, greetings.
- Keep the original script for names (दूध stays दूध); add a short English/Hinglish hint
  in brackets only when the word alone would be ambiguous.
- If nothing readable: {"items":[]}`;

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
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return jsonError(401, 'UNAUTHORIZED', 'Invalid or expired Supabase JWT', requestId);
  }

  let body: { image_base64?: string; mime?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid JSON body', requestId);
  }
  const b64 = (body.image_base64 ?? '').replace(/^data:[^;]+;base64,/, '');
  const mime = body.mime === 'image/png' ? 'image/png' : 'image/jpeg';
  if (b64.length < 100 || b64.length > 5_600_000) {
    return jsonError(400, 'IMAGE_TOO_LARGE', 'Image must be between ~100B and 4MB base64', requestId);
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) {
    return jsonError(503, 'OCR_UNAVAILABLE', 'OCR engine not configured', requestId);
  }

  let geminiJson: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mime, data: b64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      },
    );
    if (!resp.ok) {
      const t = await resp.text();
      return jsonError(502, 'OCR_UPSTREAM', `Gemini ${resp.status}: ${t.slice(0, 300)}`, requestId);
    }
    geminiJson = await resp.json();
  } catch (e) {
    return jsonError(502, 'OCR_UPSTREAM', String(e).slice(0, 300), requestId);
  }

  const text = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  let items: Array<{ name: string; qty: number }> = [];
  try {
    const parsed = JSON.parse(text) as { items?: Array<{ name?: unknown; qty?: unknown }> };
    items = (parsed.items ?? [])
      .map((it) => ({
        name: String(it.name ?? '').trim().slice(0, 80),
        qty: Math.max(1, Math.min(50, Math.round(Number(it.qty) || 1))),
      }))
      .filter((it) => it.name.length > 0)
      .slice(0, 40);
  } catch {
    return jsonError(502, 'OCR_PARSE', 'Could not parse OCR response', requestId);
  }

  return new Response(
    JSON.stringify({ ok: true, items, provider: 'gemini-2.0-flash', request_id: requestId }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});
