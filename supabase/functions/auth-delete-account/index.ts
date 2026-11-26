import { createClient } from 'npm:@supabase/supabase-js@^2.49.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
};

const TERMINAL_ORDER_STATUSES = ['delivered', 'cancelled', 'refunded'];
const TERMINAL_DELIVERY_STATUSES = ['delivered', 'failed', 'cancelled'];

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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
  if (req.method !== 'POST' && req.method !== 'DELETE') {
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
  const userId = authData.user.id;

  const adminClient = createClient(supabaseUrl, serviceKey);

  // 1. Block deletion if user has active non-terminal customer orders
  const { data: activeOrders, error: ordersErr } = await adminClient
    .from('orders')
    .select('id, order_number, status')
    .eq('customer_id', userId)
    .not('status', 'in', `(${TERMINAL_ORDER_STATUSES.join(',')})`);

  if (ordersErr) {
    return jsonError(500, 'INTERNAL_ERROR', 'Failed to verify active orders', requestId);
  }

  if (activeOrders && activeOrders.length > 0) {
    return jsonError(
      409,
      'VALIDATION_ERROR',
      'Cannot delete account while you have active non-terminal orders',
      requestId,
      {
        active_order_count: activeOrders.length,
        active_order_numbers: activeOrders.map((o: { order_number: string }) => o.order_number),
      },
    );
  }

  // Also block if user is a rider with active delivery tasks
  const { data: activeTasks, error: tasksErr } = await adminClient
    .from('delivery_tasks')
    .select('id, order_id, status')
    .eq('rider_id', userId)
    .not('status', 'in', `(${TERMINAL_DELIVERY_STATUSES.join(',')})`);

  if (tasksErr) {
    return jsonError(500, 'INTERNAL_ERROR', 'Failed to verify active delivery tasks', requestId);
  }

  if (activeTasks && activeTasks.length > 0) {
    return jsonError(
      409,
      'VALIDATION_ERROR',
      'Cannot delete account while you have active delivery tasks',
      requestId,
      { active_delivery_count: activeTasks.length },
    );
  }

  // 2. Anonymize profile PII & remove saved addresses
  const anonymizedAt = new Date().toISOString();
  const { error: profileErr } = await adminClient
    .from('profiles')
    .update({
      full_name: 'Deleted User',
      phone: null,
      email: null,
      avatar_url: null,
      is_active: false,
    })
    .eq('id', userId);

  if (profileErr) {
    return jsonError(500, 'INTERNAL_ERROR', 'Failed to anonymize profile PII', requestId);
  }

  await adminClient.from('addresses').delete().eq('user_id', userId);

  // 3. Record audit log prior to auth user deletion
  await adminClient.from('audit_logs').insert({
    actor_id: userId,
    actor_role: 'customer',
    action: 'account.delete',
    entity_type: 'profiles',
    entity_id: userId,
    old_data: null,
    new_data: { anonymized: true, is_active: false },
    metadata: { request_id: requestId, deleted_at: anonymizedAt },
  });

  // 4. Delete auth user via service_role admin client
  const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteErr) {
    return jsonError(500, 'INTERNAL_ERROR', deleteErr.message ?? 'Failed to delete auth user', requestId);
  }

  return jsonResponse(200, {
    status: 'deleted',
    user_id: userId,
    deleted_at: anonymizedAt,
  });
});
