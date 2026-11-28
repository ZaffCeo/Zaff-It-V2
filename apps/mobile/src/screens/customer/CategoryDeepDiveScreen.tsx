import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  BRAND_COLORS,
  pickProductArt,
  RADII,
  SPACING,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { useAppStore, type CartItem } from '@/store/useAppStore';
import { supabase, isSupabaseConfigured } from '@/services/supabase';
import { EmptyState, ErrorRetryBanner, LoadingSkeleton } from '@/components/StateViews';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';
import type { ProductDetailInput } from '@/screens/customer/ProductDetailScreen';

type DbCategory = { id: string; name: string };

type CatalogueRow = {
  product_id: string;
  store_id: string;
  store_name: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  category_name: string;
  category_id: string;
  unit_label: string;
  mrp_paise: number;
  selling_price_paise: number;
  available_to_sell: number;
};

type SortMode = 'suggested' | 'price_up' | 'price_down';

export const CategoryDeepDiveScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const route = useRoute<{
    key: string;
    name: 'CategoryDeepDive';
    params?: { category?: string };
  }>();

  const colorScheme = useAppStore((s) => s.colorScheme);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;
  const addToCart = useAppStore((s) => s.addToCart);

  const [categories, setCategories] = useState<DbCategory[]>([]);
  const [selected, setSelected] = useState<string>(route.params?.category ?? 'All');
  const [rows, setRows] = useState<CatalogueRow[]>([]);
  const [localQuery, setLocalQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('suggested');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      if (!isSupabaseConfigured()) {
        setErrorMsg('Backend unavailable. Internet check karein.');
        setRows([]);
        return;
      }
      const { data: cats, error: catsErr } = await supabase
        .from('categories')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (catsErr) {
        setErrorMsg(catsErr.message);
        return;
      }
      setCategories((cats ?? []) as DbCategory[]);

      const { data: storesData } = await supabase
        .from('stores')
        .select('id, name, eta_min_minutes, eta_max_minutes')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1);

      const primaryStore = (storesData ?? [])[0] as
        | { id: string; name: string; eta_min_minutes: number; eta_max_minutes: number }
        | undefined;
      if (!primaryStore) {
        setRows([]);
        return;
      }

      const matchedCat = ((cats ?? []) as DbCategory[]).find(
        (c) => c.name.toLowerCase() === (route.params?.category ?? '').toLowerCase(),
      );

      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_store_catalogue', {
        p_store_id: primaryStore.id,
        p_category_id: matchedCat?.id ?? null,
        p_search: null,
        p_limit: 60,
        p_offset: 0,
      });
      if (rpcErr) {
        setErrorMsg(rpcErr.message);
        return;
      }

      setRows(
        ((rpcData ?? []) as Array<Record<string, unknown>>).map((row) => ({
          product_id: String(row.product_id),
          store_id: primaryStore.id,
          store_name: primaryStore.name,
          name: String(row.name),
          brand: typeof row.brand === 'string' ? row.brand : null,
          image_url: typeof row.image_url === 'string' && row.image_url.length > 0 ? row.image_url : null,
          category_name: String(row.category_name ?? ''),
          category_id: String(row.category_id ?? ''),
          unit_label: String(row.unit_label ?? '1 unit'),
          mrp_paise: Math.trunc(Number(row.mrp_paise ?? 0)),
          selling_price_paise: Math.trunc(Number(row.selling_price_paise ?? 0)),
          available_to_sell: Math.trunc(Number(row.available_to_sell ?? 0)),
        })),
      );
    } catch {
      setErrorMsg('Load nahi hua. Retry karein.');
    } finally {
      setLoading(false);
    }
  }, [route.params?.category]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleRows = useMemo(() => {
    let list = rows;
    if (selected !== 'All') {
      list = list.filter(
        (r) =>
          r.category_name.toLowerCase().includes(selected.toLowerCase()) ||
          selected.toLowerCase().includes(r.category_name.toLowerCase()),
      );
    }
    const q = localQuery.trim().toLowerCase();
    if (q.length > 0) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.brand ?? '').toLowerCase().includes(q),
      );
    }
    if (sortMode === 'price_up') list = [...list].sort((a, b) => a.selling_price_paise - b.selling_price_paise);
    if (sortMode === 'price_down') list = [...list].sort((a, b) => b.selling_price_paise - a.selling_price_paise);
    return list;
  }, [rows, selected, localQuery, sortMode]);

  const quickAdd = (row: CatalogueRow) => {
    const payload: Omit<CartItem, 'quantity'> = {
      productId: row.product_id,
      storeId: row.store_id,
      storeName: row.store_name,
      name: row.name,
      unitLabel: row.unit_label,
      unitPricePaise: row.selling_price_paise,
      mrpPaise: row.mrp_paise,
    };
    addToCart(payload);
    setAddedId(row.product_id);
    setTimeout(() => setAddedId(null), 900);
  };

  const openProduct = (row: CatalogueRow) => {
    const payload: ProductDetailInput = {
      product_id: row.product_id,
      store_id: row.store_id,
      store_name: row.store_name,
      name: row.name,
      brand: row.brand,
      description: null,
      unit_label: row.unit_label,
      mrp_paise: row.mrp_paise,
      selling_price_paise: row.selling_price_paise,
      available_to_sell: row.available_to_sell,
      image_url: row.image_url,
    };
    navigation.navigate('ProductDetail', { product: payload });
  };

  const formatPrice = (paise: number) =>
    `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;

  const sortChips: Array<{ id: SortMode; label: string }> = [
    { id: 'suggested', label: '✨ Suggested' },
    { id: 'price_up', label: '₹ Price ↑' },
    { id: 'price_down', label: '₹ Price ↓' },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: surface.background }]}>
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        {navigation.canGoBack() ? (
          <Pressable
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
            }}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color={surface.textPrimary} />
          </Pressable>
        ) : null}
        <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>
          {route.params?.category ?? 'Explore'}
        </Text>
      </View>

      <View style={[styles.filterBar, { borderBottomColor: surface.border }]}>
        <View
          style={[styles.miniSearch, { backgroundColor: surface.surface1, borderColor: surface.border }]}
        >
          <Ionicons name="search" size={15} color={surface.textSecondary} />
          <TextInput
            value={localQuery}
            onChangeText={setLocalQuery}
            placeholder="Is list me dhundo..."
            placeholderTextColor={surface.textMuted}
            style={[styles.miniSearchInput, { color: surface.textPrimary }]}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortRow}
        >
          {sortChips.map((chip) => {
            const active = sortMode === chip.id;
            return (
              <Pressable
                key={chip.id}
                onPress={() => setSortMode(chip.id)}
                style={[
                  styles.sortChip,
                  {
                    backgroundColor: active ? BRAND_COLORS.goldenYellow : surface.surface1,
                    borderColor: active ? BRAND_COLORS.goldenYellow : surface.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sortChipText,
                    { color: active ? BRAND_COLORS.charcoalBlack : surface.textPrimary },
                  ]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* DB-true category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catStrip}
      >
        {['All', ...categories.map((c) => c.name)].map((name) => {
          const active = selected === name;
          return (
            <Pressable
              key={name}
              onPress={() => setSelected(active ? 'All' : name)}
              style={[
                styles.catChip,
                {
                  backgroundColor: active ? BRAND_COLORS.goldenYellow : surface.surface1,
                  borderColor: active ? BRAND_COLORS.goldenYellow : surface.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.catChipText,
                  { color: active ? BRAND_COLORS.charcoalBlack : surface.textPrimary },
                ]}
              >
                {name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {errorMsg ? (
        <ErrorRetryBanner message={errorMsg} retryLabel="Retry" onRetry={load} mode={colorScheme} />
      ) : null}

      <ScrollView contentContainerStyle={styles.gridWrap} showsVerticalScrollIndicator={false}>
        {loading ? (
          <LoadingSkeleton rows={6} mode={colorScheme} />
        ) : visibleRows.length === 0 ? (
          <EmptyState
            icon="grid-outline"
            title="Is category me abhi kuch nahi"
            subtitle="Merchant jaldi hi items add karenge. Doosri category dekhein!"
            mode={colorScheme}
          />
        ) : (
          <View style={styles.grid}>
            {visibleRows.map((row) => {
              const off =
                row.mrp_paise > row.selling_price_paise
                  ? Math.round(((row.mrp_paise - row.selling_price_paise) / row.mrp_paise) * 100)
                  : 0;
              const justAdded = addedId === row.product_id;
              return (
                <View
                  key={`${row.product_id}-${row.store_id}`}
                  style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}
                >
                  <Pressable onPress={() => openProduct(row)}>
                    <Image
                      source={
                        row.image_url
                          ? { uri: row.image_url }
                          : { uri: pickProductArt(row.name) }
                      }
                      style={styles.cardImage}
                      resizeMode="cover"
                    />
                    {off > 0 && (
                      <View style={styles.offPill}>
                        <Text style={styles.offText}>{off}% OFF</Text>
                      </View>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => openProduct(row)}
                    style={styles.cardBody}
                  >
                    <Text numberOfLines={2} style={[styles.cardName, { color: surface.textPrimary }]}>
                      {row.name}
                    </Text>
                    <Text style={[styles.cardUnit, { color: surface.textSecondary }]}>
                      {row.unit_label}
                    </Text>
                    <View style={styles.priceRow}>
                      <Text style={[styles.cardPrice, { color: surface.textPrimary }]}>
                        {formatPrice(row.selling_price_paise)}
                      </Text>
                      {off > 0 && (
                        <Text style={[styles.cardMrp, { color: surface.textMuted }]}>
                          {formatPrice(row.mrp_paise)}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => quickAdd(row)}
                    disabled={row.available_to_sell <= 0}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${row.name} to basket`}
                    style={[
                      styles.addBtn,
                      {
                        backgroundColor:
                          row.available_to_sell <= 0
                            ? surface.border
                            : justAdded
                              ? BRAND_COLORS.electricGreen
                              : BRAND_COLORS.goldenYellow,
                      },
                    ]}
                  >
                    <Ionicons
                      name={justAdded ? 'checkmark' : 'add'}
                      size={18}
                      color={BRAND_COLORS.charcoalBlack}
                    />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: { fontSize: TYPOGRAPHY.headlineMd.fontSize, fontWeight: '800' },
  filterBar: {
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    gap: SPACING.sm,
  },
  miniSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADII.full,
    borderWidth: 1,
  },
  miniSearchInput: { flex: 1, fontSize: TYPOGRAPHY.bodySm.fontSize, paddingVertical: 0 },
  sortRow: { gap: SPACING.xs, alignItems: 'center' },
  sortChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADII.full,
    borderWidth: 1,
  },
  sortChipText: { fontSize: TYPOGRAPHY.captionMin.fontSize, fontWeight: '700' },
  catStrip: { paddingHorizontal: SPACING.screenPadding, paddingVertical: SPACING.sm, gap: SPACING.xs },
  catChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADII.full,
    borderWidth: 1,
  },
  catChipText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '700' },
  gridWrap: { padding: SPACING.screenPadding, paddingBottom: SPACING.xxl },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    justifyContent: 'space-between',
  },
  card: {
    width: '48.5%',
    borderRadius: RADII.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: SPACING.xs,
  },
  cardImage: { width: '100%', height: 108, backgroundColor: 'rgba(0,0,0,0.06)' },
  offPill: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: BRAND_COLORS.goldenYellow,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADII.sm,
  },
  offText: { fontSize: 10, fontWeight: '800', color: BRAND_COLORS.charcoalBlack },
  cardBody: { padding: SPACING.sm, gap: 2 },
  cardName: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '700', lineHeight: 17 },
  cardUnit: { fontSize: TYPOGRAPHY.captionMin.fontSize },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardPrice: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '800' },
  cardMrp: { fontSize: TYPOGRAPHY.captionMin.fontSize, textDecorationLine: 'line-through' },
  addBtn: {
    marginHorizontal: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingVertical: 8,
    borderRadius: RADII.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
