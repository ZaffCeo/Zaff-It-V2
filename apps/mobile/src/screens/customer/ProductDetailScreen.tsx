import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  STATUS_COLORS,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { formatPaise, useAppStore } from '@/store/useAppStore';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import { LoadingSkeleton, PrimaryButton } from '@/components/StateViews';

export type SubstitutionPolicy = 'call_me' | 'best_substitute' | 'refund_item';

export interface ProductDetailInput {
  product_id: string;
  store_id: string;
  store_name: string;
  name: string;
  brand?: string | null;
  description?: string | null;
  unit_label: string;
  mrp_paise: number;
  selling_price_paise: number;
  available_to_sell: number;
  image_url?: string | null;
}

const FALLBACK_PRODUCT: ProductDetailInput = {
  product_id: 'prod_rice_5kg',
  store_id: 'str_makrana_kirana_01',
  store_name: 'Marwar Kirana & General Store',
  name: 'India Gate Basmati Rice (Classic)',
  brand: 'India Gate',
  description:
    'Aged long-grain basmati rice sourced fresh from Marwar Kirana & General Store, Makrana.',
  unit_label: '5 kg',
  mrp_paise: 49900,
  selling_price_paise: 45900,
  available_to_sell: 15,
  image_url: null,
};

const SUBSTITUTION_OPTIONS: Array<{
  id: SubstitutionPolicy;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    id: 'call_me',
    title: 'Call me',
    subtitle: 'Merchant calls you before replacing an out-of-stock item',
    icon: 'call-outline',
  },
  {
    id: 'best_substitute',
    title: 'Best substitute',
    subtitle: 'Replace with closest brand & pack size at same or lower price',
    icon: 'swap-horizontal-outline',
  },
  {
    id: 'refund_item',
    title: 'Refund item',
    subtitle: 'Skip unavailable item and auto-refund to original payment method',
    icon: 'wallet-outline',
  },
];

