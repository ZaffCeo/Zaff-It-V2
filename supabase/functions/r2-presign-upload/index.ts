import { createClient } from 'npm:@supabase/supabase-js@^2.49.0';
import { z } from 'npm:zod@^3.24.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const EXPIRES_IN_SECONDS = 120;

const uploadRequestSchema = z.object({
  purpose: z.enum(['rider_shift_selfie', 'merchant_kyc', 'product_image']),
  content_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  file_ext: z.enum(['jpg', 'jpeg', 'png', 'webp', 'pdf']),
});

const ALLOWED_ROLES_BY_PURPOSE: Record<z.infer<typeof uploadRequestSchema>['purpose'], string[]> = {
  rider_shift_selfie: ['rider', 'admin'],
  merchant_kyc: ['merchant', 'admin'],
  product_image: ['merchant', 'admin'],
};

function jsonError(status: number, code: string, message: string, requestId: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message, request_id: requestId } }),
    { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: Uint8Array | string, data: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const rawKey = typeof key === 'string' ? enc.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
}

async function presignR2PutUrl(params: {
  accountId: string;
  bucket: string;
  objectKey: string;
  accessKeyId: string;
  secretAccessKey: string;
  contentType: string;
  expiresInSeconds: number;
}): Promise<string> {
  const host = `${params.accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalUri = `/${params.bucket}/${params.objectKey.split('/').map(encodeURIComponent).join('/')}`;

  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${params.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(params.expiresInSeconds),
    'X-Amz-SignedHeaders': 'content-type;host',
  });
  query.sort();

  const canonicalHeaders = `content-type:${params.contentType}\nhost:${host}\n`;
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    query.toString(),
    canonicalHeaders,
    'content-type;host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = new Uint8Array(await hmacSha256(`AWS4${params.secretAccessKey}`, dateStamp));
  const kRegion = new Uint8Array(await hmacSha256(kDate, 'auto'));
  const kService = new Uint8Array(await hmacSha256(kRegion, 's3'));
  const kSigning = new Uint8Array(await hmacSha256(kService, 'aws4_request'));
  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  return `https://${host}${canonicalUri}?${query.toString()}&X-Amz-Signature=${signature}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
  if (req.method !== 'POST') return jsonError(405, 'VALIDATION_ERROR', 'Method not allowed', requestId);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r2AccountId = Deno.env.get('R2_ACCOUNT_ID');
  const r2AccessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const r2SecretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const r2Bucket = Deno.env.get('R2_BUCKET_NAME');
  const r2PublicBaseUrl = Deno.env.get('R2_PUBLIC_BASE_URL');

  if (!supabaseUrl || !anonKey || !serviceKey || !r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
    return jsonError(500, 'INTERNAL_ERROR', 'Server storage configuration missing', requestId);
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid JSON body', requestId);
  }

  const parsed = uploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid upload request payload', requestId);
  }

  const { purpose, content_type, file_ext } = parsed.data;
  if (purpose !== 'merchant_kyc' && content_type === 'application/pdf') {
    return jsonError(400, 'VALIDATION_ERROR', 'PDF uploads are only allowed for merchant_kyc', requestId);
  }

  // Authorize caller role from user_roles
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: roles } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', authData.user.id)
    .eq('is_active', true);

  const allowedRoles = ALLOWED_ROLES_BY_PURPOSE[purpose];
  const hasRole = (roles ?? []).some((r) => allowedRoles.includes(r.role));
  if (!hasRole) {
    return jsonError(403, 'FORBIDDEN', 'Insufficient role for requested upload purpose', requestId);
  }

  const dateFolder = new Date().toISOString().slice(0, 10);
  const prefix = purpose === 'rider_shift_selfie' ? 'shifts' : purpose === 'merchant_kyc' ? 'kyc' : 'catalogue';
  const objectKey = `${prefix}/${authData.user.id}/${dateFolder}/${crypto.randomUUID()}.${file_ext}`;

  const uploadUrl = await presignR2PutUrl({
    accountId: r2AccountId,
    bucket: r2Bucket,
    objectKey,
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
    contentType: content_type,
    expiresInSeconds: EXPIRES_IN_SECONDS,
  });

  return new Response(
    JSON.stringify({
      upload_url: uploadUrl,
      object_key: objectKey,
      public_url: purpose === 'product_image' && r2PublicBaseUrl ? `${r2PublicBaseUrl.replace(/\/$/, '')}/${objectKey}` : null,
      expires_in_seconds: EXPIRES_IN_SECONDS,
    }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});
