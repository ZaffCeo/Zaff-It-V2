import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/useAppStore';
import { isSupabaseConfigured, supabase } from '@/services/supabase';

type Props = NativeStackScreenProps<CustomerStackParamList, 'RatingTip'>;

/**
 * W3 (Stitch `customer_rating_rider_tip_zaff_it_coin_reward`):
 * Doorstep proof & delivery experience — rate the rider (stars + tags),
 * add a tip (100% to rider, settled with the rider's weekly payout — no fake
 * online-payment claim), thumbs for the store, +20 Z-Coins reward on submit.
 * Backend authority: one RPC `submit_delivery_feedback` validates ownership,
 * delivered status and one-rating-per-order.
 */

const TAGS = [
  { key: 'lightning_fast', label: '⚡ Lightning Fast' },
  { key: 'polite', label: '🤝 Polite & Courteous' },
  { key: 'packaging', label: '📦 Perfect Packaging' },
  { key: 'communication', label: '📞 Great Communication' },
  { key: 'address', label: '📍 Found Address Easily' },
];

const QUICK_LABEL: Record<number, string> = {
  1: 'Bahut kharab',
  2: 'Theek-thaak',
  3: 'Achha',
  4: 'Bahut achha!',
  5: 'Superfast & Polite! 🎉',
};

const TIP_PRESETS = [
  { paise: 1000, label: '₹10', sub: 'Chai ☕' },
  { paise: 2000, label: '₹20', sub: 'Sharbat 🥤', popular: true },
  { paise: 3000, label: '₹30', sub: 'Nashta 🍱' },
  { paise: 5000, label: '₹50', sub: 'Hero Tip 🌟' },
];

interface RatingInfo {
  orderNumber: string;
  deliveredAt: string | null;
  riderName: string | null;
  riderAvgStars: number | null;
  riderDeliveries: number | null;
  storeName: string | null;
  alreadyRated: boolean;
}

