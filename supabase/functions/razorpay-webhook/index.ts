import { createClient } from 'npm:@supabase/supabase-js@^2.49.0';

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function verifyRazorpaySignature(rawBody: string, signatureHex: string, secret: string): Promise<boolean> {
  const sigBytes = hexToBytes(signatureHex.trim());
  if (!sigBytes) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(rawBody)));
  return timingSafeEqual(mac, sigBytes);
}

interface RazorpayWebhookPayload {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id: string;
        order_id: string;
        amount: number;
        currency: string;
        status: string;
      };
    };
    refund?: {
      entity?: {
        id: string;
        payment_id: string;
        amount: number;
        status: string;
      };
    };
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: { code: 'VALIDATION_ERROR', message: 'Method not allowed', request_id: requestId } });
  }

  const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!webhookSecret || !supabaseUrl || !serviceKey) {
    return jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'Server configuration missing', request_id: requestId } });
  }

  const signature = req.headers.get('x-razorpay-signature');
  if (!signature) {
    return jsonResponse(401, { error: { code: 'PAYMENT_SIGNATURE_INVALID', message: 'Missing signature header', request_id: requestId } });
  }

  const rawBody = await req.text();
  const valid = await verifyRazorpaySignature(rawBody, signature, webhookSecret);
  if (!valid) {
    return jsonResponse(401, { error: { code: 'PAYMENT_SIGNATURE_INVALID', message: 'Invalid webhook signature', request_id: requestId } });
  }

  let eventBody: RazorpayWebhookPayload;
  try {
    eventBody = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    return jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON payload', request_id: requestId } });
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  const nowIso = new Date().toISOString();
  let deduplicated = false;

  if (eventBody.event === 'payment.captured' && eventBody.payload?.payment?.entity) {
    const entity = eventBody.payload.payment.entity;
    const { data: payment } = await adminClient
      .from('payments')
      .select('id, order_id, status, amount_paise, currency')
      .eq('razorpay_order_id', entity.order_id)
      .maybeSingle();

    if (payment) {
      if (entity.amount !== payment.amount_paise || entity.currency !== payment.currency) {
        return jsonResponse(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Captured payment amount or currency mismatch',
            request_id: requestId,
          },
        });
      }
      if (payment.status === 'captured') {
        deduplicated = true;
      } else {
        await adminClient
          .from('payments')
          .update({
            razorpay_payment_id: entity.id,
            razorpay_signature: signature,
            status: 'captured',
            webhook_verified: true,
            webhook_payload: eventBody as unknown as Record<string, unknown>,
            verified_at: nowIso,
          })
          .eq('id', payment.id)
          .neq('status', 'captured');

        await adminClient
          .from('orders')
          .update({ status: 'placed', placed_at: nowIso })
          .eq('id', payment.order_id)
          .in('status', ['created', 'payment_pending']);
      }
    }
  } else if (eventBody.event === 'payment.failed' && eventBody.payload?.payment?.entity) {
    const entity = eventBody.payload.payment.entity;
    const { data: payment } = await adminClient
      .from('payments')
      .select('id, status')
      .eq('razorpay_order_id', entity.order_id)
      .maybeSingle();

    if (payment) {
      if (payment.status === 'failed' || payment.status === 'captured') {
        deduplicated = true;
      } else {
        await adminClient
          .from('payments')
          .update({
            razorpay_payment_id: entity.id,
            status: 'failed',
            webhook_verified: true,
            webhook_payload: eventBody as unknown as Record<string, unknown>,
            verified_at: nowIso,
          })
          .eq('id', payment.id)
          .not('status', 'in', '("captured","failed")');
      }
    }
  } else if ((eventBody.event === 'refund.processed' || eventBody.event === 'refund.failed') && eventBody.payload?.refund?.entity) {
    const entity = eventBody.payload.refund.entity;
    const nextStatus = eventBody.event === 'refund.processed' ? 'processed' : 'failed';
    const { data: refund } = await adminClient
      .from('refunds')
      .select('id, payment_id, order_id, status')
      .eq('razorpay_refund_id', entity.id)
      .maybeSingle();

    if (refund) {
      if (refund.status === nextStatus) {
        deduplicated = true;
      } else {
        await adminClient
          .from('refunds')
          .update({ status: nextStatus, ...(nextStatus === 'processed' ? { processed_at: nowIso } : {}) })
          .eq('id', refund.id);

        if (nextStatus === 'processed') {
          await adminClient.from('payments').update({ status: 'refunded' }).eq('id', refund.payment_id);
          await adminClient.from('orders').update({ status: 'refunded' }).eq('id', refund.order_id);
        }
      }
    }
  }

  return jsonResponse(200, { received: true, deduplicated });
});
