import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { lookupBarcodeAny } from '@/services/productLookup';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  STATUS_COLORS,
  SURFACE_DARK,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';

export type InventoryLoadState = 'ready' | 'loading' | 'empty' | 'error';
export type StockFilter = 'all' | 'low_stock' | 'out_of_stock';

export interface StoreProductItem {
  id: string;
  sku: string;
  name: string;
  unitLabel: string;
  pricePaise: number;
  on_hand: number;
  reserved: number;
  lowStockThreshold: number;
}

export interface MerchantInventoryScreenProps {
  initialState?: InventoryLoadState;
  initialProducts?: StoreProductItem[];
  onAdjustStock?: (productId: string, nextOnHand: number) => Promise<void> | void;
  onRefresh?: () => Promise<StoreProductItem[] | void> | void;
}

const DEFAULT_PRODUCTS: StoreProductItem[] = [
  {
    id: 'sp_01',
    sku: 'DAIRY-AMUL-500',
    name: 'Amul Taaza Toned Milk',
    unitLabel: '500 ml pouch',
    pricePaise: 2700,
    on_hand: 24,
    reserved: 4,
    lowStockThreshold: 6,
  },
  {
    id: 'sp_02',
    sku: 'ATTA-AASH-5KG',
    name: 'Aashirvaad Shudh Chakki Atta',
    unitLabel: '5 kg bag',
    pricePaise: 24500,
    on_hand: 5,
    reserved: 2,
    lowStockThreshold: 5,
  },
  {
    id: 'sp_03',
    sku: 'OIL-FORT-1L',
    name: 'Fortune Sunlite Refined Oil',
    unitLabel: '1 L pouch',
    pricePaise: 13800,
    on_hand: 16,
    reserved: 1,
    lowStockThreshold: 4,
  },
  {
    id: 'sp_04',
    sku: 'RICE-BSM-1KG',
    name: 'Classic Rozana Basmati Rice',
    unitLabel: '1 kg pack',
    pricePaise: 9800,
    on_hand: 2,
    reserved: 2,
    lowStockThreshold: 5,
  },
];

function formatPaiseToINR(paise: number): string {
  const rupees = paise / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(rupees);
  } catch {
    return `₹${rupees.toFixed(2)}`;
  }
}

