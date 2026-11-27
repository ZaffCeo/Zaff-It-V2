import { createClient } from 'npm:@supabase/supabase-js@^2.49.0';
import { z } from 'npm:zod@^3.24.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const schema = z.object({
  campaign_id: z.string().uuid(),
});

function jsonError(status: number, code: string, message: string, requestId: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message, request_id: requestId } }),
    { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
}

/**
 * Zaff Ads Phase 1: create a prepaid campaign payment order.
 * Amount is computed server-side from ad_pricing_config (create_ad_campaign_order RPC).
 * Activation happens ONLY via razorpay-webhook payment.captured (amount-verified,
 * idempotent through activate_ad_campaign_payment).
 */
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
  if (req.method !== 'POST') {
    return jsonError(405, 'VALIDATION_ERROR', 'Method not allowed', requestId);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonError(500, 'INTERNAL_ERROR', 'Server configuration missing', requestId);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonError(401, 'UNAUTHORIZED', 'Missing or invalid Authorization header', requestId);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return jsonError(401, 'UNAUTHORIZED', 'Invalid or expired Supabase JWT', requestId);
  }
  const merchantId = authData.user.id;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid JSON body', requestId);
  }
  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid campaign_id payload', requestId);
  }

  const { data: adOrder, error: adErr } = await userClient.rpc('create_ad_campaign_order', {
    p_campaign_id: parsed.data.campaign_id,
  });
  if (adErr || !adOrder) {
    return jsonError(400, 'VALIDATION_ERROR', adErr?.message ?? 'Failed to create ad payment order', requestId);
  }

  const transactionId = (adOrder as { transaction_id: string }).transaction_id;
  const amountPaise = (adOrder as { amount_paise: number }).amount_paise;
  const receipt = (adOrder as { receipt: string }).receipt;

  const rzpKeyId = Deno.env.get('RAZORPAY_KEY_ID');
  const rzpKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!rzpKeyId || !rzpKeySecret) {
    return jsonError(500, 'INTERNAL_ERROR', 'Razorpay server credentials not configured', requestId);
  }

  const adminClient = createClient(supabaseUrl, serviceKey);

  const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${rzpKeyId}:${rzpKeySecret}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        purpose: 'ad_campaign',
        transaction_id: transactionId,
        campaign_id: parsed.data.campaign_id,
        merchant_id: merchantId,
      },
    }),
  });

  if (!rzpRes.ok) {
    return jsonError(502, 'INTERNAL_ERROR', 'Failed to create Razorpay order', requestId);
  }
  const rzpJson = (await rzpRes.json()) as { id: string };

  await adminClient
    .from('ad_transactions')
    .update({ rzp_order_id: rzpJson.id })
    .eq('id', transactionId);

  return new Response(
    JSON.stringify({
      transaction_id: transactionId,
      campaign_id: parsed.data.campaign_id,
      amount_paise: amountPaise,
      currency: 'INR',
      razorpay_order_id: rzpJson.id,
      receipt,
    }),
    { status: 201, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});
