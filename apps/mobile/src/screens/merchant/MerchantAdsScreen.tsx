import React, { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BRAND_COLORS, RADII, SURFACE_DARK, SURFACE_LIGHT, TYPOGRAPHY } from '@zaff-it/shared/tokens';
import { formatPaise, useAppStore } from '@/store/useAppStore';
import { getTranslation } from '@/i18n/translations';
import { isSupabaseConfigured, supabase, SUPABASE_FUNCTIONS_URL } from '@/services/supabase';
import { openRazorpayCheckout } from '@/services/razorpayCheckout';

interface AdCampaign {
  id: string;
  placement_type: string;
  keyword: string | null;
  headline: string;
  status: string;
  days: number;
  budget_paise: number;
  spent_paise: number;
  impressions: number;
  clicks: number;
  starts_at: string | null;
  ends_at: string | null;
  rejection_note: string | null;
  payment_status?: string;
  store_name: string;
}

interface AdsPayload {
  campaigns: AdCampaign[];
  totals: {
    campaigns: number;
    active: number;
    pending: number;
    impressions: number;
    clicks: number;
  };
}

interface AdTransaction {
  id: string;
  campaign_id: string;
  headline?: string;
  status: string;
  amount_paise: number;
  rzp_order_id: string | null;
  paid_at: string | null;
  created_at: string;
}

interface PricingRow {
  pricing_key: string;
  price_paise: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: '#1ED760',
  approved: '#1ED760',
  scheduled: '#4EA8FF',
  pending_review: '#FFC703',
  draft: '#8A94A6',
  paused: '#8A94A6',
  completed: '#8A94A6',
  rejected: '#FF5A5F',
  cancelled: '#8A94A6',
  out_of_budget: '#FF5A5F',
};

const FORMATS = [
  { key: 'search_keyword', label: 'Search Ad', hint: 'Keyword search me Sponsored product', icon: 'search' as const },
  { key: 'sponsored_store', label: 'Sponsored Store', hint: 'Home discovery me aapki dukan', icon: 'storefront' as const },
  { key: 'home_banner', label: 'Home Banner', hint: 'Homepage banner slot (1/2/3)', icon: 'image' as const },
  { key: 'category_banner', label: 'Category Banner', hint: 'Category page banner', icon: 'grid' as const },
];

/**
 * Zaff Ads Phase 1 — merchant Ads Manager (Stitch my_ad_bookings_campaigns base).
 * 4 formats, live pricing, prepaid Razorpay payment (server-priced), honest analytics.
 * Spend stays Rs0 until founder sets CPC/CPM; budget = prepaid amount by construction.
 */