export const MerchantInventoryScreen: React.FC<MerchantInventoryScreenProps> = ({
  initialState = 'ready',
  initialProducts = DEFAULT_PRODUCTS,
  onAdjustStock,
  onRefresh,
}) => {
  const [loadState, setLoadState] = useState<InventoryLoadState>(initialState);
  const [products, setProducts] = useState<StoreProductItem[]>(initialProducts);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<StockFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeStatus, setBarcodeStatus] = useState<string | null>(null);

  const handleBarcodeLookup = useCallback(async () => {
    const code = barcodeInput.trim();
    if (!code) return;
    setBarcodeLoading(true);
    setBarcodeStatus(null);
    try {
      const found = await lookupBarcodeAny(code);
      if (!found) {
        setBarcodeStatus('Barcode not found (Food Facts, Products Facts & UPCitemdb). Add manually.');
      } else {
        const nextItem: StoreProductItem = {
          id: `sp_off_${found.barcode}`,
          sku: `EAN-${found.barcode}`,
          name: `${found.brand} ${found.name}`.trim(),
          unitLabel: found.quantityLabel,
          pricePaise: 0,
          on_hand: 10,
          reserved: 0,
          lowStockThreshold: 3,
        };
        setProducts((prev) => [nextItem, ...prev.filter((p) => p.id !== nextItem.id)]);
        setBarcodeStatus(`Auto-filled: ${nextItem.name} (${nextItem.unitLabel}) — set selling price`);
        setBarcodeInput('');
      }
    } catch (err) {
      setBarcodeStatus(err instanceof Error ? err.message : 'Barcode lookup failed.');
    } finally {
      setBarcodeLoading(false);
    }
  }, [barcodeInput]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (onRefresh) {
        const updated = await onRefresh();
        if (updated) setProducts(updated);
      }
      setLoadState('ready');
    } catch {
      setLoadState('error');
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const handleStepStock = useCallback(
    (productId: string, delta: number) => {
      setProducts((prev) =>
        prev.map((item) => {
          if (item.id !== productId) return item;
          const nextOnHand = Math.max(item.reserved, item.on_hand + delta);
          if (onAdjustStock) {
            void onAdjustStock(productId, nextOnHand);
          }
          return { ...item, on_hand: nextOnHand };
        })
      );
    },
    [onAdjustStock]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((item) => {
      const availableToSell = Math.max(0, item.on_hand - item.reserved);
      if (activeFilter === 'out_of_stock' && availableToSell > 0) return false;
      if (
        activeFilter === 'low_stock' &&
        (availableToSell === 0 || availableToSell > item.lowStockThreshold)
      ) {
        return false;
      }
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
    });
  }, [activeFilter, products, searchQuery]);

  if (loadState === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.container}>
          <View style={styles.skeletonBar} />
          <View style={styles.skeletonCard} />
          <View style={styles.skeletonCard} />
          <View style={styles.skeletonCard} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'error') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.stateContainer}>
          <Text style={styles.stateTitle}>Inventory Sync Failed</Text>
          <Text style={styles.stateBody}>
            Could not load store_products catalog. Please check network connectivity and retry.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={handleRefresh}
            accessibilityRole="button"
          >
            <Text style={styles.retryBtnText}>Retry Loading Catalog</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.headerBlock}>
        <Text style={styles.screenTitle}>Store Inventory</Text>
        <Text style={styles.screenSubtitle}>
          Tap + / - to adjust on-hand stock. Available = On Hand − Reserved.
        </Text>

        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search product name or SKU..."
          placeholderTextColor={SURFACE_DARK.textMuted}
          returnKeyType="search"
          accessibilityLabel="Search store products"
        />

        <View style={styles.barcodeRow}>
          <TextInput
            style={styles.barcodeInput}
            value={barcodeInput}
            onChangeText={setBarcodeInput}
            placeholder="Scan/enter EAN barcode (Open Food Facts)..."
            placeholderTextColor={SURFACE_DARK.textMuted}
            keyboardType="number-pad"
            accessibilityLabel="EAN barcode lookup"
          />
          <TouchableOpacity
            style={styles.barcodeBtn}
            onPress={handleBarcodeLookup}
            disabled={barcodeLoading}
            accessibilityRole="button"
          >
            <Text style={styles.barcodeBtnText}>{barcodeLoading ? '...' : 'Auto-Fill'}</Text>
          </TouchableOpacity>
        </View>
        {barcodeStatus ? <Text style={styles.barcodeStatusText}>{barcodeStatus}</Text> : null}

        <View style={styles.filterRow}>
          {(
            [
              { key: 'all', label: 'All SKUs' },
              { key: 'low_stock', label: 'Low Stock' },
              { key: 'out_of_stock', label: 'Out of Stock' },
            ] as const
          ).map((chip) => {
            const selected = activeFilter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                style={[styles.filterChip, selected && styles.filterChipActive]}
                onPress={() => setActiveFilter(chip.key)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {loadState === 'empty' || filteredProducts.length === 0 ? (
        <View style={styles.stateContainer}>
          <Text style={styles.stateTitle}>No Matching Products</Text>
          <Text style={styles.stateBody}>
            {searchQuery || activeFilter !== 'all'
              ? 'Try clearing your search or stock filter.'
              : 'No store_products are mapped to your store yet.'}
          </Text>
          {(searchQuery.length > 0 || activeFilter !== 'all') && (
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => {
                setSearchQuery('');
                setActiveFilter('all');
              }}
              accessibilityRole="button"
            >
              <Text style={styles.retryBtnText}>Reset Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={BRAND_COLORS.goldenYellow}
            />
          }
          renderItem={({ item }) => {
            const availableToSell = Math.max(0, item.on_hand - item.reserved);
            const isOutOfStock = availableToSell === 0;
            const isLowStock = !isOutOfStock && availableToSell <= item.lowStockThreshold;
            const canDecrement = item.on_hand > item.reserved;

            return (
              <View style={styles.productCard}>
                <View style={styles.productTopRow}>
                  <View style={styles.productInfoCol}>
                    <Text style={styles.skuText}>{item.sku}</Text>
                    <Text style={styles.productName}>{item.name}</Text>
                    <Text style={styles.unitPriceText}>
                      {item.unitLabel} · {formatPaiseToINR(item.pricePaise)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.stockBadge,
                      isOutOfStock
                        ? { backgroundColor: STATUS_COLORS.errorBgDark }
                        : isLowStock
                          ? { backgroundColor: STATUS_COLORS.warningBgDark }
                          : { backgroundColor: STATUS_COLORS.successBgDark },
                    ]}
                  >
                    <Text
                      style={[
                        styles.stockBadgeText,
                        {
                          color: isOutOfStock
                            ? STATUS_COLORS.errorBright
                            : isLowStock
                              ? STATUS_COLORS.warningBright
                              : BRAND_COLORS.electricGreenLight,
                        },
                      ]}
                    >
                      {isOutOfStock ? 'OUT OF STOCK' : isLowStock ? 'LOW STOCK' : 'IN STOCK'}
                    </Text>
                  </View>
                </View>

                <View style={styles.metricsAndStepperRow}>
                  <View style={styles.stockMetricsRow}>
                    <View style={styles.metricCell}>
                      <Text style={styles.metricLabel}>On Hand</Text>
                      <Text style={styles.metricValue}>{item.on_hand}</Text>
                    </View>
                    <View style={styles.metricCell}>
                      <Text style={styles.metricLabel}>Reserved</Text>
                      <Text style={styles.metricValue}>{item.reserved}</Text>
                    </View>
                    <View style={styles.metricCell}>
                      <Text style={styles.metricLabel}>Available</Text>
                      <Text
                        style={[
                          styles.metricValue,
                          {
                            color: isOutOfStock
                              ? STATUS_COLORS.errorBright
                              : BRAND_COLORS.electricGreenLight,
                          },
                        ]}
                      >
                        {availableToSell}
                      </Text>
                    </View>
                  </View>

                  {/* >=44dp (48dp) Stepper Touch Targets */}
                  <View style={styles.stepperGroup}>
                    <TouchableOpacity
                      style={[styles.stepperBtn, !canDecrement && styles.stepperBtnDisabled]}
                      onPress={() => handleStepStock(item.id, -1)}
                      disabled={!canDecrement}
                      hitSlop={TOUCH_TARGETS.hitSlopDefault}
                      accessibilityRole="button"
                      accessibilityLabel={`Decrease stock for ${item.name}`}
                    >
                      <Text style={styles.stepperBtnText}>−</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.stepperBtn, styles.stepperBtnPlus]}
                      onPress={() => handleStepStock(item.id, 1)}
                      hitSlop={TOUCH_TARGETS.hitSlopDefault}
                      accessibilityRole="button"
                      accessibilityLabel={`Increase stock for ${item.name}`}
                    >
                      <Text style={[styles.stepperBtnText, styles.stepperBtnPlusText]}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: SURFACE_DARK.background,
  },
  container: {
    padding: SPACING.screenPadding,
    gap: SPACING.md,
  },
  headerBlock: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: SURFACE_DARK.border,
  },
  screenTitle: {
    ...TYPOGRAPHY.headlineLg,
    color: SURFACE_DARK.textPrimary,
  },
  screenSubtitle: {
    ...TYPOGRAPHY.bodySm,
    color: SURFACE_DARK.textMuted,
  },
  searchInput: {
    minHeight: TOUCH_TARGETS.recommendedSize,
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
    paddingHorizontal: SPACING.md,
    color: SURFACE_DARK.textPrimary,
    ...TYPOGRAPHY.bodyMd,
  },
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  filterChip: {
    minHeight: TOUCH_TARGETS.chipMinHeight,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.full,
    backgroundColor: SURFACE_DARK.surface2,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderColor: BRAND_COLORS.goldenYellow,
  },
  filterChipText: {
    ...TYPOGRAPHY.labelMd,
    color: SURFACE_DARK.textSecondary,
  },
  filterChipTextActive: {
    color: SURFACE_DARK.onPrimary,
  },
  listContent: {
    padding: SPACING.screenPadding,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  productCard: {
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.lg,
    padding: SPACING.cardPadding,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    gap: SPACING.md,
  },
  productTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  productInfoCol: {
    flex: 1,
    gap: SPACING.xxs,
  },
  skuText: {
    ...TYPOGRAPHY.captionMin,
    color: SURFACE_DARK.textMuted,
    fontVariant: ['tabular-nums'],
  },
  productName: {
    ...TYPOGRAPHY.titleMd,
    color: SURFACE_DARK.textPrimary,
  },
  unitPriceText: {
    ...TYPOGRAPHY.bodySm,
    color: SURFACE_DARK.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  stockBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.sm,
  },
  stockBadgeText: {
    ...TYPOGRAPHY.captionMin,
  },
  metricsAndStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: SURFACE_DARK.border,
  },
  stockMetricsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.md,
  },
  metricCell: {
    gap: SPACING.xxs,
  },
  metricLabel: {
    ...TYPOGRAPHY.captionMin,
    color: SURFACE_DARK.textMuted,
  },
  metricValue: {
    ...TYPOGRAPHY.titleMd,
    color: SURFACE_DARK.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  stepperGroup: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  stepperBtn: {
    minWidth: TOUCH_TARGETS.recommendedSize,
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface2,
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperBtnPlus: {
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderColor: BRAND_COLORS.goldenYellow,
  },
  stepperBtnText: {
    ...TYPOGRAPHY.headlineMd,
    color: SURFACE_DARK.textPrimary,
  },
  stepperBtnPlusText: {
    color: SURFACE_DARK.onPrimary,
  },
  stateContainer: {
    flex: 1,
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  stateTitle: {
    ...TYPOGRAPHY.headlineMd,
    color: SURFACE_DARK.textPrimary,
    textAlign: 'center',
  },
  stateBody: {
    ...TYPOGRAPHY.bodyMd,
    color: SURFACE_DARK.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    ...TYPOGRAPHY.labelLg,
    color: SURFACE_DARK.onPrimary,
  },
  skeletonBar: {
    height: 48,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface2,
  },
  skeletonCard: {
    height: 118,
    borderRadius: RADII.lg,
    backgroundColor: SURFACE_DARK.surface2,
  },
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  barcodeInput: {
    flex: 1,
    minHeight: TOUCH_TARGETS.minSize,
    backgroundColor: SURFACE_DARK.surface2,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    paddingHorizontal: SPACING.md,
    color: SURFACE_DARK.textPrimary,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
  barcodeBtn: {
    minHeight: TOUCH_TARGETS.minSize,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.goldenYellow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barcodeBtnText: {
    color: BRAND_COLORS.charcoalBlack,
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '800',
  },
  barcodeStatusText: {
    marginTop: SPACING.xs,
    color: BRAND_COLORS.goldenYellow,
    fontSize: TYPOGRAPHY.captionMin.fontSize,
  },
});

export default MerchantInventoryScreen;
