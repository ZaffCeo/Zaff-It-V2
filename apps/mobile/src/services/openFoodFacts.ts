export interface OpenFoodFactsProduct {
  barcode: string;
  name: string;
  brand: string;
  quantityLabel: string;
  imageUrl: string | null;
  categoryHint: string;
  source:
    | 'open_food_facts_india'
    | 'open_products_facts'
    | 'upcitemdb_free_tier';
}

interface OffApiResponse {
  status?: number;
  product?: {
    product_name?: string;
    product_name_en?: string;
    brands?: string;
    quantity?: string;
    image_front_small_url?: string;
    image_url?: string;
    categories?: string;
  };
}

/**
 * Free, open-source Open Food Facts India barcode lookup (ODbL).
 * Auto-fills packaged FMCG name, brand, pack size, and image for merchant onboarding.
 * Store-specific MRP and selling price in paise must still be entered by the merchant.
 */
export async function lookupBarcodeOpenFoodFacts(
  rawBarcode: string
): Promise<OpenFoodFactsProduct | null> {
  const barcode = rawBarcode.replace(/\D/g, '');
  if (barcode.length < 8 || barcode.length > 14) {
    throw new Error('Enter a valid 8–14 digit EAN/GTIN barcode.');
  }

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
    barcode
  )}.json?fields=product_name,product_name_en,brands,quantity,image_front_small_url,image_url,categories`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ZAFF-IT-Merchant/1.0 (https://zaff-it.in)',
    },
  });

  if (!res.ok) {
    throw new Error(`Open Food Facts lookup failed (${res.status}).`);
  }

  const data = (await res.json()) as OffApiResponse;
  if (data.status !== 1 || !data.product) {
    return null;
  }

  const p = data.product;
  const name = (p.product_name_en || p.product_name || '').trim();
  if (!name) return null;

  return {
    barcode,
    name,
    brand: (p.brands || '').split(',')[0]?.trim() || 'Generic',
    quantityLabel: (p.quantity || '1 unit').trim(),
    imageUrl: p.image_front_small_url || p.image_url || null,
    categoryHint: (p.categories || 'Groceries').split(',')[0]?.trim() || 'Groceries',
    source: 'open_food_facts_india',
  };
}
