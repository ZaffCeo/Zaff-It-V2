import { createClient } from 'npm:@supabase/supabase-js@^2.49.0';
import { z } from 'npm:zod@^3.24.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type OrderStatus =
  | 'created'
  | 'payment_pending'
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready_for_pickup'
  | 'rider_assigned'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refund_pending'
  | 'refunded';

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  created: ['payment_pending', 'placed', 'cancelled'],
  payment_pending: ['placed', 'cancelled'],
  placed: ['accepted', 'cancelled', 'refund_pending'],
  accepted: ['preparing', 'cancelled', 'refund_pending'],
  preparing: ['ready_for_pickup', 'cancelled', 'refund_pending'],
  ready_for_pickup: ['rider_assigned', 'picked_up', 'cancelled', 'refund_pending'],
  rider_assigned: ['picked_up', 'cancelled', 'refund_pending'],
  picked_up: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: ['refund_pending'],
  cancelled: ['refund_pending'],
  refund_pending: ['refunded'],
  refunded: [],
};

function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

const lifecycleSchema = z.discriminatedUnion('action', [
  // Merchant actions
  z.object({ action: z.literal('accept'), order_id: z.string().uuid() }),
  z.object({
    action: z.literal('reject'),
    order_id: z.string().uuid(),
    reason: z.string().trim().min(3).max(250),
  }),
  z.object({ action: z.literal('preparing'), order_id: z.string().uuid() }),
  z.object({ action: z.literal('ready_for_pickup'), order_id: z.string().uuid() }),
  // Rider actions
  z.object({ action: z.literal('assign'), order_id: z.string().uuid() }),
  z.object({ action: z.literal('picked_up'), order_id: z.string().uuid() }),
  z.object({ action: z.literal('out_for_delivery'), order_id: z.string().uuid() }),
  z.object({
    action: z.literal('delivered'),
    order_id: z.string().uuid(),
    otp: z.string().trim().regex(/^[0-9]{4}$/, '4-digit handover OTP is required'),
    cod_cash_collected: z.boolean().optional(),
    cash_collected_paise: z.number().int().nonnegative().optional(),
  }),
  // Customer actions
  z.object({
    action: z.literal('cancel'),
    order_id: z.string().uuid(),
    reason: z.string().trim().min(3).max(250).optional(),
  }),
  z.object({
    action: z.literal('create_support_ticket'),
    order_id: z.string().uuid().optional().nullable(),
    category: z.enum([
      'order_issue',
      'payment_refund',
      'missing_item',
      'delivery_delay',
      'account_privacy',
      'other',
    ]),
    subject: z.string().trim().min(3).max(160),
    description: z.string().trim().min(10).max(2000),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
  }),
]);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function jsonError(
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(status, {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      request_id: requestId,
    },
  });
}

