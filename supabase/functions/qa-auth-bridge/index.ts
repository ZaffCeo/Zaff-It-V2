/**
 * qa-auth-bridge — TEST-ONLY session minter for E2E QA (supersedes demo login
 * for server-side flows; demo sessions are local mocks without a Supabase JWT
 * and cannot pass checkout-create-order auth).
 *
 * Security:
 *  - Requires header x-qa-token == secret QA_AUTH_TOKEN.
 *  - Phone allowlist: ONLY the three QA numbers can be minted. Any other
 *    phone is refused. Remove/lock down before enabling real SMS auth.
 *
 * Flow: ensure auth user (phone-confirmed) -> set app_metadata.role ->
 * upsert user_roles -> admin.generateLink(type sms) -> verifyOtp as the user
 * -> return real Supabase session (access_token/refresh_token).
 */
import { createClient } from 'npm:@supabase/supabase-js@^2.49.0';
import { z } from 'npm:zod@^3.24.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWLIST = new Set([
  '+919829012345', // QA customer
  '+919829012346', // QA merchant
  '+919829012347', // QA rider
]);

const schema = z.object({
  phone: z.string().regex(/^\+\d{10,15}$/),
  role: z.enum(['customer', 'merchant', 'rider']).default('customer'),
});

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  const token = Deno.env.get('QA_AUTH_TOKEN');
  if (!token || req.headers.get('x-qa-token') !== token) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !service || !anon) {
    return new Response(JSON.stringify({ error: 'config missing' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  let body: z.infer<typeof schema>;
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: 'bad payload' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    body = parsed.data;
  } catch {
    return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  if (!ALLOWLIST.has(body.phone)) {
    return new Response(JSON.stringify({ error: 'phone not in QA allowlist' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1) ensure user
  let userId: string | null = null;
  const created = await admin.auth.admin.createUser({
    phone: body.phone,
    phone_confirm: true,
    app_metadata: { role: body.role },
  });
  if (created.data?.user) {
    userId = created.data.user.id;
  } else {
    // existing user: find by phone across pages (project is tiny)
    let page = 1;
    while (!userId && page <= 10) {
      const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const norm = (v?: string | null) => (v ?? '').replace(/^\+/, '');
      const hit = listed.data?.users?.find((u) => norm(u.phone) === norm(body.phone));
      if (hit) userId = hit.id;
      if (!listed.data?.users?.length || (listed.data.users.length < 200)) break;
      page += 1;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: 'user lookup failed', detail: created.error?.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    await admin.auth.admin.updateUserById(userId, { app_metadata: { role: body.role } });
  }

  // 2) role row (idempotent)
  await admin.from('user_roles').upsert(
    { user_id: userId, role: body.role, is_active: true },
    { onConflict: 'user_id,role' },
  );

  // 3) Deterministic QA login: attach email + password to the phone user and
  // sign in with password (generateLink type 'sms' is unavailable on this
  // GoTrue version — "An email address is required").
  const email = `qa.${body.role}.makrana@zaff-qa.test`;
  const password = `QaBridge-${body.role}-2026!Session`;
  const updated = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
    password,
  });
  if (updated.error) {
    return new Response(JSON.stringify({ error: 'updateUser failed', detail: updated.error.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // 4) sign in as the end user -> real session
  const userClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const signed = await userClient.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data?.session) {
    return new Response(JSON.stringify({ error: 'signIn failed', detail: signed.error?.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({
    user_id: signed.data.user.id,
    phone: body.phone,
    email,
    role: body.role,
    access_token: signed.data.session.access_token,
    refresh_token: signed.data.session.refresh_token,
    expires_in: signed.data.session.expires_in,
  }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
});
