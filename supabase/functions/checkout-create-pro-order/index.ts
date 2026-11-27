import { createClient } from 'npm:@supabase/supabase-js@^2.49.0';
import { z } from 'npm:zod@^3.24.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const schema = z.object({
  plan: z.enum(['customer', 'seller', 'provider']),
});

function jsonError(status: number, code: string, message: string, requestId: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message, request_id: requestId } }),
    { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
}

/**
 * W4b: create a pending Pro membership + Razorpay order for it.
 * Activation happens ONLY via razorpay-webhook payment.captured (amount-verified).
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
  const customerId = authData.user.id;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid JSON body', requestId);
  }
  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid plan payload', requestId);
  }

  const { data: proOrder, error: proErr } = await userClient.rpc('create_pro_membership_order', {
    p_plan: parsed.data.plan,
  });
  if (proErr || !proOrder) {
    return jsonError(400, 'VALIDATION_ERROR', proErr?.message ?? 'Failed to create Pro order', requestId);
  }

  const membershipId = (proOrder as { membership_id: string }).membership_id;
  const amountPaise = (proOrder as { amount_paise: number }).amount_paise;

  const rzpKeyId = Deno.env.get('RAZORPAY_KEY_ID');
  const rzpKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!rzpKeyId || !rzpKeySecret) {
    return jsonError(500, 'INTERNAL_ERROR', 'Razorpay server credentials not configured', requestId);
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  const receipt = `PRO-${membershipId.slice(0, 8).toUpperCase()}`;

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
        purpose: 'pro_membership',
        membership_id: membershipId,
        customer_id: customerId,
        plan: parsed.data.plan,
      },
    }),
  });

  if (!rzpRes.ok) {
    return jsonError(502, 'INTERNAL_ERROR', 'Failed to create Razorpay order', requestId);
  }
  const rzpJson = (await rzpRes.json()) as { id: string };

  await adminClient
    .from('pro_memberships')
    .update({ payment_ref: rzpJson.id })
    .eq('id', membershipId);

  return new Response(
    JSON.stringify({
      membership_id: membershipId,
      plan: parsed.data.plan,
      amount_paise: amountPaise,
      intro_price: (proOrder as { intro_price?: boolean }).intro_price ?? false,
      razorpay_order_id: rzpJson.id,
      receipt,
    }),
    { status: 201, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});