export const ProductDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const params = (route.params ?? {}) as {
    product?: ProductDetailInput;
    productId?: string;
    storeId?: string;
  };

  const colorScheme = useAppStore((s) => s.colorScheme);
  const cartItems = useAppStore((s) => s.cartItems);
  const addToCart = useAppStore((s) => s.addToCart);
  const replaceCartWithItem = useAppStore((s) => s.replaceCartWithItem);
  const updateItemQuantity = useAppStore((s) => s.updateItemQuantity);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [product, setProduct] = useState<ProductDetailInput>(
    params.product ?? FALLBACK_PRODUCT,
  );
  const [loading, setLoading] = useState(false);
  const [substitutionPolicy, setSubstitutionPolicy] =
    useState<SubstitutionPolicy>('call_me');

  const fetchLiveStockAndProduct = useCallback(async () => {
    const targetProductId = params.product?.product_id ?? params.productId;
    const targetStoreId = params.product?.store_id ?? params.storeId;
    if (!isSupabaseConfigured() || !targetProductId || !targetStoreId) {
      return;
    }

    setLoading(true);
    try {
      const { data } = await supabase
        .from('store_products')
        .select(
          `
          mrp_paise,
          selling_price_paise,
          is_available,
          products:product_id ( id, name, brand, description, unit_label, image_url ),
          stores:store_id ( id, name ),
          inventory ( available_to_sell )
        `,
        )
        .eq('product_id', targetProductId)
        .eq('store_id', targetStoreId)
        .maybeSingle();

      if (data) {
        const prod = data.products as unknown as {
          id: string;
          name: string;
          brand: string | null;
          description: string | null;
          unit_label: string;
          image_url: string | null;
        } | null;
        const store = data.stores as unknown as { id: string; name: string } | null;
        const inv = Array.isArray(data.inventory)
          ? (data.inventory[0] as { available_to_sell?: number } | undefined)
          : (data.inventory as { available_to_sell?: number } | null);

        if (prod && store) {
          setProduct({
            product_id: prod.id,
            store_id: store.id,
            store_name: store.name,
            name: prod.name,
            brand: prod.brand,
            description: prod.description,
            unit_label: prod.unit_label,
            mrp_paise: Math.trunc(data.mrp_paise),
            selling_price_paise: Math.trunc(data.selling_price_paise),
            available_to_sell: data.is_available
              ? Math.max(0, Math.trunc(inv?.available_to_sell ?? 0))
              : 0,
            image_url: prod.image_url,
          });
        }
      }
    } catch {
      // Keep initial/fallback product data
    } finally {
      setLoading(false);
    }
  }, [params.product, params.productId, params.storeId]);

  useEffect(() => {
    fetchLiveStockAndProduct();
  }, [fetchLiveStockAndProduct]);

  const inCartQty =
    cartItems.find((i) => i.productId === product.product_id)?.quantity ?? 0;
  const outOfStock = product.available_to_sell <= 0;
  const lowStock = product.available_to_sell > 0 && product.available_to_sell <= 5;
  const hasSavings = product.mrp_paise > product.selling_price_paise;
  const savingsPct = hasSavings
    ? Math.round(
        ((product.mrp_paise - product.selling_price_paise) * 100) /
          product.mrp_paise,
      )
    : 0;

  const handleAddToBasket = () => {
    if (outOfStock) return;
    const payload = {
      productId: product.product_id,
      storeId: product.store_id,
      storeName: product.store_name,
      name: product.name,
      unitLabel: product.unit_label,
      unitPricePaise: product.selling_price_paise,
      mrpPaise: product.mrp_paise,
      imageUrl: product.image_url ?? null,
    };
    const result = addToCart(payload);
    if (result.switchedStore) {
      Alert.alert(
        'Replace basket?',
        `Your basket currently has items from another store. Switch to ${product.store_name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace Basket',
            onPress: () => replaceCartWithItem(payload),
          },
        ],
      );
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: surface.background }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <View style={styles.headerRow}>
          {navigation.canGoBack() ? (
            <Pressable
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={[styles.iconBtn, { borderColor: surface.border }]}
            >
              <Ionicons name="arrow-back" size={20} color={surface.textPrimary} />
            </Pressable>
          ) : null}
          <Text
            style={[styles.headerTitle, { color: surface.textPrimary }]}
            numberOfLines={1}
          >
            {product.store_name}
          </Text>
          <Pressable
            onPress={fetchLiveStockAndProduct}
            accessibilityRole="button"
            accessibilityLabel="Refresh live stock"
            style={[styles.iconBtn, { borderColor: surface.border }]}
          >
            <Ionicons name="refresh" size={18} color={surface.textPrimary} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading ? <LoadingSkeleton rows={2} mode={colorScheme} /> : null}

        {/* Hero Image / Icon */}
        <View
          style={[
            styles.mediaCard,
            { backgroundColor: surface.surface1, borderColor: surface.border },
          ]}
        >
          {product.image_url !== null &&
          product.image_url !== undefined &&
          product.image_url !== '' ? (
            <Image
              source={{ uri: product.image_url }}
              style={styles.productImage}
              resizeMode="contain"
            />
          ) : (
            <View
              style={[
                styles.iconPlaceholder,
                { backgroundColor: BRAND_COLORS.goldenYellowGlow },
              ]}
            >
              <Ionicons
                name="basket-outline"
                size={64}
                color={BRAND_COLORS.charcoalBlack}
              />
            </View>
          )}

          {/* Live available_to_sell stock badge */}
          <View
            style={[
              styles.stockBadge,
              {
                backgroundColor: outOfStock
                  ? STATUS_COLORS.errorBgLight
                  : lowStock
                    ? STATUS_COLORS.warningBgLight
                    : STATUS_COLORS.successBgLight,
              },
            ]}
          >
            <Ionicons
              name={
                outOfStock
                  ? 'close-circle'
                  : lowStock
                    ? 'alert-circle'
                    : 'checkmark-circle'
              }
              size={15}
              color={
                outOfStock
                  ? STATUS_COLORS.errorTextLight
                  : lowStock
                    ? STATUS_COLORS.warningTextLight
                    : STATUS_COLORS.successTextLight
              }
            />
            <Text
              style={[
                styles.stockBadgeText,
                {
                  color: outOfStock
                    ? STATUS_COLORS.errorTextLight
                    : lowStock
                      ? STATUS_COLORS.warningTextLight
                      : STATUS_COLORS.successTextLight,
                },
              ]}
            >
              {outOfStock
                ? 'Out of Stock'
                : lowStock
                  ? `Only ${product.available_to_sell} left`
                  : `In Stock • ${product.available_to_sell} available`}
            </Text>
          </View>
        </View>

        {/* Product Info & Paise Pricing */}
        <View
          style={[
            styles.infoCard,
            { backgroundColor: surface.surface1, borderColor: surface.border },
          ]}
        >
          {product.brand !== null &&
          product.brand !== undefined &&
          product.brand !== '' ? (
            <Text style={[styles.brandText, { color: BRAND_COLORS.electricGreen }]}>
              {product.brand.toUpperCase()}
            </Text>
          ) : null}

          <Text style={[styles.productTitle, { color: surface.textPrimary }]}>
            {product.name}
          </Text>
          <Text style={[styles.unitLabel, { color: surface.textMuted }]}>
            Pack Size: {product.unit_label}
          </Text>

          <View style={styles.priceRow}>
            <Text style={[styles.sellingPrice, { color: surface.textPrimary }]}>
              {formatPaise(product.selling_price_paise)}
            </Text>
            {hasSavings ? (
              <Text style={[styles.mrpPrice, { color: surface.textMuted }]}>
                MRP {formatPaise(product.mrp_paise)}
              </Text>
            ) : null}
            {savingsPct > 0 ? (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>{savingsPct}% OFF</Text>
              </View>
            ) : null}
          </View>

          {product.description !== null &&
          product.description !== undefined &&
          product.description !== '' ? (
            <Text style={[styles.descriptionText, { color: surface.textSecondary }]}>
              {product.description}
            </Text>
          ) : null}
        </View>

        {/* Substitution Policy Selector */}
        <View
          style={[
            styles.infoCard,
            { backgroundColor: surface.surface1, borderColor: surface.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
            If this item is unavailable
          </Text>
          {SUBSTITUTION_OPTIONS.map((opt) => {
            const selected = substitutionPolicy === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSubstitutionPolicy(opt.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                style={[
                  styles.subOption,
                  {
                    backgroundColor: selected
                      ? BRAND_COLORS.goldenYellowGlow
                      : surface.surface2,
                    borderColor: selected
                      ? BRAND_COLORS.goldenYellow
                      : surface.border,
                  },
                ]}
              >
                <Ionicons
                  name={opt.icon}
                  size={20}
                  color={surface.textPrimary}
                />
                <View style={styles.subTextWrap}>
                  <Text style={[styles.subTitle, { color: surface.textPrimary }]}>
                    {opt.title}
                  </Text>
                  <Text style={[styles.subSubtitle, { color: surface.textMuted }]}>
                    {opt.subtitle}
                  </Text>
                </View>
                <Ionicons
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={
                    selected ? BRAND_COLORS.electricGreen : surface.textMuted
                  }
                />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Bottom >=48dp Add to Basket CTA Bar */}
      <View
        style={[
          styles.bottomBar,
          { backgroundColor: surface.surface1, borderTopColor: surface.border },
        ]}
      >
        {inCartQty > 0 ? (
          <View style={styles.qtyRow}>
            <View style={styles.stepperWrap}>
              <Pressable
                onPress={() => updateItemQuantity(product.product_id, -1)}
                accessibilityRole="button"
                accessibilityLabel="Decrease quantity"
                style={styles.stepperBtn}
              >
                <Ionicons name="remove" size={20} color={BRAND_COLORS.pureWhite} />
              </Pressable>
              <Text style={styles.stepperQty}>{inCartQty}</Text>
              <Pressable
                onPress={() => updateItemQuantity(product.product_id, 1)}
                accessibilityRole="button"
                accessibilityLabel="Increase quantity"
                style={styles.stepperBtn}
              >
                <Ionicons name="add" size={20} color={BRAND_COLORS.pureWhite} />
              </Pressable>
            </View>
            <View style={styles.bottomCtaFlex}>
              <PrimaryButton
                label={`In Basket • ${formatPaise(product.selling_price_paise * inCartQty)}`}
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  }
                }}
                variant="primary"
                mode={colorScheme}
                style={styles.ctaHeight}
              />
            </View>
          </View>
        ) : (
          <PrimaryButton
            label={
              outOfStock
                ? 'Currently Out of Stock'
                : `Add to Basket • ${formatPaise(product.selling_price_paise)}`
            }
            onPress={handleAddToBasket}
            disabled={outOfStock}
            variant="success"
            icon="bag-add-outline"
            mode={colorScheme}
            style={styles.ctaHeight}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '700',
  },
  iconBtn: {
    minWidth: TOUCH_TARGETS.minSize,
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: SPACING.screenPadding,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  mediaCard: {
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: SPACING.md,
  },
  productImage: {
    width: '100%',
    height: 180,
    borderRadius: RADII.md,
  },
  iconPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: RADII.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADII.full,
  },
  stockBadgeText: {
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '700',
  },
  infoCard: {
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  brandText: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  productTitle: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '800',
  },
  unitLabel: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  sellingPrice: {
    fontSize: TYPOGRAPHY.headlineLg.fontSize,
    fontWeight: '800',
  },
  mrpPrice: {
    fontSize: TYPOGRAPHY.bodyLg.fontSize,
    textDecorationLine: 'line-through',
  },
  discountBadge: {
    backgroundColor: BRAND_COLORS.electricGreenSurface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADII.sm,
  },
  discountText: {
    color: BRAND_COLORS.electricGreen,
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '800',
  },
  descriptionText: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    lineHeight: TYPOGRAPHY.bodyMd.lineHeight,
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '700',
  },
  subOption: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1,
    gap: SPACING.md,
  },
  subTextWrap: {
    flex: 1,
  },
  subTitle: {
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '700',
  },
  subSubtitle: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    marginTop: 2,
  },
  bottomBar: {
    padding: SPACING.screenPadding,
    borderTopWidth: 1,
  },
  ctaHeight: {
    minHeight: TOUCH_TARGETS.recommendedSize,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND_COLORS.electricGreen,
    borderRadius: RADII.md,
    minHeight: TOUCH_TARGETS.recommendedSize,
  },
  stepperBtn: {
    minWidth: TOUCH_TARGETS.minSize,
    minHeight: TOUCH_TARGETS.recommendedSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperQty: {
    color: BRAND_COLORS.pureWhite,
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'center',
  },
  bottomCtaFlex: {
    flex: 1,
  },
});