function generateFourDigitOtp(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(1000 + (arr[0] % 9000));
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

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return jsonError(401, 'UNAUTHORIZED', 'Invalid or expired Supabase JWT', requestId);
  }
  const actorId = authData.user.id;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid JSON body', requestId);
  }

  const parsed = lifecycleSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid order lifecycle payload', requestId, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const payload = parsed.data;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Fetch active user roles
  const { data: roleRows, error: rolesErr } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', actorId)
    .eq('is_active', true);

  if (rolesErr) {
    return jsonError(500, 'INTERNAL_ERROR', 'Failed to verify user roles', requestId);
  }

  const roles = new Set((roleRows ?? []).map((r: { role: string }) => r.role));
  const isAdmin = roles.has('admin');

  // Customer: create_support_ticket
  if (payload.action === 'create_support_ticket') {
    if (!roles.has('customer') && !isAdmin) {
      return jsonError(403, 'FORBIDDEN', 'Customer role required to create support ticket', requestId);
    }

    if (payload.order_id) {
      const { data: ord } = await adminClient
        .from('orders')
        .select('id, customer_id')
        .eq('id', payload.order_id)
        .maybeSingle();
      if (!ord) {
        return jsonError(404, 'NOT_FOUND', 'Referenced order not found', requestId);
      }
      if (!isAdmin && ord.customer_id !== actorId) {
        return jsonError(403, 'FORBIDDEN', 'You can only create tickets for your own orders', requestId);
      }
    }

    const ticketNumber = `TKT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto
      .randomUUID()
      .slice(0, 6)
      .toUpperCase()}`;

    const { data: ticket, error: ticketErr } = await adminClient
      .from('support_tickets')
      .insert({
        ticket_number: ticketNumber,
        user_id: actorId,
        order_id: payload.order_id ?? null,
        category: payload.category,
        subject: payload.subject,
        description: payload.description,
        priority: payload.priority,
        status: 'open',
      })
      .select('id, ticket_number, status, priority, created_at')
      .single();

    if (ticketErr || !ticket) {
      return jsonError(500, 'INTERNAL_ERROR', ticketErr?.message ?? 'Failed to create ticket', requestId);
    }

    await adminClient.from('audit_logs').insert({
      actor_id: actorId,
      actor_role: isAdmin ? 'admin' : 'customer',
      action: 'support_ticket.create',
      entity_type: 'support_tickets',
      entity_id: ticket.id,
      old_data: null,
      new_data: { ticket_number: ticket.ticket_number, category: payload.category, order_id: payload.order_id ?? null },
      metadata: { request_id: requestId },
    });

    return jsonResponse(201, ticket);
  }

  // All remaining actions operate on an order
  const { data: order, error: orderErr } = await adminClient
    .from('orders')
    .select('id, order_number, customer_id, store_id, status, payment_method, total_paise')
    .eq('id', payload.order_id)
    .maybeSingle();

  if (orderErr || !order) {
    return jsonError(404, 'NOT_FOUND', 'Order not found', requestId);
  }

  const currentStatus = order.status as OrderStatus;
  const nowIso = new Date().toISOString();

  // Merchant actions
  if (
    payload.action === 'accept' ||
    payload.action === 'reject' ||
    payload.action === 'preparing' ||
    payload.action === 'ready_for_pickup'
  ) {
    if (!roles.has('merchant') && !isAdmin) {
      return jsonError(403, 'FORBIDDEN', 'Merchant role required', requestId);
    }

    if (!isAdmin) {
      const { data: store } = await adminClient
        .from('stores')
        .select('id, merchants!inner(owner_user_id)')
        .eq('id', order.store_id)
        .maybeSingle();

      const merchantInfo = store?.merchants as unknown as
        | { owner_user_id: string | null }
        | { owner_user_id: string | null }[]
        | undefined;
      const ownerId = Array.isArray(merchantInfo)
        ? merchantInfo[0]?.owner_user_id
        : merchantInfo?.owner_user_id;

      if (!store || ownerId !== actorId) {
        return jsonError(403, 'FORBIDDEN', 'Not authorized for this store order', requestId);
      }
    }

    if (payload.action === 'reject') {
      if (!canTransitionOrderStatus(currentStatus, 'cancelled')) {
        return jsonError(
          400,
          'VALIDATION_ERROR',
          `Cannot reject order from status '${currentStatus}'`,
          requestId,
        );
      }

      const { data: cancelRes, error: cancelErr } = await userClient.rpc(
        'cancel_order_and_release_stock',
        {
          p_order_id: order.id,
          p_reason: payload.reason,
        },
      );

      if (cancelErr || !cancelRes) {
        return jsonError(400, 'VALIDATION_ERROR', cancelErr?.message ?? 'Failed to reject order', requestId);
      }

      return jsonResponse(200, {
        order_id: order.id,
        order_number: order.order_number,
        previous_status: currentStatus,
        status: cancelRes.status,
        updated_at: nowIso,
      });
    }

    const nextStatusMap: Record<'accept' | 'preparing' | 'ready_for_pickup', OrderStatus> = {
      accept: 'accepted',
      preparing: 'preparing',
      ready_for_pickup: 'ready_for_pickup',
    };
    const nextStatus = nextStatusMap[payload.action];

    if (!canTransitionOrderStatus(currentStatus, nextStatus)) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        `Invalid status transition from '${currentStatus}' to '${nextStatus}'`,
        requestId,
      );
    }

    const { error: updErr } = await adminClient
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', order.id)
      .eq('status', currentStatus);

    if (updErr) {
      return jsonError(500, 'INTERNAL_ERROR', updErr.message, requestId);
    }

    if (nextStatus === 'ready_for_pickup') {
      const { data: existingTask } = await adminClient
        .from('delivery_tasks')
        .select('id')
        .eq('order_id', order.id)
        .maybeSingle();

      if (!existingTask) {
        await adminClient.from('delivery_tasks').insert({
          order_id: order.id,
          store_id: order.store_id,
          status: 'unassigned',
          pickup_otp: generateFourDigitOtp(),
          delivery_otp: generateFourDigitOtp(),
        });
      }
    }

    await adminClient.from('audit_logs').insert({
      actor_id: actorId,
      actor_role: isAdmin ? 'admin' : 'merchant',
      action: `order.${payload.action}`,
      entity_type: 'orders',
      entity_id: order.id,
      old_data: { status: currentStatus },
      new_data: { status: nextStatus },
      metadata: { request_id: requestId },
    });

    return jsonResponse(200, {
      order_id: order.id,
      order_number: order.order_number,
      previous_status: currentStatus,
      status: nextStatus,
      updated_at: nowIso,
    });
  }

  // Rider actions
  if (
    payload.action === 'assign' ||
    payload.action === 'picked_up' ||
    payload.action === 'out_for_delivery' ||
    payload.action === 'delivered'
  ) {
    if (!roles.has('rider') && !isAdmin) {
      return jsonError(403, 'FORBIDDEN', 'Rider role required', requestId);
    }

    const { data: task } = await adminClient
      .from('delivery_tasks')
      .select('id, rider_id, status, delivery_otp')
      .eq('order_id', order.id)
      .maybeSingle();

    if (payload.action === 'assign') {
      if (!canTransitionOrderStatus(currentStatus, 'rider_assigned')) {
        return jsonError(
          400,
          'VALIDATION_ERROR',
          `Cannot assign rider when order is '${currentStatus}'`,
          requestId,
        );
      }

      if (task?.rider_id && task.rider_id !== actorId && !isAdmin) {
        return jsonError(409, 'IDEMPOTENCY_CONFLICT', 'Order already assigned to another rider', requestId);
      }

      if (task) {
        await adminClient
          .from('delivery_tasks')
          .update({
            rider_id: actorId,
            status: 'assigned',
            assigned_at: nowIso,
            delivery_otp: task.delivery_otp ?? generateFourDigitOtp(),
          })
          .eq('id', task.id);
      } else {
        await adminClient.from('delivery_tasks').insert({
          order_id: order.id,
          store_id: order.store_id,
          rider_id: actorId,
          status: 'assigned',
          assigned_at: nowIso,
          pickup_otp: generateFourDigitOtp(),
          delivery_otp: generateFourDigitOtp(),
        });
      }

      const { error: updErr } = await adminClient
        .from('orders')
        .update({ status: 'rider_assigned' })
        .eq('id', order.id);

      if (updErr) {
        return jsonError(500, 'INTERNAL_ERROR', updErr.message, requestId);
      }

      await adminClient.from('audit_logs').insert({
        actor_id: actorId,
        actor_role: isAdmin ? 'admin' : 'rider',
        action: 'order.assign',
        entity_type: 'orders',
        entity_id: order.id,
        old_data: { status: currentStatus },
        new_data: { status: 'rider_assigned', rider_id: actorId },
        metadata: { request_id: requestId },
      });

      return jsonResponse(200, {
        order_id: order.id,
        status: 'rider_assigned',
        rider_id: actorId,
        updated_at: nowIso,
      });
    }

    // For picked_up, out_for_delivery, delivered: verify rider ownership
    if (!task) {
      return jsonError(404, 'NOT_FOUND', 'Delivery task not found for this order', requestId);
    }
    if (!isAdmin && task.rider_id !== actorId) {
      return jsonError(403, 'FORBIDDEN', 'Order is not assigned to this rider', requestId);
    }

    const riderNextStatus = payload.action as OrderStatus;
    if (!canTransitionOrderStatus(currentStatus, riderNextStatus)) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        `Invalid status transition from '${currentStatus}' to '${riderNextStatus}'`,
        requestId,
      );
    }

    if (payload.action === 'delivered') {
      if (!task.delivery_otp || payload.otp !== task.delivery_otp) {
        return jsonError(400, 'VALIDATION_ERROR', 'Invalid 4-digit handover OTP', requestId);
      }

      if (order.payment_method === 'cod') {
        const codConfirmed =
          payload.cod_cash_collected === true ||
          payload.cash_collected_paise === order.total_paise;
        if (!codConfirmed) {
          return jsonError(
            400,
            'VALIDATION_ERROR',
            'COD cash collection confirmation is required before marking delivered',
            requestId,
            { expected_paise: order.total_paise },
          );
        }

        await adminClient
          .from('payments')
          .update({ status: 'captured', verified_at: nowIso })
          .eq('order_id', order.id)
          .eq('provider', 'cod');
      }

      await adminClient
        .from('delivery_tasks')
        .update({ status: 'delivered', delivered_at: nowIso })
        .eq('id', task.id);

      const { error: updErr } = await adminClient
        .from('orders')
        .update({ status: 'delivered', delivered_at: nowIso })
        .eq('id', order.id);

      if (updErr) {
        return jsonError(500, 'INTERNAL_ERROR', updErr.message, requestId);
      }
    } else if (payload.action === 'picked_up') {
      await adminClient
        .from('delivery_tasks')
        .update({ status: 'picked_up', picked_up_at: nowIso })
        .eq('id', task.id);

      const { error: updErr } = await adminClient
        .from('orders')
        .update({ status: 'picked_up' })
        .eq('id', order.id);

      if (updErr) {
        return jsonError(500, 'INTERNAL_ERROR', updErr.message, requestId);
      }
    } else {
      // out_for_delivery
      await adminClient
        .from('delivery_tasks')
        .update({ status: 'arrived_customer' })
        .eq('id', task.id);

      const { error: updErr } = await adminClient
        .from('orders')
        .update({ status: 'out_for_delivery' })
        .eq('id', order.id);

      if (updErr) {
        return jsonError(500, 'INTERNAL_ERROR', updErr.message, requestId);
      }
    }

    await adminClient.from('audit_logs').insert({
      actor_id: actorId,
      actor_role: isAdmin ? 'admin' : 'rider',
      action: `order.${payload.action}`,
      entity_type: 'orders',
      entity_id: order.id,
      old_data: { status: currentStatus },
      new_data: { status: riderNextStatus },
      metadata: {
        request_id: requestId,
        ...(payload.action === 'delivered' && order.payment_method === 'cod'
          ? { cod_cash_collected: true, cash_collected_paise: payload.cash_collected_paise ?? order.total_paise }
          : {}),
      },
    });

    return jsonResponse(200, {
      order_id: order.id,
      order_number: order.order_number,
      previous_status: currentStatus,
      status: riderNextStatus,
      updated_at: nowIso,
    });
  }

  // Customer: cancel (only before pickup)
  if (payload.action === 'cancel') {
    if (!isAdmin && order.customer_id !== actorId) {
      return jsonError(403, 'FORBIDDEN', 'Only the order customer can cancel this order', requestId);
    }

    const prePickupStatuses: OrderStatus[] = [
      'created',
      'payment_pending',
      'placed',
      'accepted',
      'preparing',
      'ready_for_pickup',
      'rider_assigned',
    ];
    if (!prePickupStatuses.includes(currentStatus) || !canTransitionOrderStatus(currentStatus, 'cancelled')) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        `Order cannot be cancelled once status is '${currentStatus}'`,
        requestId,
      );
    }

    const { data: cancelRes, error: cancelErr } = await userClient.rpc(
      'cancel_order_and_release_stock',
      {
        p_order_id: order.id,
        p_reason: payload.reason ?? 'customer_cancelled',
      },
    );

    if (cancelErr || !cancelRes) {
      return jsonError(400, 'VALIDATION_ERROR', cancelErr?.message ?? 'Failed to cancel order', requestId);
    }

    return jsonResponse(200, {
      order_id: order.id,
      order_number: order.order_number,
      previous_status: currentStatus,
      status: cancelRes.status,
      cancelled_at: nowIso,
    });
  }

  return jsonError(400, 'VALIDATION_ERROR', 'Unsupported action', requestId);
});
