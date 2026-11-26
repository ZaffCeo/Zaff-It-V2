import {
  lookupBarcodeOpenFoodFacts,
  type OpenFoodFactsProduct,
} from '@/services/openFoodFacts';

export type ProductLookupResult = OpenFoodFactsProduct;

interface UpcItemDbResponse {
  code?: string;
  total?: number;
  items?: Array<{
    title?: string;
    brand?: string;
    model?: string;
    category?: string;
    images?: string[];
  }>;
}

/**
 * UPCitemdb free Trial API — 100 req/day, 6/min, per-IP, NO API KEY.
 * Global fallback for barcodes missing from Open Food Facts / Open Products Facts.
 */
async function lookupBarcodeUpcItemDb(rawBarcode: string): Promise<ProductLookupResult | null> {
  const barcode = rawBarcode.replace(/\D/g, '');
  if (barcode.length < 8 || barcode.length > 14) {
    throw new Error('Enter a valid 8–14 digit EAN/GTIN barcode.');
  }

  const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ZAFF-IT-Merchant/1.0 (https://zaff-it.in)',
      },
    });
  } catch {
    return null; // network hiccup — fall through to manual entry
  }

  if (!res.ok) {
    // 429 = free-tier rate limit (100/day, 6/min) — treat as miss, not error
    return null;
  }

  const data = (await res.json()) as UpcItemDbResponse;
  if (data.code !== 'OK' || !data.items || data.items.length === 0) {
    return null;
  }

  const p = data.items[0];
  const name = (p.title || '').trim();
  if (!name) return null;

  return {
    barcode,
    name,
    brand: (p.brand || '').trim() || 'Generic',
    quantityLabel: (p.model || '1 unit').trim() || '1 unit',
    imageUrl: (p.images && p.images[0]) || null,
    categoryHint: (p.category || 'Groceries').split(',').pop()?.trim() || 'Groceries',
    source: 'upcitemdb_free_tier',
  };
}

/**
 * Open Products Facts — non-food packaged goods (home care, cosmetics, hardware).
 * Mirrors the Open Food Facts v2 API shape.
 */
async function lookupBarcodeOpenProductsFacts(
  rawBarcode: string,
): Promise<ProductLookupResult | null> {
  const barcode = rawBarcode.replace(/\D/g, '');
  if (barcode.length < 8 || barcode.length > 14) {
    throw new Error('Enter a valid 8–14 digit EAN/GTIN barcode.');
  }

  let res: Response;
  try {
    res = await fetch(
      `https://world.openproductsfacts.org/api/v2/product/${encodeURIComponent(
        barcode,
      )}.json?fields=product_name,brands,quantity,image_front_small_url,image_url,categories`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ZAFF-IT-Merchant/1.0 (https://zaff-it.in)',
        },
      },
    );
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const data = (await res.json()) as { status?: number; product?: Record<string, string> };
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  const name = (p.product_name_en || p.product_name || '').trim();
  if (!name) return null;

  return {
    barcode,
    name,
    brand: (p.brands || '').split(',')[0]?.trim() || 'Generic',
    quantityLabel: (p.quantity || '1 unit').trim(),
    imageUrl: p.image_front_small_url || p.image_url || null,
    categoryHint: (p.categories || 'Home Care').split(',')[0]?.trim() || 'Home Care',
    source: 'open_products_facts',
  };
}

/**
 * Multi-source product lookup chain for merchant barcode scanning:
 *   1. Open Food Facts (India packaged food — unlimited free)
 *   2. Open Products Facts (non-food packaged goods — unlimited free)
 *   3. UPCitemdb Trial (global fallback — 100/day free, no key)
 *
 * Returns null when every source misses → merchant enters details manually.
 * MRP / selling price are ALWAYS merchant-entered (never trusted from catalogues).
 */
export async function lookupBarcodeAny(rawBarcode: string): Promise<ProductLookupResult | null> {
  const barcode = rawBarcode.replace(/\D/g, '');
  if (barcode.length < 8 || barcode.length > 14) {
    throw new Error('Enter a valid 8–14 digit EAN/GTIN barcode.');
  }

  // 1) Open Food Facts (may throw on network failure — first source reports errors)
  const food = await lookupBarcodeOpenFoodFacts(barcode).catch(() => null);
  if (food) return food;

  // 2) Open Products Facts (silent)
  const product = await lookupBarcodeOpenProductsFacts(barcode).catch(() => null);
  if (product) return product;

  // 3) UPCitemdb free trial (silent)
  const global = await lookupBarcodeUpcItemDb(barcode).catch(() => null);
  if (global) return global;

  return null;
}