export const MerchantAdsScreen: React.FC = () => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const t = getTranslation(useAppStore((s) => s.language));
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [payload, setPayload] = useState<AdsPayload | null>(null);
  const [pricing, setPricing] = useState<PricingRow[]>([]);
  const [transactions, setTransactions] = useState<AdTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [bookOpen, setBookOpen] = useState(false);
  const [format, setFormat] = useState('search_keyword');
  const [keyword, setKeyword] = useState('');
  const [headline, setHeadline] = useState('');
  const [days, setDays] = useState('7');
  const [slot, setSlot] = useState('1');
  const [submitNow, setSubmitNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bookMsg, setBookMsg] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const rateFor = useCallback(
    (placement: string, bannerSlot: number | null): PricingRow | undefined => {
      const key =
        placement === 'home_banner'
          ? `banner_slot_${bannerSlot ?? 1}_day`
          : placement === 'search_keyword'
            ? 'search_ad_day'
            : `${placement}_day`;
      return pricing.find((p) => p.pricing_key === key);
    },
    [pricing],
  );

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setErrorMsg('Demo mode — live data load nahi hoga');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [adsRes, pricingRes, txRes] = await Promise.all([
        supabase.rpc('my_ad_campaigns'),
        supabase.rpc('get_ad_pricing'),
        supabase.rpc('my_ad_transactions'),
      ]);
      if (adsRes.error || !adsRes.data) {
        setErrorMsg(adsRes.error?.message ?? t.errorGeneric);
      } else {
        setPayload(adsRes.data as unknown as AdsPayload);
        setErrorMsg(null);
      }
      if (!pricingRes.error && pricingRes.data) {
        setPricing((pricingRes.data as unknown as { pricing_key: string; price_paise: number }[]) ?? []);
      }
      if (!txRes.error && txRes.data) {
        setTransactions((txRes.data as unknown as AdTransaction[]) ?? []);
      }
    } catch {
      setErrorMsg(t.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [t.errorGeneric]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleBook = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setBookMsg(null);
    try {
      const hl = headline.trim();
      const d = Math.trunc(Number(days));
      if (hl.length < 3) {
        setBookMsg('Headline 3-80 characters ka hona chahiye');
        return;
      }
      const { data: stores } = await supabase.from('stores').select('id').limit(1);
      const storeId = stores?.[0]?.id;
      if (!storeId) {
        setBookMsg('Koi store nahi mila — pehle apni dukan setup karo');
        return;
      }
      const args: Record<string, unknown> = {
        p_store_id: storeId,
        p_placement_type: format,
        p_headline: hl,
        p_days: d,
        p_submit: submitNow,
      };
      if (format === 'search_keyword') {
        const kw = keyword.trim().toLowerCase();
        if (kw.length < 2) {
          setBookMsg('Search keyword (2+ chars) zaroori hai');
          return;
        }
        args.p_keyword = kw;
      }
      if (format === 'home_banner') {
        args.p_banner_slot = Math.trunc(Number(slot)) || 1;
      }
      const { error } = await supabase.rpc('create_ad_booking', args);
      if (error) {
        setBookMsg(error.message);
      } else {
        setBookMsg(null);
        setKeyword('');
        setHeadline('');
        setBookOpen(false);
        void load();
      }
    } catch {
      setBookMsg(t.errorGeneric);
    } finally {
      setBusy(false);
    }
  }, [busy, format, keyword, headline, days, slot, submitNow, load, t.errorGeneric]);

  const handleSubmitDraft = useCallback(
    async (campaignId: string) => {
      const { error } = await supabase.rpc('submit_ad_campaign', { p_campaign_id: campaignId });
      if (error) {
        setErrorMsg(error.message);
      } else {
        void load();
      }
    },
    [load],
  );

  const handlePay = useCallback(
    async (campaign: AdCampaign) => {
      if (payingId !== null) return;
      setPayingId(campaign.id);
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) {
          setErrorMsg('Login required');
          return;
        }
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/checkout-create-ad-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ campaign_id: campaign.id }),
        });
        const json = (await res.json()) as {
          razorpay_order_id?: string;
          amount_paise?: number;
          error?: { message?: string };
        };
        if (!res.ok || !json.razorpay_order_id) {
          setErrorMsg(json.error?.message ?? 'Payment order nahi ban paya');
          return;
        }
        const result = await openRazorpayCheckout({
          razorpayOrderId: json.razorpay_order_id,
          amountPaise: json.amount_paise ?? campaign.budget_paise,
          orderNumber: 'Zaff Ads',
        });
        if (result.outcome === 'success') {
          setErrorMsg(null);
        } else if (result.outcome === 'failed') {
          setErrorMsg(result.description ?? 'Payment fail hua');
        }
        // Popup success is NOT proof — webhook verification activates the campaign.
      } catch {
        setErrorMsg('Payment flow nahi chala');
      } finally {
        setPayingId(null);
        void load();
      }
    },
    [payingId, load],
  );

  const totals = payload?.totals;
  const rate = rateFor(format, Math.trunc(Number(slot)) || 1);
  const previewAmount = rate ? rate.price_paise * (Math.trunc(Number(days)) || 0) : null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: surface.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>
            Zaff Ads
            <Text style={{ color: BRAND_COLORS.goldenYellow }}> · Makrana</Text>
          </Text>
          <Text style={[styles.headerSub, { color: surface.textMuted }]}>Ads Manager</Text>
        </View>
        <Pressable
          onPress={() => setBookOpen(true)}
          style={styles.bookBtn}
          accessibilityRole="button"
          accessibilityLabel="Create a new ad campaign"
        >
          <Ionicons name="add" size={18} color={BRAND_COLORS.charcoalBlack} />
          <Text style={styles.bookBtnText}>New</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {errorMsg !== null ? (
          <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <Text style={[styles.bodyText, { color: surface.textSecondary }]}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Overview */}
        <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
          <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>All-time Ad Performance</Text>
          <View style={styles.perfGrid}>
            <View style={styles.perfCell}>
              <Text style={[styles.perfValue, { color: surface.textPrimary }]}>{totals?.campaigns ?? 0}</Text>
              <Text style={[styles.perfLabel, { color: surface.textMuted }]}>Campaigns</Text>
            </View>
            <View style={styles.perfCell}>
              <Text style={[styles.perfValue, { color: BRAND_COLORS.electricGreen }]}>{totals?.active ?? 0}</Text>
              <Text style={[styles.perfLabel, { color: surface.textMuted }]}>Active</Text>
            </View>
            <View style={styles.perfCell}>
              <Text style={[styles.perfValue, { color: surface.textPrimary }]}>{totals?.impressions ?? 0}</Text>
              <Text style={[styles.perfLabel, { color: surface.textMuted }]}>Impressions</Text>
            </View>
            <View style={styles.perfCell}>
              <Text style={[styles.perfValue, { color: surface.textPrimary }]}>{totals?.clicks ?? 0}</Text>
              <Text style={[styles.perfLabel, { color: surface.textMuted }]}>Clicks</Text>
            </View>
          </View>
          <Text style={[styles.bodyText, { color: surface.textMuted }]}>
            Spend Rs0 — CPC/CPM pricing launch se pehle founder set karega; budget sirf prepaid cap hai.
          </Text>
        </View>

        {/* Pricing (live, admin-controlled) */}
        {pricing.length > 0 ? (
          <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>Aaj ke Rates (admin-controlled)</Text>
            <View style={styles.pricingGrid}>
              {pricing.map((p) => (
                <View key={p.pricing_key} style={styles.pricingRow}>
                  <Text style={[styles.pricingKey, { color: surface.textSecondary }]}>{p.pricing_key.replace(/_/g, ' ')}</Text>
                  <Text style={[styles.pricingVal, { color: BRAND_COLORS.goldenYellow }]}>{formatPaise(p.price_paise)}/day</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Campaign list */}
        {(payload?.campaigns ?? []).map((c) => {
          const payable = c.payment_status === 'pending' && ['draft', 'pending_review', 'approved', 'scheduled'].includes(c.status);
          return (
            <View key={c.id} style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.statusChip, { backgroundColor: (STATUS_COLORS[c.status] ?? '#8A94A6') + '22' }]}>
                  <Text style={[styles.statusChipText, { color: STATUS_COLORS[c.status] ?? '#8A94A6' }]}>
                    {c.status.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
                {c.payment_status && c.payment_status !== 'not_required' ? (
                  <View style={[styles.statusChip, { backgroundColor: 'rgba(78,168,255,0.15)' }]}>
                    <Text style={[styles.statusChipText, { color: '#4EA8FF' }]}>{c.payment_status.toUpperCase()}</Text>
                  </View>
                ) : null}
                <Text style={[styles.bodyText, { color: surface.textMuted, flex: 1 }]} numberOfLines={1}>
                  {c.placement_type.replace(/_/g, ' ')}
                </Text>
                <Text style={[styles.bodyText, { color: surface.textPrimary, fontWeight: '900' }]}>
                  {formatPaise(c.budget_paise)}
                </Text>
              </View>
              <Text style={[styles.campaignHeadline, { color: surface.textPrimary }]} numberOfLines={2}>
                {c.headline}
              </Text>
              <Text style={[styles.bodyText, { color: surface.textMuted }]}>
                {c.store_name} · {c.days} days
                {c.keyword ? ` · "${c.keyword}"` : ''}
                {c.starts_at && c.ends_at
                  ? ` · ${new Date(c.starts_at).toLocaleDateString('en-IN')} - ${new Date(c.ends_at).toLocaleDateString('en-IN')}`
                  : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                <Text style={[styles.bodyText, { color: surface.textSecondary }]}>👁 {c.impressions}</Text>
                <Text style={[styles.bodyText, { color: surface.textSecondary }]}>👆 {c.clicks}</Text>
                <Text style={[styles.bodyText, { color: surface.textSecondary }]}>
                  CTR {c.impressions > 0 ? `${Math.round((c.clicks / c.impressions) * 1000) / 10}%` : '—'}
                </Text>
              </View>
              {c.status === 'pending_review' ? (
                <Text style={[styles.bodyText, { color: BRAND_COLORS.goldenYellow, marginTop: 6 }]}>
                  ⏱ Admin review pending — SLA under 90 min. Approved hone ke baad search me "Sponsored" tag ke saath dikhega.
                </Text>
              ) : null}
              {c.status === 'approved' && c.payment_status === 'pending' ? (
                <Text style={[styles.bodyText, { color: '#4EA8FF', marginTop: 6 }]}>
                  ✅ Approved! Payment verify hone par live ho jayega.
                </Text>
              ) : null}
              {c.status === 'rejected' && c.rejection_note ? (
                <Text style={[styles.bodyText, { color: STATUS_COLORS.rejected, marginTop: 6 }]}>
                  Rejected: {c.rejection_note}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                {c.status === 'draft' ? (
                  <Pressable
                    onPress={() => handleSubmitDraft(c.id)}
                    style={[styles.actionBtn, { backgroundColor: BRAND_COLORS.goldenYellow }]}
                    accessibilityRole="button"
                    accessibilityLabel="Submit campaign for review"
                  >
                    <Text style={[styles.actionBtnText, { color: BRAND_COLORS.charcoalBlack }]}>Submit for review</Text>
                  </Pressable>
                ) : null}
                {payable ? (
                  <Pressable
                    onPress={() => handlePay(c)}
                    disabled={payingId !== null}
                    style={[styles.actionBtn, { backgroundColor: BRAND_COLORS.goldenYellow, opacity: payingId !== null ? 0.6 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Pay for campaign ${c.headline}`}
                  >
                    <Text style={[styles.actionBtnText, { color: BRAND_COLORS.charcoalBlack }]}>
                      {payingId === c.id ? 'Opening Razorpay…' : `Pay ${formatPaise(c.budget_paise)}`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}

        {/* Payment history */}
        {transactions.length > 0 ? (
          <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>Payment History</Text>
            {transactions.map((tx) => (
              <View key={tx.id} style={styles.pricingRow}>
                <Text style={[styles.pricingKey, { color: surface.textSecondary }]} numberOfLines={1}>
                  {tx.headline ?? 'Ad campaign'} · {new Date(tx.created_at).toLocaleDateString('en-IN')}
                </Text>
                <Text style={[styles.pricingVal, { color: tx.status === 'paid' ? BRAND_COLORS.electricGreen : '#8A94A6' }]}>
                  {tx.status === 'paid' ? '✓' : '…'} {formatPaise(tx.amount_paise)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {loading ? (
          <Text style={[styles.bodyText, { color: surface.textMuted, textAlign: 'center' }]}>…</Text>
        ) : null}
        {!loading && (payload?.campaigns.length ?? 0) === 0 && errorMsg === null ? (
          <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <Text style={[styles.bodyText, { color: surface.textSecondary }]}>
              Abhi koi campaign nahi. "New" se pehla sponsored placement lagao —
              aapke products/dukan search aur home pe "Sponsored" tag ke saath dikhenge.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Booking modal */}
      <Modal visible={bookOpen} animationType="slide" transparent onRequestClose={() => setBookOpen(false)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalSheetScroll}>
            <View style={[styles.modalSheet, { backgroundColor: surface.background, borderColor: surface.border }]}>
              <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>Naya Ad Campaign</Text>

              <View style={styles.formatRow}>
                {FORMATS.map((f) => (
                  <Pressable
                    key={f.key}
                    onPress={() => setFormat(f.key)}
                    style={[
                      styles.formatCard,
                      {
                        backgroundColor: format === f.key ? BRAND_COLORS.goldenYellow : surface.surface1,
                        borderColor: format === f.key ? BRAND_COLORS.goldenYellow : surface.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${f.label} format`}
                  >
                    <Ionicons
                      name={f.icon}
                      size={16}
                      color={format === f.key ? BRAND_COLORS.charcoalBlack : surface.textSecondary}
                    />
                    <Text
                      style={[
                        styles.formatLabel,
                        { color: format === f.key ? BRAND_COLORS.charcoalBlack : surface.textPrimary },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.bodyText, { color: surface.textMuted }]}>
                {FORMATS.find((f) => f.key === format)?.hint}
              </Text>

              {format === 'search_keyword' ? (
                <>
                  <Text style={[styles.inputLabel, { color: surface.textSecondary }]}>Search keyword</Text>
                  <TextInput
                    value={keyword}
                    onChangeText={setKeyword}
                    placeholder="amul"
                    placeholderTextColor={surface.textMuted}
                    style={[styles.input, { backgroundColor: surface.surface1, color: surface.textPrimary, borderColor: surface.border }]}
                    autoCapitalize="none"
                  />
                </>
              ) : null}

              {format === 'home_banner' ? (
                <>
                  <Text style={[styles.inputLabel, { color: surface.textSecondary }]}>Banner slot</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[1, 2, 3].map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => setSlot(String(s))}
                        style={[
                          styles.slotBtn,
                          {
                            backgroundColor: slot === String(s) ? BRAND_COLORS.goldenYellow : surface.surface1,
                            borderColor: slot === String(s) ? BRAND_COLORS.goldenYellow : surface.border,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Banner slot ${s}`}
                      >
                        <Text style={[styles.formatLabel, { color: slot === String(s) ? BRAND_COLORS.charcoalBlack : surface.textPrimary }]}>
                          Slot {s}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <Text style={[styles.inputLabel, { color: surface.textSecondary }]}>Headline (3-80 chars)</Text>
              <TextInput
                value={headline}
                onChangeText={setHeadline}
                placeholder="Amul Dairy Hub — Makrana Super Kirana"
                placeholderTextColor={surface.textMuted}
                style={[styles.input, { backgroundColor: surface.surface1, color: surface.textPrimary, borderColor: surface.border }]}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: surface.textSecondary }]}>Days (1-30)</Text>
                  <TextInput
                    value={days}
                    onChangeText={setDays}
                    keyboardType="number-pad"
                    style={[styles.input, { backgroundColor: surface.surface1, color: surface.textPrimary, borderColor: surface.border }]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: surface.textSecondary }]}>Preview</Text>
                  <Text style={[styles.previewAmount, { color: BRAND_COLORS.goldenYellow }]}>
                    {previewAmount !== null ? formatPaise(previewAmount) : '—'}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => setSubmitNow(!submitNow)}
                style={styles.draftToggle}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: submitNow }}
              >
                <Ionicons
                  name={submitNow ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={BRAND_COLORS.goldenYellow}
                />
                <Text style={[styles.bodyText, { color: surface.textSecondary }]}>
                  {submitNow ? 'Seedha admin review me jayega (payment pending)' : 'Draft ke roop me save hoga'}
                </Text>
              </Pressable>

              {bookMsg !== null ? (
                <Text style={[styles.bodyText, { color: BRAND_COLORS.goldenYellow }]}>{bookMsg}</Text>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <Pressable
                  onPress={() => setBookOpen(false)}
                  style={[styles.sheetBtn, { backgroundColor: surface.surface2 }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.sheetBtnText, { color: surface.textPrimary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleBook}
                  disabled={busy}
                  style={[styles.sheetBtn, { backgroundColor: BRAND_COLORS.goldenYellow, opacity: busy ? 0.6 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Create ad campaign"
                >
                  <Text style={[styles.sheetBtnText, { color: BRAND_COLORS.charcoalBlack }]}>
                    {busy ? '…' : 'Create campaign'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: TYPOGRAPHY.headlineMd.fontSize, fontWeight: '900' },
  headerSub: { fontSize: TYPOGRAPHY.bodySm.fontSize, marginTop: 1 },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND_COLORS.goldenYellow,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADII.md,
  },
  bookBtnText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { borderRadius: RADII.lg, borderWidth: 1, padding: 14 },
  sectionTitle: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900' },
  bodyText: { fontSize: TYPOGRAPHY.bodySm.fontSize, marginTop: 2 },
  perfGrid: { flexDirection: 'row', marginTop: 10 },
  perfCell: { flex: 1, alignItems: 'center' },
  perfValue: { fontSize: TYPOGRAPHY.headlineMd.fontSize, fontWeight: '900' },
  perfLabel: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  campaignHeadline: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900', marginTop: 8 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusChipText: { fontSize: 10, fontWeight: '900' },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADII.md,
    alignSelf: 'flex-start',
  },
  actionBtnText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '900' },
  pricingGrid: { marginTop: 8, gap: 6 },
  pricingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pricingKey: { fontSize: TYPOGRAPHY.bodySm.fontSize, flex: 1 },
  pricingVal: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheetScroll: { justifyContent: 'flex-end', flexGrow: 1 },
  modalSheet: {
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  formatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formatCard: {
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formatLabel: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '900' },
  slotBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  inputLabel: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '700', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
  previewAmount: { fontSize: TYPOGRAPHY.headlineMd.fontSize, fontWeight: '900', textAlignVertical: 'center', marginTop: 8 },
  draftToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  sheetBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: RADII.md,
  },
  sheetBtnText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '900' },
});
