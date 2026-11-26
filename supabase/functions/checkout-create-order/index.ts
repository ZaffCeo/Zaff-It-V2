import { createClient } from 'npm:@supabase/supabase-js@^2.49.0';
import { z } from 'npm:zod@^3.24.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const checkoutSchema = z.object({
  store_id: z.string().uuid(),
  address_id: z.string().uuid(),
  payment_method: z.enum(['razorpay', 'cod']),
  coupon_code: z.string().trim().min(1).max(32).toUpperCase().optional().nullable(),
  delivery_instructions: z.string().trim().max(300).optional().nullable(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .min(1)
    .max(100),
});

function jsonError(
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, ...(details ? { details } : {}), request_id: requestId } }),
    { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

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

  const idempotencyKey = req.headers.get('Idempotency-Key')?.trim() ?? '';
  if (!z.string().uuid().safeParse(idempotencyKey).success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Valid UUID Idempotency-Key header is required', requestId);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return jsonError(401, 'UNAUTHORIZED', 'Invalid or expired Supabase JWT', requestId);
  }
  const customerId = authData.user.id;

  // AUD-HIGH-3: hard input-size gates BEFORE schema parsing. Zod <4.6.6 can
  // exhaust memory validating oversized collections (GHSA-mrhx-c7xc-m3w5), so
  // cap request size and array cardinality before any schema work.
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 65_536) {
    return jsonError(413, 'VALIDATION_ERROR', 'Request body too large', requestId);
  }
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid JSON body', requestId);
  }
  if (
    rawBody !== null &&
    typeof rawBody === 'object' &&
    Array.isArray((rawBody as { items?: unknown }).items)
  ) {
    if ((rawBody as { items: unknown[] }).items.length > 100) {
      return jsonError(400, 'VALIDATION_ERROR', 'Too many items (max 100)', requestId);
    }
  }

  const parsed = checkoutSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid checkout payload', requestId, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const payload = parsed.data;
  const payloadHash = await sha256Hex(JSON.stringify(payload));
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Check idempotency key for existing order
  const { data: existingOrder } = await adminClient
    .from('orders')
    .select('id, order_number, customer_id, store_id, status, fulfillment_type, total_paise, payment_method, created_at')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existingOrder) {
    if (existingOrder.customer_id !== customerId || existingOrder.store_id !== payload.store_id || existingOrder.payment_method !== payload.payment_method) {
      return jsonError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key already used with different payload', requestId);
    }
    let existingPayment = (await adminClient
      .from('payments')
      .select('provider, razorpay_order_id, amount_paise, currency')
      .eq('order_id', existingOrder.id)
      .maybeSingle()).data;

    // AUD-MED-4: if the first attempt created the order but died before/while
    // creating the Razorpay order, re-create it here so the retry can pay.
    if (
      existingOrder.payment_method === 'razorpay' &&
      (!existingPayment || !existingPayment.razorpay_order_id)
    ) {
      const rzpKeyId = Deno.env.get('RAZORPAY_KEY_ID');
      const rzpKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
      if (rzpKeyId && rzpKeySecret) {
        const rzpRetry = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${rzpKeyId}:${rzpKeySecret}`)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: existingOrder.total_paise,
            currency: 'INR',
            receipt: existingOrder.order_number,
            notes: { order_id: existingOrder.id, customer_id: customerId, retry: 'true' },
          }),
        });
        if (rzpRetry.ok) {
          const rzpJson = (await rzpRetry.json()) as { id: string };
          if (existingPayment) {
            await adminClient
              .from('payments')
              .update({ razorpay_order_id: rzpJson.id })
              .eq('order_id', existingOrder.id);
            existingPayment = { ...existingPayment, razorpay_order_id: rzpJson.id };
          } else {
            const { data: insertedPayment } = await adminClient
              .from('payments')
              .insert({
                order_id: existingOrder.id,
                provider: 'razorpay',
                amount_paise: existingOrder.total_paise,
                currency: 'INR',
                status: 'created',
                razorpay_order_id: rzpJson.id,
              })
              .select('provider, razorpay_order_id, amount_paise, currency')
              .maybeSingle();
            existingPayment = insertedPayment ?? existingPayment;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        order_id: existingOrder.id,
        order_number: existingOrder.order_number,
        status: existingOrder.status,
        fulfillment_type: existingOrder.fulfillment_type,
        grand_total_paise: existingOrder.total_paise,
        payment: existingPayment ?? {
          provider: existingOrder.payment_method,
          razorpay_order_id: null,
          amount_paise: existingOrder.total_paise,
          currency: 'INR',
        },
        created_at: existingOrder.created_at,
        deduplicated: true,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  // Resolve store_products for requested product_ids and prepare active cart for atomic RPC
  const productIds = payload.items.map((i) => i.product_id);
  const { data: storeProducts, error: spErr } = await adminClient
    .from('store_products')
    .select('id, product_id')
    .eq('store_id', payload.store_id)
    .in('product_id', productIds);

  if (spErr || !storeProducts || storeProducts.length !== productIds.length) {
    return jsonError(404, 'NOT_FOUND', 'One or more products not found for this store', requestId);
  }

  const spByProductId = new Map<string, string>(
    storeProducts.map((sp: { id: string; product_id: string }) => [sp.product_id, sp.id]),
  );

  const { data: cartRow, error: cartErr } = await userClient
    .from('carts')
    .upsert(
      { user_id: customerId, store_id: payload.store_id, status: 'active' },
      { onConflict: 'user_id,store_id' },
    )
    .select('id')
    .single();

  if (cartErr || !cartRow) {
    return jsonError(400, 'VALIDATION_ERROR', cartErr?.message ?? 'Failed to prepare cart', requestId);
  }

  await userClient.from('cart_items').delete().eq('cart_id', cartRow.id);
  const { error: cartItemsErr } = await userClient.from('cart_items').insert(
    payload.items.map((item) => ({
      cart_id: cartRow.id,
      store_product_id: spByProductId.get(item.product_id),
      qty: item.quantity,
    })),
  );

  if (cartItemsErr) {
    return jsonError(400, 'VALIDATION_ERROR', cartItemsErr.message, requestId);
  }

  // Atomic stock reservation + server-side paise calculation RPC (uses auth.uid())
  const { data: rpcOrder, error: rpcErr } = await userClient.rpc('create_checkout_order', {
    p_cart_id: cartRow.id,
    p_delivery_address_id: payload.address_id,
    p_payment_method: payload.payment_method,
    p_idempotency_key: idempotencyKey,
    p_coupon_code: payload.coupon_code ?? null,
  });

  if (rpcErr || !rpcOrder) {
    const msg = rpcErr?.message ?? 'Order creation failed';
    if (msg.toLowerCase().includes('insufficient stock')) return jsonError(409, 'INSUFFICIENT_STOCK', msg, requestId);
    if (msg.toLowerCase().includes('service zone')) return jsonError(422, 'OUT_OF_SERVICE_ZONE', msg, requestId);
    if (msg.toLowerCase().includes('not found')) return jsonError(404, 'NOT_FOUND', msg, requestId);
    if (msg.toLowerCase().includes('idempotency')) return jsonError(409, 'IDEMPOTENCY_CONFLICT', msg, requestId);
    return jsonError(400, 'VALIDATION_ERROR', msg, requestId);
  }

  const orderId = rpcOrder.order_id as string;
  const { data: createdOrder } = await adminClient
    .from('orders')
    .select('fulfillment_type, created_at')
    .eq('id', orderId)
    .maybeSingle();

  let razorpayOrderId: string | null = null;
  if (payload.payment_method === 'razorpay') {
    const rzpKeyId = Deno.env.get('RAZORPAY_KEY_ID');
    const rzpKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!rzpKeyId || !rzpKeySecret) {
      return jsonError(500, 'INTERNAL_ERROR', 'Razorpay server credentials not configured', requestId);
    }

    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${rzpKeyId}:${rzpKeySecret}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: rpcOrder.total_paise,
        currency: 'INR',
        receipt: rpcOrder.order_number,
        notes: { order_id: orderId, customer_id: customerId, payload_hash: payloadHash },
      }),
    });

    if (!rzpRes.ok) {
      return jsonError(502, 'INTERNAL_ERROR', 'Failed to create Razorpay order', requestId);
    }
    const rzpJson = (await rzpRes.json()) as { id: string };
    razorpayOrderId = rzpJson.id;

    await adminClient
      .from('payments')
      .update({ razorpay_order_id: razorpayOrderId })
      .eq('order_id', orderId);
  }

  return new Response(
    JSON.stringify({
      order_id: orderId,
      order_number: rpcOrder.order_number,
      status: rpcOrder.status,
      fulfillment_type: createdOrder?.fulfillment_type ?? 'merchant',
      grand_total_paise: rpcOrder.total_paise,
      payment: {
        provider: payload.payment_method,
        razorpay_order_id: razorpayOrderId,
        amount_paise: rpcOrder.total_paise,
        currency: 'INR',
      },
      created_at: createdOrder?.created_at ?? new Date().toISOString(),
    }),
    { status: 201, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});