export const RatingTipScreen: React.FC<Props> = ({ navigation, route }) => {
  const orderId = route.params?.orderId ?? '';
  const colorScheme = useAppStore((s) => s.colorScheme);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [info, setInfo] = useState<RatingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [tipPaise, setTipPaise] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [thumbsUp, setThumbsUp] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ coins: number; tipPaise: number } | null>(null);

  const fetchInfo = useCallback(async () => {
    if (!isSupabaseConfigured() || !orderId) {
      setError('Order load nahi hui — dobara try karein.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: orderRow, error: ordErr } = await supabase
        .from('orders')
        .select('id, order_number, status, store_id, delivered_at, stores(name)')
        .eq('id', orderId)
        .maybeSingle();
      if (ordErr !== null || orderRow === null) {
        setError('Order nahi mili.');
        setLoading(false);
        return;
      }
      const o = orderRow as unknown as {
        id: string;
        order_number: string;
        status: string;
        store_id: string;
        delivered_at: string | null;
        stores: { name: string } | null;
      };
      const { data: rated } = await supabase
        .from('rider_ratings')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle();
      let riderName: string | null = null;
      let riderAvg: number | null = null;
      let riderCount: number | null = null;
      const { data: task } = await supabase
        .from('delivery_tasks')
        .select('rider_id')
        .eq('order_id', orderId)
        .maybeSingle();
      const riderId = (task as { rider_id: string | null } | null)?.rider_id ?? null;
      if (riderId !== null) {
        const { data: riderRow } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', riderId)
          .maybeSingle();
        riderName = (riderRow as { full_name: string | null } | null)?.full_name ?? null;
        const { data: agg } = await supabase
          .from('rider_ratings')
          .select('stars')
          .eq('rider_id', riderId);
        const rows = (agg ?? []) as Array<{ stars: number }>;
        if (rows.length > 0) {
          riderCount = rows.length;
          riderAvg = rows.reduce((s, r) => s + r.stars, 0) / rows.length;
        }
      }
      setInfo({
        orderNumber: o.order_number,
        deliveredAt: o.delivered_at,
        riderName,
        riderAvgStars: riderAvg,
        riderDeliveries: riderCount,
        storeName: o.stores?.name ?? null,
        alreadyRated: (rated ?? null) !== null,
      });
    } catch {
      setError('Network issue — dobara try karein.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchInfo();
  }, [fetchInfo]);

  const toggleTag = (key: string) => {
    setTags((prev) => (prev.includes(key) ? prev.filter((t) => t !== key) : prev.length >= 5 ? prev : [...prev, key]));
  };

  const pickTip = (paise: number) => {
    setTipPaise(paise);
    setCustomTip('');
  };

  const onCustomTip = (text: string) => {
    setCustomTip(text);
    const rupees = Number(text.replace(/[^0-9]/g, ''));
    setTipPaise(Number.isFinite(rupees) && rupees > 0 ? Math.min(rupees * 100, 200000) : 0);
  };

  const submit = async () => {
    if (submitting || stars === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('submit_delivery_feedback', {
        p_order_id: orderId,
        p_stars: stars,
        p_tags: tags,
        p_comment: comment.trim().length > 0 ? comment.trim().slice(0, 300) : null,
        p_tip_paise: tipPaise,
        p_store_thumbs_up: thumbsUp,
      });
      if (rpcErr !== null) {
        const msg = String(rpcErr.message);
        setError(
          msg.includes('already_rated')
            ? 'Yeh order pehle rate ho chuki hai.'
            : msg.includes('order_not_delivered')
              ? 'Order abhi delivered nahi hui.'
              : 'Submit fail hua — thodi der baad try karein.',
        );
        return;
      }
      const res = (data ?? {}) as { coins_awarded?: number; tip_recorded_paise?: number };
      setDone({ coins: Number(res.coins_awarded ?? 0), tipPaise: Number(res.tip_recorded_paise ?? 0) });
    } catch {
      setError('Network issue — dobara try karein.');
    } finally {
      setSubmitting(false);
    }
  };

  const goHome = () => navigation.navigate('CustomerTabs', { screen: 'HomeTab' } as never);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: surface.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={20} color={surface.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>Delivery Experience</Text>
          {info !== null ? (
            <Text style={[styles.headerSub, { color: surface.textMuted }]}>#{info.orderNumber}</Text>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={BRAND_COLORS.goldenYellow} />
        </View>
      ) : error !== null && info === null ? (
        <View style={styles.centerWrap}>
          <Ionicons name="alert-circle" size={40} color="#FF6B6B" />
          <Text style={[styles.errorText, { color: surface.textSecondary }]}>{error}</Text>
          <Pressable onPress={() => void fetchInfo()} style={[styles.retryBtn, { backgroundColor: BRAND_COLORS.goldenYellow }]}>
            <Text style={styles.submitText}>Dobara try karein</Text>
          </Pressable>
        </View>
      ) : done !== null ? (
        <View style={styles.centerWrap}>
          <View style={styles.doneCoinBadge}>
            <Ionicons name="sparkles" size={22} color={BRAND_COLORS.charcoalBlack} />
            <Text style={styles.doneCoinText}>+{done.coins} Z-Coins Unlocked!</Text>
          </View>
          <Text style={[styles.doneTitle, { color: surface.textPrimary }]}>Shukriya! 🎉</Text>
          <Text style={[styles.doneSub, { color: surface.textSecondary }]}>
            {done.tipPaise > 0
              ? `₹${(done.tipPaise / 100).toFixed(0)} tip rider ke weekly settlement me judega — 100% rider ko, 0% platform fee.`
              : 'Aapka feedback rider ki rating improve karega.'}
          </Text>
          <Pressable onPress={goHome} style={[styles.submitBtn, { backgroundColor: BRAND_COLORS.goldenYellow }]}>
            <Text style={styles.submitText}>Home par jayein</Text>
            <Ionicons name="arrow-forward" size={16} color={BRAND_COLORS.charcoalBlack} />
          </Pressable>
        </View>
      ) : info !== null && info.alreadyRated ? (
        <View style={styles.centerWrap}>
          <Ionicons name="checkmark-circle" size={44} color={BRAND_COLORS.electricGreen} />
          <Text style={[styles.doneTitle, { color: surface.textPrimary }]}>Already rated</Text>
          <Text style={[styles.doneSub, { color: surface.textSecondary }]}>Is order ke liye aap feedback de chuke ho.</Text>
          <Pressable onPress={goHome} style={[styles.submitBtn, { backgroundColor: BRAND_COLORS.goldenYellow }]}>
            <Text style={styles.submitText}>Home par jayein</Text>
          </Pressable>
        </View>
      ) : info !== null ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Delivered banner + rider */}
          <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <View style={styles.deliveredRow}>
              <View style={styles.deliveredIcon}>
                <Ionicons name="checkmark" size={18} color={BRAND_COLORS.electricGreen} />
              </View>
              <View style={styles.flex1}>
                <Text style={[styles.deliveredLabel, { color: BRAND_COLORS.electricGreen }]}>
                  DELIVERED{info.deliveredAt !== null ? ` · ${new Date(info.deliveredAt).toLocaleString()}` : ''}
                </Text>
                <Text style={[styles.deliveredTitle, { color: surface.textPrimary }]}>Order Delivered!</Text>
              </View>
            </View>
            <View style={[styles.riderRow, { backgroundColor: surface.surface2 }]}>
              <View style={styles.riderAvatar}>
                <Text style={styles.riderAvatarText}>
                  {(info.riderName ?? 'R').slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex1}>
                <Text style={[styles.riderName, { color: surface.textPrimary }]}>{info.riderName ?? 'Zaff Rider'}</Text>
                <Text style={[styles.riderMeta, { color: surface.textMuted }]}>
                  {info.riderDeliveries !== null
                    ? `${info.riderDeliveries}+ swift deliveries · Makrana zone`
                    : 'Zaff delivery captain'}
                </Text>
              </View>
              {info.riderAvgStars !== null ? (
                <View style={styles.riderAvgBadge}>
                  <Ionicons name="star" size={12} color={BRAND_COLORS.goldenYellow} />
                  <Text style={styles.riderAvgText}>{info.riderAvgStars.toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* STEP 1 — stars + tags */}
          <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <Text style={[styles.stepLabel, { color: surface.textMuted }]}>STEP 1 OF 2</Text>
            <Text style={[styles.stepTitle, { color: surface.textPrimary }]}>Rate Your Delivery Hero</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setStars(n)} accessibilityLabel={`${n} star`}>
                  <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={36} color={BRAND_COLORS.goldenYellow} />
                </Pressable>
              ))}
            </View>
            {stars > 0 ? (
              <View style={styles.quickLabelWrap}>
                <Text style={styles.quickLabelText}>{QUICK_LABEL[stars]}</Text>
              </View>
            ) : null}
            <Text style={[styles.sectionQ, { color: surface.textSecondary }]}>What made it awesome?</Text>
            <View style={styles.tagWrap}>
              {TAGS.map((tag) => {
                const active = tags.includes(tag.key);
                return (
                  <Pressable
                    key={tag.key}
                    onPress={() => toggleTag(tag.key)}
                    style={[
                      styles.tagChip,
                      { backgroundColor: active ? BRAND_COLORS.charcoalBlack : surface.surface2 },
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.tagText, { color: active ? '#FFFFFF' : surface.textSecondary }]}>
                      {tag.label} {active ? '✓' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Kuch kehna hai? (optional)"
              placeholderTextColor={surface.textMuted}
              style={[styles.commentInput, { backgroundColor: surface.surface2, color: surface.textPrimary, borderColor: surface.border }]}
              multiline
              maxLength={300}
            />
          </View>

          {/* STEP 2 — tip */}
          <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <View style={styles.tipHeadRow}>
              <View style={styles.flex1}>
                <Text style={[styles.stepLabel, { color: surface.textMuted }]}>STEP 2 OF 2</Text>
                <Text style={[styles.stepTitle, { color: surface.textPrimary }]}>Say Thanks with a Tip</Text>
              </View>
              <View style={styles.toRiderBadge}>
                <Text style={styles.toRiderText}>100% to Rider</Text>
              </View>
            </View>
            <Text style={[styles.tipNote, { color: surface.textSecondary }]}>
              Tip seedha rider ke weekly settlement me jata hai — 0% platform fee.
            </Text>
            <View style={styles.tipGrid}>
              {TIP_PRESETS.map((preset) => {
                const active = tipPaise === preset.paise && customTip === '';
                return (
                  <Pressable
                    key={preset.paise}
                    onPress={() => pickTip(preset.paise)}
                    style={[
                      styles.tipCard,
                      {
                        backgroundColor: active ? BRAND_COLORS.goldenYellow : surface.surface2,
                        borderColor: active ? BRAND_COLORS.goldenYellow : surface.border,
                      },
                    ]}
                    accessibilityRole="button"
                  >
                    {preset.popular ? <View style={styles.popularBadge}><Text style={styles.popularText}>POPULAR</Text></View> : null}
                    <Text style={[styles.tipAmount, { color: active ? BRAND_COLORS.charcoalBlack : surface.textPrimary }]}>
                      {preset.label}
                    </Text>
                    <Text style={[styles.tipSub, { color: active ? 'rgba(18,20,22,0.7)' : surface.textMuted }]}>{preset.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={[styles.customTipRow, { backgroundColor: surface.surface2, borderColor: surface.border }]}>
              <Ionicons name="pencil" size={14} color={surface.textMuted} />
              <TextInput
                value={customTip}
                onChangeText={onCustomTip}
                placeholder="Custom amount (₹10–₹2000)"
                placeholderTextColor={surface.textMuted}
                keyboardType="number-pad"
                style={[styles.customTipInput, { color: surface.textPrimary }]}
                maxLength={6}
              />
              <Text style={[styles.customTipUnit, { color: surface.textMuted }]}>Other</Text>
            </View>
            <View style={styles.settleNoteRow}>
              <Ionicons name="bulb-outline" size={13} color={surface.textMuted} />
              <Text style={[styles.settleNote, { color: surface.textMuted }]}>
                Tip rider payout ke saath settle hota hai (COD orders me rider collect karega).
              </Text>
            </View>
          </View>

          {/* Store thumbs */}
          <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <Ionicons name="storefront-outline" size={18} color={surface.textPrimary} />
            <View style={styles.flex1}>
              <Text style={[styles.storeName, { color: surface.textPrimary }]}>{info.storeName ?? 'Store'}</Text>
              <Text style={[styles.storeQ, { color: surface.textMuted }]}>Store ka experience kaisa raha?</Text>
            </View>
            <Pressable
              onPress={() => setThumbsUp(true)}
              style={[styles.thumbBtn, thumbsUp === true && styles.thumbActive]}
              accessibilityLabel="Store liked"
            >
              <Ionicons name="thumbs-up" size={18} color={thumbsUp === true ? BRAND_COLORS.electricGreen : surface.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => setThumbsUp(false)}
              style={[styles.thumbBtn, thumbsUp === false && styles.thumbActive]}
              accessibilityLabel="Store disliked"
            >
              <Ionicons name="thumbs-down" size={18} color={thumbsUp === false ? '#FF6B6B' : surface.textMuted} />
            </Pressable>
          </View>

          {error !== null ? (
            <Text style={styles.submitError}>{error}</Text>
          ) : null}

          {/* Submit */}
          <Pressable
            onPress={() => void submit()}
            disabled={submitting || stars === 0}
            style={({ pressed }) => [
              styles.submitBtn,
              { backgroundColor: BRAND_COLORS.goldenYellow, opacity: pressed || submitting || stars === 0 ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Submit review and tip"
          >
            {submitting ? (
              <ActivityIndicator size="small" color={BRAND_COLORS.charcoalBlack} />
            ) : (
              <>
                <Text style={styles.submitText}>
                  {tipPaise > 0 ? `Submit Review & Send ₹${(tipPaise / 100).toFixed(0)} Tip` : 'Submit Review'}
                </Text>
                <Ionicons name="arrow-forward" size={16} color={BRAND_COLORS.charcoalBlack} />
              </>
            )}
          </Pressable>
          <Pressable onPress={goHome} style={styles.skipBtn} accessibilityLabel="Skip">
            <Text style={[styles.skipText, { color: surface.textMuted }]}>Maybe Later / Skip to Home</Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    gap: SPACING.sm,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: TYPOGRAPHY.titleMd.fontSize, fontWeight: '800' },
  headerSub: { fontSize: TYPOGRAPHY.bodySm.fontSize, marginTop: 1 },
  scroll: { padding: SPACING.screenPadding, paddingBottom: SPACING.xxl, gap: SPACING.md },
  card: { borderRadius: RADII.md, borderWidth: 1, padding: SPACING.cardPadding },
  deliveredRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  deliveredIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: BRAND_COLORS.electricGreenSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveredLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  deliveredTitle: { fontSize: TYPOGRAPHY.headlineMd.fontSize, fontWeight: '900', marginTop: 1 },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderRadius: RADII.sm, padding: SPACING.sm, marginTop: SPACING.sm },
  riderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderAvatarText: { fontSize: TYPOGRAPHY.titleMd.fontSize, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  riderName: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '800' },
  riderMeta: { fontSize: 11, marginTop: 1 },
  riderAvgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: BRAND_COLORS.goldenYellowGlow,
    borderRadius: RADII.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  riderAvgText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  stepLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  stepTitle: { fontSize: TYPOGRAPHY.headlineMd.fontSize, fontWeight: '900', marginTop: 2 },
  starsRow: { flexDirection: 'row', gap: 10, marginTop: SPACING.md, justifyContent: 'center' },
  quickLabelWrap: { alignSelf: 'center', backgroundColor: BRAND_COLORS.goldenYellowGlow, borderRadius: RADII.lg, paddingHorizontal: 12, paddingVertical: 6, marginTop: SPACING.sm },
  quickLabelText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '800', color: BRAND_COLORS.charcoalBlack },
  sectionQ: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '700', marginTop: SPACING.md },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACING.sm },
  tagChip: { borderRadius: RADII.lg, paddingHorizontal: 12, paddingVertical: 7 },
  tagText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '700' },
  commentInput: {
    borderRadius: RADII.sm,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: SPACING.md,
    minHeight: 44,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
  tipHeadRow: { flexDirection: 'row', alignItems: 'flex-start' },
  toRiderBadge: { backgroundColor: BRAND_COLORS.electricGreenSurface, borderRadius: RADII.sm, paddingHorizontal: 9, paddingVertical: 5 },
  toRiderText: { fontSize: 10, fontWeight: '900', color: BRAND_COLORS.electricGreen },
  tipNote: { fontSize: TYPOGRAPHY.bodySm.fontSize, marginTop: 6 },
  tipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: SPACING.md },
  tipCard: {
    width: '47.5%',
    borderRadius: RADII.md,
    borderWidth: 1.5,
    padding: SPACING.sm,
    minHeight: 66,
    justifyContent: 'center',
  },
  popularBadge: { position: 'absolute', top: -8, right: 8, backgroundColor: BRAND_COLORS.charcoalBlack, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  popularText: { fontSize: 8, fontWeight: '900', color: '#FFE9A8', letterSpacing: 0.5 },
  tipAmount: { fontSize: TYPOGRAPHY.headlineMd.fontSize, fontWeight: '900' },
  tipSub: { fontSize: TYPOGRAPHY.bodySm.fontSize, marginTop: 1 },
  customTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: RADII.sm,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: SPACING.md,
  },
  customTipInput: { flex: 1, fontSize: TYPOGRAPHY.bodyMd.fontSize, padding: 0 },
  customTipUnit: { fontSize: TYPOGRAPHY.bodySm.fontSize },
  settleNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm },
  settleNote: { fontSize: 11, flex: 1, lineHeight: 15 },
  storeName: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '800' },
  storeQ: { fontSize: 11, marginTop: 1 },
  thumbBtn: {
    width: 38,
    height: 38,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  thumbActive: { backgroundColor: BRAND_COLORS.goldenYellowGlow, borderColor: BRAND_COLORS.goldenYellow },
  flex1: { flex: 1 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: RADII.md,
    paddingVertical: 15,
  },
  submitText: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  skipBtn: { alignItems: 'center', paddingVertical: 10 },
  skipText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '600' },
  submitError: { fontSize: TYPOGRAPHY.bodySm.fontSize, color: '#FF6B6B', fontWeight: '700', textAlign: 'center' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.sm },
  errorText: { fontSize: TYPOGRAPHY.bodyMd.fontSize, textAlign: 'center' },
  retryBtn: { borderRadius: RADII.sm, paddingHorizontal: SPACING.xl, paddingVertical: 12, marginTop: SPACING.sm },
  doneCoinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderRadius: RADII.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  doneCoinText: { fontSize: TYPOGRAPHY.titleMd.fontSize, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  doneTitle: { fontSize: TYPOGRAPHY.headlineLg.fontSize, fontWeight: '900' },
  doneSub: { fontSize: TYPOGRAPHY.bodyMd.fontSize, textAlign: 'center', lineHeight: 20, paddingHorizontal: SPACING.md },
});
