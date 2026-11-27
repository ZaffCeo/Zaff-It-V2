import { createClient } from 'npm:@supabase/supabase-js@^2.49.0';
import { z } from 'npm:zod@^3.24.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const cartPreviewRequestSchema = z
  .object({
    store_id: z.string().uuid(),
    address_id: z.string().uuid().optional().nullable(),
    lat: z.number().min(-90).max(90).optional().nullable(),
    lng: z.number().min(-180).max(180).optional().nullable(),
    promo_code: z.string().trim().min(1).max(32).toUpperCase().optional().nullable(),
    coupon_code: z.string().trim().min(1).max(32).toUpperCase().optional().nullable(),
    items: z
      .array(
        z.object({
          product_id: z.string().uuid(),
          quantity: z.number().int().min(1).max(50),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (data) =>
      Boolean(data.address_id) ||
      (typeof data.lat === 'number' && typeof data.lng === 'number'),
    {
      message: 'Either address_id or both lat and lng coordinates are required',
      path: ['address_id'],
    },
  );

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

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isPointInPolygon(lat: number, lng: number, geojson: Record<string, unknown>): boolean {
  const coords = geojson?.coordinates;
  if (!Array.isArray(coords) || !Array.isArray(coords[0])) return false;
  const ring = coords[0] as [number, number][];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
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
  const userId = authData.user.id;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid JSON body', requestId);
  }

  const parsed = cartPreviewRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid cart preview payload', requestId, {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const payload = parsed.data;
  const promoCode = payload.promo_code ?? payload.coupon_code ?? null;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // 1. Resolve coordinates from address_id or explicit lat/lng
  let deliveryLat = payload.lat ?? null;
  let deliveryLng = payload.lng ?? null;

  if (payload.address_id) {
    const { data: addr, error: addrErr } = await adminClient
      .from('addresses')
      .select('id, user_id, lat, lng')
      .eq('id', payload.address_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (addrErr || !addr) {
      return jsonError(404, 'NOT_FOUND', 'Delivery address not found', requestId);
    }
    deliveryLat = addr.lat;
    deliveryLng = addr.lng;
  }

  if (deliveryLat === null || deliveryLng === null) {
    return jsonError(400, 'VALIDATION_ERROR', 'Delivery coordinates could not be resolved', requestId);
  }

  // 2. Fetch store and its service_zone
  const { data: store, error: storeErr } = await adminClient
    .from('stores')
    .select('id, name, service_zone_id, is_active, is_open, min_order_paise, fulfillment_type')
    .eq('id', payload.store_id)
    .maybeSingle();

  if (storeErr || !store) {
    return jsonError(404, 'NOT_FOUND', 'Store not found', requestId);
  }
  if (!store.is_active || !store.is_open) {
    return jsonError(422, 'OUT_OF_SERVICE_ZONE', 'Store is currently closed or inactive', requestId);
  }

  const { data: zone, error: zoneErr } = await adminClient
    .from('service_zones')
    .select(
      'id, code, name, city, center_lat, center_lng, radius_meters, geojson_polygon, base_delivery_fee_paise, free_delivery_threshold_paise, launch_free_delivery, service_open_time, service_close_time, night_close_time, is_active',
    )
    .eq('id', store.service_zone_id)
    .maybeSingle();

  if (zoneErr || !zone || !zone.is_active) {
    return jsonError(422, 'OUT_OF_SERVICE_ZONE', 'Service zone is inactive', requestId);
  }

  // Service hours (doc): 06:00-21:00 IST; Zone-B night extension till night_close_time
  // applies only to dark_store (kwick) fulfillment. Mirror of orders_service_hours_guard.
  const toMinutes = (t: string | null): number | null => {
    if (!t) return null;
    const [h, m] = t.split(':');
    return Number(h) * 60 + Number(m);
  };
  const istNow = new Date(Date.now() + 330 * 60 * 1000); // UTC+5:30
  const nowMin = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
  const openMin = toMinutes(zone.service_open_time) ?? 6 * 60;
  const closeMin = toMinutes(zone.service_close_time) ?? 21 * 60;
  const nightMin = toMinutes(zone.night_close_time ?? null);
  const withinHours =
    (nowMin >= openMin && nowMin < closeMin) ||
    (nightMin !== null &&
      store.fulfillment_type === 'dark_store' &&
      (nowMin >= openMin || nowMin < nightMin));
  if (!withinHours) {
    return jsonError(422, 'STORE_CLOSED', 'Store is currently outside service hours (IST ' + zone.service_open_time + ' to ' + zone.service_close_time + ')', requestId);
  }

  const inPolygon =
    zone.geojson_polygon && typeof zone.geojson_polygon === 'object'
      ? isPointInPolygon(deliveryLat, deliveryLng, zone.geojson_polygon as Record<string, unknown>)
      : false;
  const distanceMeters = haversineMeters(deliveryLat, deliveryLng, zone.center_lat, zone.center_lng);
  const serviceable = zone.geojson_polygon ? inPolygon : distanceMeters <= zone.radius_meters;

  if (!serviceable) {
    return jsonError(422, 'OUT_OF_SERVICE_ZONE', 'Delivery location is outside the store service zone', requestId, {
      zone_id: zone.id,
      zone_name: zone.name,
      distance_meters: Math.round(distanceMeters),
    });
  }

  // 3. Fetch live store_products, products, and inventory.available_to_sell
  const productIds = [...new Set(payload.items.map((item) => item.product_id))];
  const { data: storeProducts, error: spErr } = await adminClient
    .from('store_products')
    .select(
      `
      id,
      product_id,
      mrp_paise,
      selling_price_paise,
      max_qty_per_order,
      is_available,
      products!inner (
        id,
        name,
        unit_label,
        gst_bps,
        is_active
      ),
      inventory!inner (
        available_to_sell
      )
    `,
    )
    .eq('store_id', payload.store_id)
    .in('product_id', productIds);

  if (spErr) {
    return jsonError(500, 'INTERNAL_ERROR', 'Failed to load store inventory', requestId);
  }

  type StoreProductRow = {
    id: string;
    product_id: string;
    mrp_paise: number;
    selling_price_paise: number;
    max_qty_per_order: number;
    is_available: boolean;
    products: {
      id: string;
      name: string;
      unit_label: string;
      gst_bps: number;
      is_active: boolean;
    };
    inventory: { available_to_sell: number } | { available_to_sell: number }[];
  };

  const spMap = new Map<string, StoreProductRow>();
  for (const row of (storeProducts ?? []) as unknown as StoreProductRow[]) {
    spMap.set(row.product_id, row);
  }

  if (spMap.size !== productIds.length) {
    return jsonError(404, 'NOT_FOUND', 'One or more products were not found in this store', requestId);
  }

  let subtotalPaise = 0;
  let taxPaise = 0;
  let allItemsAvailable = true;

  const previewItems = payload.items.map((item) => {
    const sp = spMap.get(item.product_id)!;
    const inv = Array.isArray(sp.inventory) ? sp.inventory[0] : sp.inventory;
    const availableToSell = inv?.available_to_sell ?? 0;
    const inStock =
      sp.is_available &&
      sp.products.is_active &&
      availableToSell >= item.quantity &&
      item.quantity <= sp.max_qty_per_order;

    if (!inStock) allItemsAvailable = false;

    const lineTotalPaise = sp.selling_price_paise * item.quantity;
    const lineTaxPaise = Math.round(
      (lineTotalPaise * sp.products.gst_bps) / (10000 + sp.products.gst_bps),
    );

    subtotalPaise += lineTotalPaise;
    taxPaise += lineTaxPaise;

    return {
      product_id: sp.product_id,
      store_product_id: sp.id,
      name: sp.products.name,
      unit_label: sp.products.unit_label,
      quantity: item.quantity,
      mrp_paise: sp.mrp_paise,
      unit_price_paise: sp.selling_price_paise,
      line_total_paise: lineTotalPaise,
      line_tax_paise: lineTaxPaise,
      available_to_sell: availableToSell,
      max_qty_per_order: sp.max_qty_per_order,
      in_stock: inStock,
    };
  });

  // 4. Compute delivery fee — doc §6 distance slabs (mirror of create_checkout_order RPC)
  // 0-3 km ₹25 · 3-6 km ₹30 · 6-10 km ₹50; free at >= ₹199 subtotal or launch free-delivery month.
  const deliveryFeePaise = zone.launch_free_delivery
    ? 0
    : subtotalPaise >= zone.free_delivery_threshold_paise
      ? 0
      : distanceMeters <= 3000
        ? 2500
        : distanceMeters <= 6000
          ? 3000
          : 5000;

  // Handling fee — doc §6: ₹5 (cart < ₹199) · ₹10 (cart >= ₹199)
  const handlingFeePaise = subtotalPaise < 19900 ? 500 : 1000;

  // 5. Validate optional promo_code against promotions table
  let discountPaise = 0;
  let couponApplied = false;
  let promoError: string | null = null;

  if (promoCode) {
    const nowIso = new Date().toISOString();
    const { data: promo } = await adminClient
      .from('promotions')
      .select(
        'id, code, discount_type, discount_value, max_discount_paise, min_order_paise, service_zone_id, store_id, usage_limit, used_count, starts_at, ends_at, is_active',
      )
      .ilike('code', promoCode)
      .eq('is_active', true)
      .lte('starts_at', nowIso)
      .gte('ends_at', nowIso)
      .maybeSingle();

    if (!promo) {
      promoError = 'Invalid or expired promo code';
    } else if (promo.usage_limit !== null && promo.used_count >= promo.usage_limit) {
      promoError = 'Promo code usage limit reached';
    } else if (promo.service_zone_id && promo.service_zone_id !== zone.id) {
      promoError = 'Promo code is not valid in this service zone';
    } else if (promo.store_id && promo.store_id !== store.id) {
      promoError = 'Promo code is not valid for this store';
    } else if (subtotalPaise < promo.min_order_paise) {
      promoError = `Minimum order of ${promo.min_order_paise} paise required`;
    } else {
      if (promo.discount_type === 'flat_paise') {
        discountPaise = promo.discount_value;
      } else {
        discountPaise = Math.floor((subtotalPaise * promo.discount_value) / 10000);
        if (promo.max_discount_paise !== null) {
          discountPaise = Math.min(discountPaise, promo.max_discount_paise);
        }
      }
      discountPaise = Math.min(discountPaise, subtotalPaise);
      couponApplied = true;
    }
  }

  const totalPaise = Math.max(0, subtotalPaise + deliveryFeePaise + handlingFeePaise - discountPaise);

  // W6 wallet preview (10 coins = Rs1): usable <= 10% of product value, fees never wallet-paid.
  let walletBalanceCoins = 0;
  try {
    const { data: bal } = await adminClient.rpc('wallet_spendable', { p_user_id: userId });
    walletBalanceCoins = Math.trunc(Number(bal ?? 0));
  } catch {
    walletBalanceCoins = 0;
  }
  const walletUsableCoins = Math.min(walletBalanceCoins, Math.floor(subtotalPaise / 100));

  return jsonResponse(200, {
    store_id: store.id,
    serviceable: true,
    zone: {
      id: zone.id,
      code: zone.code,
      name: zone.name,
      free_delivery_threshold_paise: zone.free_delivery_threshold_paise,
      launch_free_delivery: zone.launch_free_delivery,
      service_open_time: zone.service_open_time,
      service_close_time: zone.service_close_time,
      night_close_time: zone.night_close_time,
    },
    items: previewItems,
    all_items_available: allItemsAvailable,
    meets_min_order: subtotalPaise >= store.min_order_paise,
    min_order_paise: store.min_order_paise,
    subtotal_paise: subtotalPaise,
    delivery_fee_paise: deliveryFeePaise,
    handling_fee_paise: handlingFeePaise,
    discount_paise: discountPaise,
    tax_paise: taxPaise,
    total_paise: totalPaise,
    grand_total_paise: totalPaise,
    delivery_distance_meters: Math.round(distanceMeters),
    wallet: {
      balance_coins: walletBalanceCoins,
      usable_coins: walletUsableCoins,
      usable_paise: walletUsableCoins * 10,
    },
    promo_code: promoCode,
    coupon_applied: couponApplied,
    ...(promoError ? { promo_error: promoError } : {}),
  });
});
