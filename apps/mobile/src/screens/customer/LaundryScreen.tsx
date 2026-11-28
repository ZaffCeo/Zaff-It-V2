/**
 * Laundry — per-piece booking (Stitch: book_karigar_instant_schedule_area_flow +
 * pickup_status_token pattern). Makrana market model (founder pricing, 2026-11-28):
 * Pair ₹40 (wash+press), Single ₹20, Press-only ₹10, Saree/Bedsheet ₹40, Blanket ₹80.
 * No minimum order · free doorstep pickup.
 *
 * Server truth: create_laundry_order prices from laundry_item_rates — the client
 * total is display-only and never trusted by the backend.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BRAND_COLORS,
  BRAND_GRADIENTS,
  RADII,
  SPACING,
  STATUS_COLORS,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '@/store/useAppStore';
import { isSupabaseConfigured, supabase } from '@/services/supabase';

type RateItem = {
  item_key: string;
  label: string;
  label_hi: string;
  category: 'regular' | 'press' | 'special';
  price_paise: number;
  sort_order: number;
};

type LaundryOrder = {
  id: string;
  status: string;
  pickup_slot: string;
  items_json: Array<{ item_key: string; qty: number }>;
  item_count: number;
  price_paise: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const SLOTS: Array<{ key: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'today_evening', label: 'Aaj Shaam', icon: 'sunny-outline' },
  { key: 'tomorrow_morning', label: 'Kal Subah', icon: 'partly-sunny-outline' },
  { key: 'tomorrow_evening', label: 'Kal Shaam', icon: 'moon-outline' },
];

const STATUS_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; dark: string; light: string; chipDark: string; chipLight: string }> = {
  pending_pickup: { label: 'Pickup pending — rider aayega', icon: 'time-outline', dark: STATUS_COLORS.warningBright, light: STATUS_COLORS.warningTextLight, chipDark: STATUS_COLORS.warningBgDark, chipLight: STATUS_COLORS.warningBgLight },
  picked_up: { label: 'Picked up ✓', icon: 'checkmark-circle-outline', dark: STATUS_COLORS.successBright, light: STATUS_COLORS.successTextLight, chipDark: STATUS_COLORS.successBgDark, chipLight: STATUS_COLORS.successBgLight },
  in_wash: { label: 'Dhul raha hai — in wash', icon: 'water-outline', dark: STATUS_COLORS.warningBright, light: STATUS_COLORS.warningTextLight, chipDark: STATUS_COLORS.warningBgDark, chipLight: STATUS_COLORS.warningBgLight },
  out_for_delivery: { label: 'Wapas aa raha hai', icon: 'bicycle-outline', dark: STATUS_COLORS.successBright, light: STATUS_COLORS.successTextLight, chipDark: STATUS_COLORS.successBgDark, chipLight: STATUS_COLORS.successBgLight },
  delivered: { label: 'Delivered ✓', icon: 'checkmark-done-outline', dark: STATUS_COLORS.success, light: STATUS_COLORS.successTextLight, chipDark: STATUS_COLORS.successBgDark, chipLight: STATUS_COLORS.successBgLight },
  cancelled: { label: 'Cancelled', icon: 'close-circle-outline', dark: STATUS_COLORS.errorBright, light: STATUS_COLORS.errorTextLight, chipDark: STATUS_COLORS.errorBgDark, chipLight: STATUS_COLORS.errorBgLight },
};

const CATEGORY_LABELS: Record<RateItem['category'], string> = {
  regular: 'Wash + Press (press saath me free)',
  press: 'Sirf Press (dhula kapda)',
  special: 'Bade items — ghar ka saman',
};

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

export const LaundryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const colorScheme = useAppStore((s) => s.colorScheme);
  const userId = useAppStore((s) => s.userId);
  const zone = useAppStore((s) => s.zone);
  const selectedAddressId = useAppStore((s) => s.selectedAddressId);
  const selectedAddressLabel = useAppStore((s) => s.selectedAddressLabel);
  const dark = colorScheme === 'dark';
  const surface = dark ? SURFACE_DARK : SURFACE_LIGHT;

  const [rates, setRates] = useState<RateItem[]>([]);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [slot, setSlot] = useState('today_evening');
  const [notes, setNotes] = useState('');
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const demo = !isSupabaseConfigured || !userId;

  const fetchData = useCallback(async () => {
    if (demo) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [ratesRes, ordersRes] = await Promise.all([
        supabase
          .from('laundry_item_rates')
          .select('item_key,label,label_hi,category,price_paise,sort_order')
          .eq('is_active', true)
          .order('sort_order'),
        supabase.rpc('my_laundry_orders'),
      ]);
      if (ratesRes.data) setRates(ratesRes.data as RateItem[]);
      if (ordersRes.data) setOrders(ordersRes.data as LaundryOrder[]);
    } finally {
      setLoading(false);
    }
  }, [demo]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const bump = (key: string, delta: number) =>
    setQtys((q) => ({ ...q, [key]: Math.max(0, Math.min(50, (q[key] ?? 0) + delta)) }));

  const displayTotal = useMemo(
    () => rates.reduce((sum, r) => sum + r.price_paise * (qtys[r.item_key] ?? 0), 0),
    [rates, qtys],
  );

  const selectedLines = useMemo(
    () => rates.filter((r) => (qtys[r.item_key] ?? 0) > 0),
    [rates, qtys],
  );

  const submit = async () => {
    if (submitting || demo || selectedLines.length === 0) return;
    setSubmitting(true);
    try {
      const items = selectedLines.map((r) => ({ item_key: r.item_key, qty: qtys[r.item_key] }));
      const { data, error } = await supabase.rpc('create_laundry_order', {
        p_service_zone_id: zone.id,
        p_address_id: selectedAddressId ?? null,
        p_items: items,
        p_pickup_slot: slot,
        p_notes: notes.trim() ? notes.trim() : null,
      });
      if (error) {
        setToast(error.message);
        return;
      }
      const res = data as { price_paise?: number; item_count?: number };
      setToast(
        `Pickup book ho gaya! ${res?.item_count ?? ''} pieces · ${rupees(res?.price_paise ?? 0)} — rider ${SLOTS.find((s) => s.key === slot)?.label ?? ''} aayega`,
      );
      setQtys({});
      setNotes('');
      await fetchData();
    } finally {
      setSubmitting(false);
    }
  };

  const cancelOrder = async (id: string) => {
    const { error } = await supabase.rpc('cancel_laundry_order', { p_order_id: id });
    if (error) {
      setToast(error.message);
      return;
    }
    setToast('Order cancel ho gaya');
    await fetchData();
  };

  const grouped = useMemo(() => {
    const g: Record<RateItem['category'], RateItem[]> = { regular: [], press: [], special: [] };
    rates.forEach((r) => g[r.category]?.push(r));
    return g;
  }, [rates]);

  const renderRateRow = (r: RateItem) => {
    const qty = qtys[r.item_key] ?? 0;
    return (
      <View key={r.item_key} style={[styles.rateRow, { backgroundColor: surface.surface1 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rateLabel, { color: surface.textPrimary }]}>{r.label}</Text>
          <Text style={[styles.rateSub, { color: surface.textMuted }]}>{r.label_hi}</Text>
        </View>
        <Text style={[styles.ratePrice, { color: STATUS_COLORS.successBright }]}>{rupees(r.price_paise)}</Text>
        <View style={styles.stepperRow}>
          <Pressable
            accessibilityLabel={`Kam karo ${r.label}`}
            onPress={() => bump(r.item_key, -1)}
            style={[styles.stepBtn, { backgroundColor: qty === 0 ? surface.surface2 : surface.surface3 }]}
            hitSlop={8}
          >
            <Ionicons name="remove" size={16} color={qty === 0 ? surface.textMuted : surface.textPrimary} />
          </Pressable>
          <Text style={[styles.qtyText, { color: surface.textPrimary }]}>{qty}</Text>
          <Pressable
            accessibilityLabel={`Zyada karo ${r.label}`}
            onPress={() => bump(r.item_key, 1)}
            style={[styles.stepBtn, { backgroundColor: BRAND_COLORS.goldenYellow }]}
            hitSlop={8}
          >
            <Ionicons name="add" size={16} color={BRAND_COLORS.charcoalBlack} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: surface.canvasLowest }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void fetchData()} />}
      >
        {/* Hero — golden brand band */}
        <LinearGradient colors={[...BRAND_GRADIENTS.goldWarm]} style={styles.hero}>
          <View style={styles.heroRow}>
            <Pressable
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={styles.heroBack}
              hitSlop={8}
            >
              <Ionicons name="arrow-back" size={22} color={BRAND_COLORS.charcoalBlack} />
            </Pressable>
            <Ionicons name="shirt-outline" size={34} color={BRAND_COLORS.charcoalBlack} />
            <View style={{ flex: 1, marginLeft: SPACING.sm }}>
              <Text style={styles.heroTitle}>Laundry — Wash + Press</Text>
              <Text style={styles.heroSub}>Pair sirf ₹40 · bazaar ₹50 — aapki bachat ₹10</Text>
            </View>
          </View>
          <View style={styles.heroPillRow}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>🚪 Free pickup + delivery</Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>🧾 Piece-wise billing</Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>💯 No minimum</Text>
            </View>
          </View>
        </LinearGradient>

        {demo && (
          <View style={[styles.demoCard, { backgroundColor: surface.surface1 }]}>
            <Ionicons name="information-circle-outline" size={18} color={surface.textMuted} />
            <Text style={[styles.demoText, { color: surface.textMuted }]}>
              Demo mode — login ke baad real pickup booking hogi.
            </Text>
          </View>
        )}

        {/* Zone + address context */}
        {!demo && (
          <View style={[styles.ctxCard, { backgroundColor: surface.surface1 }]}>
            <Ionicons name="location-outline" size={16} color={STATUS_COLORS.successBright} />
            <Text style={[styles.ctxText, { color: surface.textPrimary }]} numberOfLines={1}>
              {zone.name} · {selectedAddressLabel || 'Address select karo (Profile)'}
            </Text>
          </View>
        )}

        {/* Rate card + steppers */}
        {(['regular', 'press', 'special'] as const).map((cat) =>
          grouped[cat].length > 0 ? (
            <View key={cat}>
              <Text style={[styles.sectionLabel, { color: surface.textMuted }]}>
                {CATEGORY_LABELS[cat]}
              </Text>
              {grouped[cat].map(renderRateRow)}
            </View>
          ) : null,
        )}

        {/* Pickup slots */}
        <Text style={[styles.sectionLabel, { color: surface.textMuted }]}>Pickup kab?</Text>
        <View style={styles.slotRow}>
          {SLOTS.map((s) => {
            const active = slot === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => setSlot(s.key)}
                style={[
                  styles.slotChip,
                  {
                    backgroundColor: active ? BRAND_COLORS.charcoalBlack : surface.surface1,
                    borderColor: active ? BRAND_COLORS.charcoalBlack : surface.border,
                  },
                ]}
              >
                <Ionicons name={s.icon} size={14} color={active ? BRAND_COLORS.goldenYellow : surface.textMuted} />
                <Text style={[styles.slotText, { color: active ? BRAND_COLORS.goldenYellow : surface.textPrimary }]}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Notes */}
        <Text style={[styles.sectionLabel, { color: surface.textMuted }]}>Note (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Jaise: 'geyser wali shirt bhi', gate pe rakh dena…"
          placeholderTextColor={surface.textMuted}
          style={[styles.notesInput, { backgroundColor: surface.surface1, color: surface.textPrimary, borderColor: surface.border }]}
          multiline
        />

        {/* Total + CTA */}
        <View style={[styles.ctaCard, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
          <View>
            <Text style={[styles.totalLabel, { color: surface.textMuted }]}>Total (display)</Text>
            <Text style={[styles.totalValue, { color: surface.textPrimary }]}>{rupees(displayTotal)}</Text>
            <Text style={[styles.totalNote, { color: surface.textMuted }]}>
              Final price server pe rates se banta hai
            </Text>
          </View>
          <Pressable
            onPress={() => void submit()}
            disabled={selectedLines.length === 0 || submitting || demo}
            style={[styles.ctaBtn, { opacity: selectedLines.length === 0 || demo ? 0.5 : 1 }]}
          >
            {submitting ? (
              <ActivityIndicator color={BRAND_COLORS.charcoalBlack} />
            ) : (
              <>
                <Ionicons name="bag-check-outline" size={18} color={BRAND_COLORS.charcoalBlack} />
                <Text style={styles.ctaText}>Pickup Book Karo</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Meri Laundry */}
        <View style={styles.ordersHeader}>
          <Text style={[styles.ordersTitle, { color: surface.textPrimary }]}>Meri Laundry</Text>
          {orders.length > 0 && (
            <Text style={[styles.ordersCount, { color: surface.textMuted }]}>{orders.length} orders</Text>
          )}
        </View>
        {!demo && orders.length === 0 && !loading && (
          <Text style={[styles.emptyText, { color: surface.textSecondary }]}>
            Abhi koi laundry order nahi — upar se pieces chuno aur pehla pickup book karo!
          </Text>
        )}
        {orders.map((o) => {
          const meta = STATUS_META[o.status] ?? STATUS_META.pending_pickup;
          const chipColor = dark ? meta.chipDark : meta.chipLight;
          const fgColor = dark ? meta.dark : meta.light;
          const cancellable = o.status === 'pending_pickup';
          return (
            <View key={o.id} style={[styles.orderCard, { backgroundColor: surface.surface1 }]}>
              <View style={styles.orderTopRow}>
                <View style={[styles.statusChip, { backgroundColor: chipColor }]}>
                  <Ionicons name={meta.icon} size={13} color={fgColor} />
                  <Text style={[styles.statusText, { color: fgColor }]}>{meta.label}</Text>
                </View>
                <Text style={[styles.orderPrice, { color: surface.textPrimary }]}>{rupees(o.price_paise)}</Text>
              </View>
              <Text style={[styles.orderItems, { color: surface.textSecondary }]}>
                {o.items_json.length > 0
                  ? o.items_json
                      .map((it) => {
                        const r = rates.find((x) => x.item_key === it.item_key);
                        return `${r?.label ?? it.item_key} × ${it.qty}`;
                      })
                      .join(' · ')
                  : `${o.item_count} pieces`}
              </Text>
              <View style={styles.orderBottomRow}>
                <Text style={[styles.orderMeta, { color: surface.textMuted }]}>
                  {SLOTS.find((s) => s.key === o.pickup_slot)?.label ?? o.pickup_slot}
                  {o.notes ? ` · ${o.notes}` : ''}
                </Text>
                {cancellable && (
                  <Pressable onPress={() => void cancelOrder(o.id)} hitSlop={8}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}

        {toast && (
          <View style={[styles.toastCard, { backgroundColor: surface.surface1 }]}>
            <Ionicons name="sparkles-outline" size={16} color={STATUS_COLORS.successBright} />
            <Text style={[styles.toastText, { color: surface.textPrimary }]}>{toast}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: SPACING.xl },
  hero: {
    marginHorizontal: SPACING.screenPadding,
    marginTop: SPACING.md,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroBack: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 6, backgroundColor: 'rgba(18,20,22,0.10)' },
  heroTitle: { ...TYPOGRAPHY.headlineMd, color: BRAND_COLORS.charcoalBlack },
  heroSub: { ...TYPOGRAPHY.bodySm, color: BRAND_COLORS.charcoalBlack, opacity: 0.75, marginTop: 2 },
  heroPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  heroPill: {
    backgroundColor: 'rgba(18, 20, 22, 0.85)',
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  heroPillText: { ...TYPOGRAPHY.captionMin, color: BRAND_COLORS.goldenYellow },
  demoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginHorizontal: SPACING.screenPadding,
    marginTop: SPACING.sm,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  demoText: { ...TYPOGRAPHY.bodySm, flex: 1 },
  ctxCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginHorizontal: SPACING.screenPadding,
    marginTop: SPACING.sm,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  ctxText: { ...TYPOGRAPHY.bodySm, flex: 1 },
  sectionLabel: {
    ...TYPOGRAPHY.labelMd,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
    marginHorizontal: SPACING.screenPadding,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.screenPadding,
    marginBottom: SPACING.xs,
    borderRadius: RADII.md,
    padding: SPACING.cardPadding,
    gap: SPACING.sm,
  },
  rateLabel: { ...TYPOGRAPHY.bodyMd, fontWeight: '600' },
  rateSub: { ...TYPOGRAPHY.bodySm, marginTop: 2 },
  ratePrice: { ...TYPOGRAPHY.labelLg },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: RADII.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { ...TYPOGRAPHY.labelLg, minWidth: 22, textAlign: 'center' },
  slotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginHorizontal: SPACING.screenPadding,
  },
  slotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADII.full,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
  },
  slotText: { ...TYPOGRAPHY.labelMd },
  notesInput: {
    marginHorizontal: SPACING.screenPadding,
    borderRadius: RADII.md,
    borderWidth: 1,
    padding: SPACING.md,
    minHeight: 64,
    textAlignVertical: 'top',
    ...TYPOGRAPHY.bodyMd,
  },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.screenPadding,
    marginTop: SPACING.lg,
    borderRadius: RADII.lg,
    borderWidth: 1,
    padding: SPACING.cardPadding,
    gap: SPACING.md,
  },
  totalLabel: { ...TYPOGRAPHY.captionMin },
  totalValue: { ...TYPOGRAPHY.headlineMd, marginTop: 2 },
  totalNote: { ...TYPOGRAPHY.captionMin, marginTop: 2, maxWidth: 170 },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  ctaText: { ...TYPOGRAPHY.labelLg, color: BRAND_COLORS.charcoalBlack },
  ordersHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.screenPadding,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  ordersTitle: { ...TYPOGRAPHY.titleMd },
  ordersCount: { ...TYPOGRAPHY.bodySm },
  emptyText: {
    ...TYPOGRAPHY.bodySm,
    marginHorizontal: SPACING.screenPadding,
    lineHeight: 20,
  },
  orderCard: {
    marginHorizontal: SPACING.screenPadding,
    marginBottom: SPACING.sm,
    borderRadius: RADII.md,
    padding: SPACING.cardPadding,
    gap: SPACING.xs,
  },
  orderTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  statusText: { ...TYPOGRAPHY.captionMin },
  orderPrice: { ...TYPOGRAPHY.labelLg },
  orderItems: { ...TYPOGRAPHY.bodySm, lineHeight: 18 },
  orderBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderMeta: { ...TYPOGRAPHY.bodySm, flex: 1 },
  cancelText: { ...TYPOGRAPHY.labelMd, color: STATUS_COLORS.error, fontWeight: '700' },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginHorizontal: SPACING.screenPadding,
    marginTop: SPACING.md,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  toastText: { ...TYPOGRAPHY.bodySm, flex: 1 },
});

export default LaundryScreen;
