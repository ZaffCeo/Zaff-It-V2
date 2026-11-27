import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useAppStore } from '@/store/useAppStore';
import { supabase, isSupabaseConfigured } from '@/services/supabase';
import { EmptyState, ErrorRetryBanner, LoadingSkeleton } from '@/components/StateViews';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';
import type { ProductDetailInput } from '@/screens/customer/ProductDetailScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENTS_KEY = 'zaff_search_recents_v1';

type SearchRow = {
  product_id: string;
  store_id: string;
  store_name: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  category_name: string;
  unit_label: string;
  mrp_paise: number;
  selling_price_paise: number;
  available_to_sell: number;
};

type SponsoredRow = {
  campaign_id: string;
  headline: string;
  store_id: string;
  store_name: string;
  product_id: string;
  product_name: string;
  unit_label: string;
  mrp_paise: number;
  selling_price_paise: number;
  available_to_sell: number;
};

/**
 * Display-only intent hints (subset). The authoritative synonym dictionary
 * lives server-side (public.search_synonyms) and powers actual matching;
 * this map just explains to the user what their Hindi/Hinglish query matched.
 */
const INTENT_HINTS: Record<string, string> = {
  doodh: 'Milk', dudh: 'Milk', 'दूध': 'Milk',
  makkhan: 'Butter', 'मक्खन': 'Butter',
  aata: 'Atta', 'आटा': 'Atta',
  chawal: 'Rice', 'चावल': 'Rice', chaawal: 'Rice',
  namak: 'Salt', 'नमक': 'Salt',
  tel: 'Oil', 'तेल': 'Oil',
  biskut: 'Biscuit', 'बिस्कुट': 'Biscuit',
  aalu: 'Potato', aloo: 'Potato', 'आलू': 'Potato',
  pyaaz: 'Onion', pyaz: 'Onion', 'प्याज़': 'Onion',
  tamatar: 'Tomato', 'टमाटर': 'Tomato',
};

const SUGGESTED_PROMPTS = [
  { id: 'milk', label: '🥛 Doodh / Milk', query: 'milk' },
  { id: 'atta', label: '🌾 Atta', query: 'atta' },
  { id: 'butter', label: '🧈 Butter', query: 'butter' },
  { id: 'rice', label: '🍚 Chawal / Rice', query: 'rice' },
  { id: 'salt', label: '🧂 Namak / Salt', query: 'salt' },
  { id: 'oil', label: '🛢️ Tel / Oil', query: 'oil' },
];

