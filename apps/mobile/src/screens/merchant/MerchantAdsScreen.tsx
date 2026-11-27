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
import { isSupabaseConfigured, supabase } from '@/services/supabase';

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

const STATUS_COLORS: Record<string, string> = {
  active: '#1ED760',
  pending_review: '#FFC703',
  paused: '#8A94A6',
  completed: '#8A94A6',
  rejected: '#FF5A5F',
  cancelled: '#8A94A6',
};

/**
 * W4c Zaff Ads — merchant bookings console (Stitch my_ad_bookings_campaigns).
 * Honest: spend stays Rs0 until founder sets CPC/CPM (no fake spend numbers);
 * every booking needs admin review (approvals queue) before serving.
 */
export const MerchantAdsScreen: React.FC = () => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const t = getTranslation(useAppStore((s) => s.language));
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [payload, setPayload] = useState<AdsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [headline, setHeadline] = useState('');
  const [days, setDays] = useState('7');
  const [budget, setBudget] = useState('700');
  const [busy, setBusy] = useState(false);
  const [bookMsg, setBookMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setErrorMsg('Demo mode — live data load nahi hoga');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('my_ad_campaigns');
      if (error || !data) {
        setErrorMsg(error?.message ?? t.errorGeneric);
      } else {
        setPayload(data as unknown as AdsPayload);
        setErrorMsg(null);
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
      const kw = keyword.trim().toLowerCase();
      const hl = headline.trim();
      const d = Math.trunc(Number(days));
      const b = Math.round(Number(budget) * 100);
      if (kw.length < 2 || hl.length < 3) {
        setBookMsg('Keyword (2+) aur headline (3+ chars) zaroori hain');
        return;
      }
      const { data: stores } = await supabase
        .from('stores')
        .select('id')
        .limit(1);
      const storeId = stores?.[0]?.id;
      if (!storeId) {
        setBookMsg('Koi store nahi mila — pehle apni dukan setup karo');
        return;
      }
      const { error } = await supabase.rpc('create_ad_booking', {
        p_store_id: storeId,
        p_placement_type: 'search_keyword',
        p_keyword: kw,
        p_headline: hl,
        p_days: d,
        p_budget_paise: b,
        p_product_id: null,
      });
      if (error) {
        setBookMsg(error.message);
      } else {
        setBookMsg('Booking submit ho gayi — admin review ke baad live hogi (SLA < 90 min).');
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
  }, [busy, keyword, headline, days, budget, load, t.errorGeneric]);

  const totals = payload?.totals;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: surface.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>
            Zaff Ads
            <Text style={{ color: BRAND_COLORS.goldenYellow }}> · Makrana</Text>
          </Text>
          <Text style={[styles.headerSub, { color: surface.textMuted }]}>My Campaigns</Text>
        </View>
        <Pressable
          onPress={() => setBookOpen(true)}
          style={styles.bookBtn}
          accessibilityRole="button"
          accessibilityLabel="Book a new ad placement"
        >
          <Ionicons name="add" size={18} color={BRAND_COLORS.charcoalBlack} />
          <Text style={styles.bookBtnText}>Book</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {errorMsg !== null ? (
          <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <Text style={[styles.bodyText, { color: surface.textSecondary }]}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* All-time performance */}
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
            Spend Rs0 — CPC/CPM pricing launch se pehle founder set karega; budget sirf cap hai.
          </Text>
        </View>

        {/* Campaign list */}
        {(payload?.campaigns ?? []).map((c) => (
          <View key={c.id} style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.statusChip, { backgroundColor: (STATUS_COLORS[c.status] ?? '#8A94A6') + '22' }]}>
                <Text style={[styles.statusChipText, { color: STATUS_COLORS[c.status] ?? '#8A94A6' }]}>
                  {c.status.replace('_', ' ').toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.bodyText, { color: surface.textMuted, flex: 1 }]}>
                {c.placement_type === 'search_keyword' ? `Search: "${c.keyword ?? ''}"` : 'Category banner'}
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
              {c.starts_at && c.ends_at
                ? ` · ${new Date(c.starts_at).toLocaleDateString('en-IN')} - ${new Date(c.ends_at).toLocaleDateString('en-IN')}`
                : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
              <Text style={[styles.bodyText, { color: surface.textSecondary }]}>
                👁 {c.impressions}
              </Text>
              <Text style={[styles.bodyText, { color: surface.textSecondary }]}>
                👆 {c.clicks}
              </Text>
              <Text style={[styles.bodyText, { color: surface.textSecondary }]}>
                CTR {c.impressions > 0 ? `${Math.round((c.clicks / c.impressions) * 1000) / 10}%` : '—'}
              </Text>
            </View>
            {c.status === 'pending_review' ? (
              <Text style={[styles.bodyText, { color: BRAND_COLORS.goldenYellow, marginTop: 6 }]}>
                ⏱ Admin review pending — approved hone ke baad search me "Sponsored" tag ke saath dikhega.
              </Text>
            ) : null}
            {c.status === 'rejected' && c.rejection_note ? (
              <Text style={[styles.bodyText, { color: STATUS_COLORS.rejected, marginTop: 6 }]}>
                Rejected: {c.rejection_note}
              </Text>
            ) : null}
          </View>
        ))}

        {loading ? (
          <Text style={[styles.bodyText, { color: surface.textMuted, textAlign: 'center' }]}>…</Text>
        ) : null}
        {!loading && (payload?.campaigns.length ?? 0) === 0 && errorMsg === null ? (
          <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <Text style={[styles.bodyText, { color: surface.textSecondary }]}>
              Abhi koi campaign nahi. "Book" se pehla sponsored placement lagao —
              aapke products search results me top pe dikhenge (Sponsored tag ke saath).
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Booking modal */}
      <Modal visible={bookOpen} animationType="slide" transparent onRequestClose={() => setBookOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: surface.background, borderColor: surface.border }]}>
            <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>Naya Ad Booking</Text>
            <Text style={[styles.bodyText, { color: surface.textMuted }]}>
              Search keyword placement — jab customer aapka keyword search karega, aapka product
              "Sponsored" tag ke saath top pe dikhega (admin review ke baad).
            </Text>

            <Text style={[styles.inputLabel, { color: surface.textSecondary }]}>Search keyword</Text>
            <TextInput
              value={keyword}
              onChangeText={setKeyword}
              placeholder="amul"
              placeholderTextColor={surface.textMuted}
              style={[styles.input, { backgroundColor: surface.surface1, color: surface.textPrimary, borderColor: surface.border }]}
              autoCapitalize="none"
            />

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
                <Text style={[styles.inputLabel, { color: surface.textSecondary }]}>Budget Rs (min Rs100/day)</Text>
                <TextInput
                  value={budget}
                  onChangeText={setBudget}
                  keyboardType="number-pad"
                  style={[styles.input, { backgroundColor: surface.surface1, color: surface.textPrimary, borderColor: surface.border }]}
                />
              </View>
            </View>

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
                accessibilityLabel="Submit ad booking"
              >
                <Text style={[styles.sheetBtnText, { color: BRAND_COLORS.charcoalBlack }]}>
                  {busy ? '…' : 'Submit for review'}
                </Text>
              </Pressable>
            </View>
          </View>
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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  inputLabel: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '700', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
  sheetBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: RADII.md,
  },
  sheetBtnText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '900' },
});