export const UniversalSearchScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const route = useRoute<{
    key: string;
    name: 'UniversalSearch';
    params?: { initialQuery?: string };
  }>();

  const colorScheme = useAppStore((s) => s.colorScheme);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [query, setQuery] = useState(route.params?.initialQuery ?? '');
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [sponsored, setSponsored] = useState<SponsoredRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(RECENTS_KEY)
      .then((raw) => {
        if (raw) setRecents(JSON.parse(raw) as string[]);
      })
      .catch(() => undefined);
    setTimeout(() => inputRef.current?.focus(), 350);
  }, []);

  const rememberRecent = useCallback((q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    setRecents((prev) => {
      const next = [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, 8);
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!isSupabaseConfigured()) {
      setErrorMsg('Search needs the Zaff-It backend. Check your connection.');
      setRows([]);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc('search_products', {
        p_query: q.trim().length > 0 ? q.trim() : null,
        p_store_id: null,
        p_category_id: null,
        p_limit: 40,
      });
      if (error) {
        setErrorMsg(error.message);
        setRows([]);
        return;
      }
      setRows(
        ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          product_id: String(row.product_id),
          store_id: String(row.store_id),
          store_name: String(row.store_name ?? ''),
          name: String(row.name),
          brand: typeof row.brand === 'string' ? row.brand : null,
          image_url: typeof row.image_url === 'string' && row.image_url.length > 0 ? row.image_url : null,
          category_name: String(row.category_name ?? ''),
          unit_label: String(row.unit_label ?? '1 unit'),
          mrp_paise: Math.trunc(Number(row.mrp_paise ?? 0)),
          selling_price_paise: Math.trunc(Number(row.selling_price_paise ?? 0)),
          available_to_sell: Math.trunc(Number(row.available_to_sell ?? 0)),
        })),
      );

      // W4c Zaff Ads: admin-approved sponsored placements (always labelled).
      try {
        const { data: adRows } = await supabase.rpc('get_sponsored_search', {
          p_query: q.trim(),
        });
        const adList = ((adRows ?? []) as unknown) as SponsoredRow[];
        setSponsored(Array.isArray(adList) ? adList : []);
        for (const ad of adList) {
          void supabase.rpc('record_ad_event', {
            p_campaign_id: ad.campaign_id,
            p_event_type: 'impression',
          });
        }
      } catch {
        setSponsored([]);
      }
    } catch {
      setErrorMsg('Kuch gadbad ho gayi. Dobara koshish karein.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const onChangeQuery = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), 300);
  };

  const openProduct = (row: SearchRow) => {
    rememberRecent(query);
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

  const openSponsored = (ad: SponsoredRow) => {
    void supabase.rpc('record_ad_event', {
      p_campaign_id: ad.campaign_id,
      p_event_type: 'click',
    });
    rememberRecent(query);
    const payload: ProductDetailInput = {
      product_id: ad.product_id,
      store_id: ad.store_id,
      store_name: ad.store_name,
      name: ad.product_name,
      brand: null,
      description: null,
      unit_label: ad.unit_label,
      mrp_paise: ad.mrp_paise,
      selling_price_paise: ad.selling_price_paise,
      available_to_sell: ad.available_to_sell,
      image_url: null,
    };
    navigation.navigate('ProductDetail', { product: payload });
  };

  const formatPrice = (paise: number) =>
    `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;

  const intentHintLabel = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/);
    for (const w of words) {
      const canon = INTENT_HINTS[w];
      if (canon) return `"${w}" = ${canon}`;
    }
    return null;
  }, [query]);
  const intentHint = intentHintLabel !== null && rows.length > 0;

  const showIdleState = query.trim().length === 0 && rows.length === 0 && !loading;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: surface.background }]}>
      {/* Search header */}
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={surface.textPrimary} />
        </Pressable>
        <View
          style={[
            styles.searchField,
            { backgroundColor: surface.surface1, borderColor: surface.border },
          ]}
        >
          <Ionicons name="search" size={18} color={surface.textSecondary} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={onChangeQuery}
            onSubmitEditing={() => rememberRecent(query)}
            placeholder="Need-It? Zaff-It. Search anything..."
            placeholderTextColor={surface.textMuted}
            returnKeyType="search"
            style={[styles.searchInput, { color: surface.textPrimary }]}
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => {
                setQuery('');
                setRows([]);
                runSearch('');
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={surface.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {errorMsg ? (
        <ErrorRetryBanner
          message={errorMsg}
          retryLabel="Retry"
          onRetry={() => runSearch(query)}
          mode={colorScheme}
        />
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <LoadingSkeleton rows={5} mode={colorScheme} />
        ) : showIdleState ? (
          <>
            {recents.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionRow}>
                  <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
                    Recent searches
                  </Text>
                  <Pressable
                    onPress={() => {
                      setRecents([]);
                      AsyncStorage.removeItem(RECENTS_KEY).catch(() => undefined);
                    }}
                  >
                    <Text style={[styles.clearText, { color: BRAND_COLORS.goldenYellow }]}>
                      Clear
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.chipWrap}>
                  {recents.map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => {
                        setQuery(r);
                        runSearch(r);
                      }}
                      style={[styles.chip, { backgroundColor: surface.surface1, borderColor: surface.border }]}
                    >
                      <Ionicons name="time-outline" size={14} color={surface.textSecondary} />
                      <Text style={[styles.chipText, { color: surface.textPrimary }]}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
                Aaj kya mangwana hai?
              </Text>
              <View style={styles.chipWrap}>
                {SUGGESTED_PROMPTS.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setQuery(p.query);
                      runSearch(p.query);
                    }}
                    style={[styles.chip, { backgroundColor: surface.surface1, borderColor: surface.border }]}
                  >
                    <Text style={[styles.chipText, { color: surface.textPrimary }]}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.mascotBlock}>
              <Image
                source={require('../../../assets/zaffy-mascot-v2.png')}
                style={styles.mascotImage}
                resizeMode="contain"
              />
              <Text style={[styles.mascotTitle, { color: surface.textPrimary }]}>
                Main Zaffy hoon!
              </Text>
              <Text style={[styles.mascotSub, { color: surface.textSecondary }]}>
                Type karo — milk, atta, doodh, sab mil jayega.{'\n'}
                Galat spelling bhi chal jayegi 😉
              </Text>
            </View>
          </>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="Kuch nahi mila"
            subtitle={`"${query}" ke liye koi product nahi hai. Spelling check karein ya kuch aur try karein.`}
            mode={colorScheme}
          />
        ) : (
          <>
            {intentHint ? (
              <View style={[styles.intentChip, { backgroundColor: 'rgba(255,199,3,0.12)', borderColor: 'rgba(255,199,3,0.35)' }]}>
                <Ionicons name="swap-horizontal" size={13} color={BRAND_COLORS.goldenYellow} />
                <Text style={[styles.intentChipText, { color: surface.textPrimary }]}>
                  {intentHintLabel}
                </Text>
              </View>
            ) : null}
            {sponsored.length > 0
              ? sponsored.map((ad) => (
                  <Pressable
                    key={`ad-${ad.campaign_id}`}
                    onPress={() => openSponsored(ad)}
                    style={[
                      styles.resultCard,
                      {
                        backgroundColor: 'rgba(255,199,3,0.10)',
                        borderColor: 'rgba(255,199,3,0.45)',
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Sponsored: ${ad.headline}`}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 12,
                          backgroundColor: BRAND_COLORS.goldenYellow,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="megaphone" size={18} color={BRAND_COLORS.charcoalBlack} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900', color: surface.textPrimary }}>
                          {ad.headline}
                        </Text>
                        <Text numberOfLines={1} style={{ fontSize: TYPOGRAPHY.bodySm.fontSize, color: surface.textMuted, marginTop: 1 }}>
                          {ad.product_name} · {ad.store_name}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '900', color: surface.textPrimary }}>
                          {formatPrice(ad.selling_price_paise)}
                        </Text>
                        <View
                          style={{
                            marginTop: 3,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 999,
                            backgroundColor: BRAND_COLORS.goldenYellow,
                          }}
                        >
                          <Text style={{ fontSize: 9, fontWeight: '900', color: BRAND_COLORS.charcoalBlack }}>
                            SPONSORED
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                ))
              : null}
            <Text style={[styles.resultCount, { color: surface.textSecondary }]}>
              {rows.length} result{rows.length === 1 ? '' : 's'} · sab stores me search kiya
            </Text>
            {rows.map((row) => {
              const off = row.mrp_paise > row.selling_price_paise
                ? Math.round(((row.mrp_paise - row.selling_price_paise) / row.mrp_paise) * 100)
                : 0;
              return (
                <Pressable
                  key={`${row.product_id}-${row.store_id}`}
                  onPress={() => openProduct(row)}
                  style={({ pressed }) => [
                    styles.resultCard,
                    {
                      backgroundColor: surface.surface1,
                      borderColor: surface.border,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <Image
                    source={
                      row.image_url
                        ? { uri: row.image_url }
                        : { uri: pickProductArt(row.name) }
                    }
                    style={styles.resultImage}
                    resizeMode="cover"
                  />
                  <View style={styles.resultBody}>
                    <Text numberOfLines={2} style={[styles.resultName, { color: surface.textPrimary }]}>
                      {row.name}
                    </Text>
                    <Text numberOfLines={1} style={[styles.resultStore, { color: surface.textSecondary }]}>
                      🏪 {row.store_name} · {row.category_name}
                    </Text>
                    <View style={styles.priceRow}>
                      <Text style={[styles.resultPrice, { color: surface.textPrimary }]}>
                        {formatPrice(row.selling_price_paise)}
                      </Text>
                      {off > 0 && (
                        <>
                          <Text style={[styles.resultMrp, { color: surface.textMuted }]}>
                            {formatPrice(row.mrp_paise)}
                          </Text>
                          <View style={styles.offPill}>
                            <Text style={styles.offText}>{off}% OFF</Text>
                          </View>
                        </>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.stockText,
                        {
                          color:
                            row.available_to_sell > 0
                              ? BRAND_COLORS.electricGreen
                              : STATUS_RED,
                        },
                      ]}
                    >
                      {row.available_to_sell > 0
                        ? `In stock · ${row.unit_label}`
                        : 'Out of stock is store'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const STATUS_RED = '#EF4444';

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
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: RADII.full,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: TYPOGRAPHY.bodyMd.fontSize, paddingVertical: 0 },
  scrollContent: { padding: SPACING.screenPadding, paddingBottom: SPACING.xxl },
  sectionBlock: { marginBottom: SPACING.lg },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: TYPOGRAPHY.titleMd.fontSize, fontWeight: '700', marginBottom: SPACING.sm },
  clearText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADII.full,
    borderWidth: 1,
  },
  chipText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '600' },
  mascotBlock: { alignItems: 'center', paddingVertical: SPACING.xl },
  mascotImage: { width: 120, height: 110 },
  mascotTitle: { fontSize: TYPOGRAPHY.headlineMd.fontSize, fontWeight: '800', marginTop: SPACING.sm },
  mascotSub: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    textAlign: 'center',
    marginTop: SPACING.xs,
    lineHeight: 18,
  },
  intentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADII.full,
    borderWidth: 1,
    marginBottom: SPACING.xs,
  },
  intentChipText: { fontSize: TYPOGRAPHY.captionMin.fontSize, fontWeight: '700' },
  resultCount: { fontSize: TYPOGRAPHY.bodySm.fontSize, marginBottom: SPACING.sm },
  resultCard: {
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.lg,
    borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  resultImage: { width: 72, height: 72, borderRadius: RADII.md, backgroundColor: 'rgba(0,0,0,0.06)' },
  resultBody: { flex: 1, gap: 3 },
  resultName: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '700', lineHeight: 19 },
  resultStore: { fontSize: TYPOGRAPHY.captionMin.fontSize },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 2 },
  resultPrice: { fontSize: TYPOGRAPHY.titleMd.fontSize, fontWeight: '800' },
  resultMrp: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    textDecorationLine: 'line-through',
  },
  offPill: {
    backgroundColor: BRAND_COLORS.goldenYellow,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADII.sm,
  },
  offText: { fontSize: 10, fontWeight: '800', color: BRAND_COLORS.charcoalBlack },
  stockText: { fontSize: TYPOGRAPHY.captionMin.fontSize, fontWeight: '600' },
});
