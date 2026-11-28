/**
 * Zaff Service — marketplace customer screen (backlog #2, doc §15).
 * Quote engine flow: customer posts job -> 3-4 nearby providers quote (30-min
 * window) -> customer picks cheapest / best note -> booking accepted (escrow =
 * contract accepted, payment capture deferred) -> Satisfy releases, or No-Show
 * (15 min wait) rebooks free + Rs.50 wallet compensation (042, server truth).
 *
 * Server truth: every mutation is an RPC (033/042); client prices are
 * display-only and never trusted by the backend.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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

type ServiceRequest = {
  id: string;
  category: string;
  title: string;
  status: 'open' | 'accepted' | 'closed' | 'cancelled';
  accepted_price_paise: number | null;
  no_show_count?: number;
  satisfied_at?: string | null;
  quotes: Array<{
    id: string;
    provider_id: string;
    price_paise: number;
    note: string | null;
    status: string;
  }>;
  created_at: string;
};

const CATEGORIES: Array<{
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint: string;
}> = [
  { key: 'repair', label: 'Repair', icon: 'hammer-outline', hint: 'Bijli, plumbing, furniture' },
  { key: 'cleaning', label: 'Cleaning', icon: 'sparkles-outline', hint: 'Ghar, safai deep clean' },
  { key: 'appliance', label: 'Appliance', icon: 'tv-outline', hint: 'Fan, AC, fridge, cooler' },
  { key: 'tutoring', label: 'Tuition', icon: 'book-outline', hint: 'Padhai, coaching ghar pe' },
  { key: 'beauty', label: 'Beauty', icon: 'cut-outline', hint: 'Salon, grooming ghar pe' },
  { key: 'other', label: 'Other', icon: 'apps-outline', hint: 'Baaki sab kaam' },
];

const STATUS_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; dark: string; light: string; chipDark: string; chipLight: string }> = {
  open: { label: 'Quotes a rahe hain', icon: 'time-outline', dark: STATUS_COLORS.warningBright, light: STATUS_COLORS.warningTextLight, chipDark: STATUS_COLORS.warningBgDark, chipLight: STATUS_COLORS.warningBgLight },
  accepted: { label: 'Booking confirmed — escrow', icon: 'shield-checkmark-outline', dark: STATUS_COLORS.successBright, light: STATUS_COLORS.successTextLight, chipDark: STATUS_COLORS.successBgDark, chipLight: STATUS_COLORS.successBgLight },
  closed: { label: 'Satisfied ✓ — job complete', icon: 'checkmark-done-outline', dark: STATUS_COLORS.successBright, light: STATUS_COLORS.successTextLight, chipDark: STATUS_COLORS.successBgDark, chipLight: STATUS_COLORS.successBgLight },
  cancelled: { label: 'Cancelled', icon: 'close-circle-outline', dark: STATUS_COLORS.errorBright, light: STATUS_COLORS.errorTextLight, chipDark: STATUS_COLORS.errorBgDark, chipLight: STATUS_COLORS.errorBgLight },
};

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

const QUOTE_WINDOW_MIN = 30; // doc §15: providers get 30 minutes to quote

export const ServicesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const colorScheme = useAppStore((s) => s.colorScheme);
  const userId = useAppStore((s) => s.userId);
  const zone = useAppStore((s) => s.zone);
  const dark = colorScheme === 'dark';
  const surface = dark ? SURFACE_DARK : SURFACE_LIGHT;

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isProvider, setIsProvider] = useState(false);

  // Post-job modal
  const [postOpen, setPostOpen] = useState(false);
  const [postCat, setPostCat] = useState('repair');
  const [postTitle, setPostTitle] = useState('');
  const [postDesc, setPostDesc] = useState('');
  const [posting, setPosting] = useState(false);
  const [postErr, setPostErr] = useState<string | null>(null);

  // Accept-in-flight quote id (prevents double taps)
  const [busyQuoteId, setBusyQuoteId] = useState<string | null>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || userId === null) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setErr(null);
    try {
      const { data, error } = await supabase.rpc('my_service_requests');
      if (error) throw new Error(error.message);
      setRequests((Array.isArray(data) ? data : []) as ServiceRequest[]);
      // earned-role check: provider inbox entry
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role, is_active')
        .eq('user_id', userId);
      const rows = (roles ?? []) as Array<{ role: string; is_active: boolean }>;
      setIsProvider(rows.some((r) => r.role === 'service_provider' && r.is_active));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Kuch gadbad ho gayi');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const submitJob = useCallback(async () => {
    if (posting) return;
    const title = postTitle.trim();
    if (title.length < 3) {
      setPostErr('Kaam ki title thoda detail me likho (3+ akshar)');
      return;
    }
    setPosting(true);
    setPostErr(null);
    try {
      // Resolve the real service_zones uuid for the user's city (store zone id
      // is a display key like "zone_makrana_central", not a DB uuid).
      let zoneId: string | null = null;
      try {
        const { data: zr } = await supabase
          .from('service_zones')
          .select('id')
          .ilike('city', zone.city)
          .limit(1);
        if (zr && zr.length > 0) zoneId = (zr[0] as { id: string }).id;
      } catch {
        zoneId = null; // zone optional server-side
      }
      const { data, error } = await supabase.rpc('create_service_request', {
        p_category: postCat,
        p_title: title,
        p_description: postDesc.trim() || null,
        p_service_zone_id: zoneId,
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { ok?: boolean; request_id?: string };
      if (!res.ok) throw new Error('Request post nahi hui — dobara try karo');
      setPostOpen(false);
      setPostTitle('');
      setPostDesc('');
      flash('Job post ho gayi! 30 min me pros se quotes aayenge 💬');
      await load();
    } catch (e) {
      setPostErr(e instanceof Error ? e.message : 'Post fail — dobara try karo');
    } finally {
      setPosting(false);
    }
  }, [posting, postCat, postTitle, postDesc, zone, flash, load]);

  const acceptQuote = useCallback(
    async (_reqId: string, quoteId: string) => {
      if (busyQuoteId) return;
      setBusyQuoteId(quoteId);
      try {
        const { data, error } = await supabase.rpc('accept_service_quote', {
          p_quote_id: quoteId,
        });
        if (error) throw new Error(error.message);
        const res = (data ?? {}) as { ok?: boolean };
        if (!res.ok) throw new Error('Accept nahi hua');
        flash('Booking confirm! Payment escrow me surakshit rahega 🛡️');
        await load();
      } catch (e) {
        flash(e instanceof Error ? e.message : 'Accept fail');
        await load();
      } finally {
        setBusyQuoteId(null);
      }
    },
    [busyQuoteId, flash, load],
  );

  const markSatisfied = useCallback(
    async (reqId: string) => {
      try {
        const { data, error } = await supabase.rpc('mark_service_satisfied', {
          p_request_id: reqId,
        });
        if (error) throw new Error(error.message);
        const res = (data ?? {}) as { ok?: boolean };
        if (!res.ok) throw new Error('Satisfy mark nahi hua');
        flash('Satisfy ✓ — kaam complete, dhanyawad!');
        await load();
      } catch (e) {
        flash(e instanceof Error ? e.message : 'Satisfy fail');
        await load();
      }
    },
    [flash, load],
  );

  const reportNoShow = useCallback(
    async (reqId: string) => {
      try {
        const { data, error } = await supabase.rpc('report_service_no_show', {
          p_request_id: reqId,
        });
        if (error) throw new Error(error.message);
        const res = (data ?? {}) as { ok?: boolean; compensation_coins?: number };
        if (!res.ok) throw new Error('No-show report nahi hua');
        flash(
          res.compensation_coins
            ? `No-Show report ✓ — ₹50 wallet me credi ho gayi, re-booking free!`
            : 'No-Show report ✓ — re-booking free!',
        );
        await load();
      } catch (e) {
        flash(e instanceof Error ? e.message : 'No-show report fail');
        await load();
      }
    },
    [flash, load],
  );

  const minutesSince = (iso: string) =>
    Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

  const chip = (meta: { label: string; icon: keyof typeof Ionicons.glyphMap; dark: string; light: string; chipDark: string; chipLight: string }) => (
    <View
      style={[
        styles.statusChip,
        { backgroundColor: dark ? meta.chipDark : meta.chipLight },
      ]}
    >
      <Ionicons name={meta.icon} size={13} color={dark ? meta.dark : meta.light} />
      <Text style={[styles.statusChipText, { color: dark ? meta.dark : meta.light }]}>
        {meta.label}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: surface.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backBtn}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={22} color={surface.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: surface.textPrimary }]}>
              Zaff Service
            </Text>
            <Text style={[styles.subtitle, { color: surface.textMuted }]}>
              {zone.city} · Verified pros · Escrow safe
            </Text>
          </View>
          <Pressable
            onPress={() => setPostOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Post a new service job"
            style={styles.postBtn}
          >
            <LinearGradient
              colors={BRAND_GRADIENTS.gold as unknown as readonly [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.postBtnGrad}
            >
              <Ionicons name="add" size={18} color="#121416" />
              <Text style={styles.postBtnText}>Kaam Post</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      {/* Trust strip */}
      <View style={[styles.trustStrip, { backgroundColor: dark ? 'rgba(255,199,3,0.08)' : '#FFF7DC' }]}>
        <Ionicons name="shield-checkmark" size={14} color="#8A6D00" />
        <Text style={styles.trustText}>
          Paise escrow me — kaam Satisfy hone ke baad hi release hota hai
        </Text>
      </View>

      {/* Provider inbox entry (earned role only) */}
      {isProvider && (
        <View style={{ paddingHorizontal: SPACING.screenPadding, marginTop: SPACING.sm }}>
          <Pressable
            onPress={() => flash('Provider Inbox — agla wave me aayega (quote karna)')}
            accessibilityRole="button"
            accessibilityLabel="Open provider job inbox"
            style={[styles.providerRow, { borderColor: surface.border }]}
          >
            <Ionicons name="briefcase-outline" size={18} color={BRAND_COLORS.goldenYellow} />
            <Text style={[styles.providerText, { color: surface.textPrimary }]}>
              Provider mode ON — naye jobs dekho
            </Text>
            <Ionicons name="chevron-forward" size={16} color={surface.textMuted} />
          </Pressable>
        </View>
      )}

      {/* List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACING.screenPadding, paddingBottom: 40, gap: SPACING.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator color={BRAND_COLORS.goldenYellow} size="large" />
            <Text style={[styles.muted, { color: surface.textMuted, marginTop: 10 }]}>
              Aapke jobs load ho rahe hain…
            </Text>
          </View>
        ) : err ? (
          <View style={[styles.emptyCard, { borderColor: surface.border }]}>
            <Ionicons name="cloud-offline-outline" size={30} color={surface.textMuted} />
            <Text style={[styles.emptyText, { color: surface.textPrimary }]}>{err}</Text>
            <Pressable onPress={load} style={[styles.retryBtn, { borderColor: surface.border }]}>
              <Text style={{ color: BRAND_COLORS.goldenYellow, fontWeight: '700' }}>Retry</Text>
            </Pressable>
          </View>
        ) : requests.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: surface.border }]}>
            <Ionicons name="construct-outline" size={34} color={BRAND_COLORS.goldenYellow} />
            <Text style={[styles.emptyTitle, { color: surface.textPrimary }]}>
              Koi kaam post nahi kiya abhi
            </Text>
            <Text style={[styles.emptyText, { color: surface.textMuted }]}>
              "Kaam Post" dabao — fan kharab, safai, tuition… kuch bhi. Verified pros aapko
              30 min me quote denge. Cheapest ya best wala chuno.
            </Text>
          </View>
        ) : (
          requests.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.open;
            const openQuotes = r.quotes.filter((q) => q.status === 'open');
            const minPrice = openQuotes.length
              ? Math.min(...openQuotes.map((q) => q.price_paise))
              : null;
            const mins = minutesSince(r.created_at);
            const windowLeft = Math.max(0, QUOTE_WINDOW_MIN - mins);
            return (
              <View key={r.id} style={[styles.jobCard, { borderColor: surface.border, backgroundColor: surface.surface1 }]}>
                <View style={styles.jobTop}>
                  <View style={styles.jobCatWrap}>
                    <Ionicons
                      name={(CATEGORIES.find((c) => c.key === r.category)?.icon ?? 'construct-outline') as keyof typeof Ionicons.glyphMap}
                      size={15}
                      color="#8A6D00"
                    />
                    <Text style={styles.jobCat}>
                      {CATEGORIES.find((c) => c.key === r.category)?.label ?? r.category}
                    </Text>
                  </View>
                  {chip(meta)}
                </View>
                <Text style={[styles.jobTitle, { color: surface.textPrimary }]}>{r.title}</Text>
                {r.status === 'open' && (
                  <Text style={[styles.windowText, { color: surface.textMuted }]}>
                    {windowLeft > 0
                      ? `⏳ Pros ko quote window: ${windowLeft} min bache (total 30 min)`
                      : '⏳ 30 min window khatam — Zaff team auto-assign dekh rahi hai (₹199 fallback, aane wala update)'}
                  </Text>
                )}
                {r.status === 'accepted' && (
                  <Text style={[styles.windowText, { color: dark ? STATUS_COLORS.successBright : STATUS_COLORS.successTextLight }]}>
                    🛡️ Escrow: {r.accepted_price_paise ? rupees(r.accepted_price_paise) : ''} kaam Satisfy hone tak surakshit · 24 ghante me auto-Satisfy
                  </Text>
                )}
                {r.satisfied_at && (
                  <Text style={[styles.windowText, { color: dark ? STATUS_COLORS.successBright : STATUS_COLORS.successTextLight }]}>
                    ✓ Satisfy {new Date(r.satisfied_at).toLocaleDateString('en-IN')}
                  </Text>
                )}
                {(r.no_show_count ?? 0) > 0 && (
                  <Text style={[styles.windowText, { color: STATUS_COLORS.warningBright }]}>
                    ⚠️ No-show x{r.no_show_count} — ₹50 compensation mil gayi thi
                  </Text>
                )}

                {/* Quotes (cheapest first — server orders by price) */}
                {r.status === 'open' && openQuotes.length > 0 && (
                  <View style={{ marginTop: SPACING.xs, gap: SPACING.xs }}>
                    {openQuotes.map((q) => {
                      const isBest = q.price_paise === minPrice;
                      return (
                        <View
                          key={q.id}
                          style={[
                            styles.quoteCard,
                            {
                              borderColor: isBest ? BRAND_COLORS.goldenYellow : surface.border,
                              backgroundColor: isBest
                                ? dark
                                  ? 'rgba(255,199,3,0.08)'
                                  : '#FFF9E3'
                                : 'transparent',
                            },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            {isBest && (
                              <View style={styles.bestBadge}>
                                <Text style={styles.bestBadgeText}>⭐ BEST PRICE</Text>
                              </View>
                            )}
                            <Text style={[styles.quotePrice, { color: surface.textPrimary }]}>
                              {rupees(q.price_paise)}
                            </Text>
                            {!!q.note && (
                              <Text style={[styles.quoteNote, { color: surface.textMuted }]} numberOfLines={2}>
                                {q.note}
                              </Text>
                            )}
                          </View>
                          <Pressable
                            onPress={() => acceptQuote(r.id, q.id)}
                            disabled={busyQuoteId !== null}
                            accessibilityRole="button"
                            accessibilityLabel={`Accept quote ${rupees(q.price_paise)}`}
                            style={[
                              styles.acceptBtn,
                              busyQuoteId === q.id && { opacity: 0.6 },
                            ]}
                          >
                            {busyQuoteId === q.id ? (
                              <ActivityIndicator size="small" color="#121416" />
                            ) : (
                              <Text style={styles.acceptBtnText}>Chuno</Text>
                            )}
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}
                {r.status === 'open' && openQuotes.length === 0 && (
                  <Text style={[styles.windowText, { color: surface.textMuted }]}>
                    Abhi tak koi quote nahi — thoda ruko, pros ko search me time lagta hai.
                  </Text>
                )}

                {/* Satisfy / No-Show actions on accepted jobs */}
                {r.status === 'accepted' && (
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => markSatisfied(r.id)}
                      accessibilityRole="button"
                      accessibilityLabel="Mark job Satisfy"
                      style={styles.satisfyBtn}
                    >
                      <Ionicons name="thumbs-up-outline" size={15} color="#121416" />
                      <Text style={styles.satisfyBtnText}>Satisfy ✓</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => reportNoShow(r.id)}
                      accessibilityRole="button"
                      accessibilityLabel="Report provider no show"
                      style={[styles.noShowBtn, { borderColor: surface.border }]}
                    >
                      <Ionicons name="alert-circle-outline" size={15} color={dark ? STATUS_COLORS.errorBright : STATUS_COLORS.errorTextLight} />
                      <Text style={[styles.noShowBtnText, { color: dark ? STATUS_COLORS.errorBright : STATUS_COLORS.errorTextLight }]}>
                        No-Show
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* Explainer — doc §15 rules */}
        <View style={[styles.explainerCard, { borderColor: surface.border }]}>
          <Text style={[styles.explainerTitle, { color: surface.textPrimary }]}>
            Zaff Service kaise kaam karta hai?
          </Text>
          {[
            { i: 'create-outline', t: 'Kaam post karo — text likho, area aapke zone se aata hai' },
            { i: 'chatbubble-ellipses-outline', t: '3-4 nearby pros 30 min me quote karte hain (price + note)' },
            { i: 'pricetag-outline', t: 'Sabse sasta ya best-rated chuno — baaki ko sorry message' },
            { i: 'shield-checkmark-outline', t: 'Paise escrow me — Satisfy mark karo tabhi release hota hai' },
            { i: 'moon-outline', t: 'Raat ka kaam (Night Job ON pros) — 1.5x rate, breakup pehle dikhta hai' },
            { i: 'person-remove-outline', t: 'No-show? 15 min wait, ₹50 wallet compensation + free re-booking' },
          ].map((row) => (
            <View key={row.t} style={styles.explainerRow}>
              <Ionicons name={row.i as keyof typeof Ionicons.glyphMap} size={15} color={BRAND_COLORS.goldenYellow} />
              <Text style={[styles.explainerText, { color: surface.textMuted }]}>{row.t}</Text>
            </View>
          ))}
          <Text style={[styles.explainerFine, { color: surface.textMuted }]}>
            Note: 30-min me quote na mile to ₹199 auto-assign fallback — scheduled worker ke
            saath enable hoga (aane wala update). Provider verification ke baad hi quotes
            dikhte hain.
          </Text>
        </View>
      </ScrollView>

      {/* Post-job modal */}
      <Modal visible={postOpen} animationType="slide" transparent onRequestClose={() => setPostOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: surface.textPrimary }]}>Naya kaam post karo</Text>
              <Pressable onPress={() => setPostOpen(false)} accessibilityRole="button" accessibilityLabel="Close post job form">
                <Ionicons name="close" size={22} color={surface.textMuted} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: surface.textMuted }]}>Category</Text>
            <View style={styles.catGrid}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => setPostCat(c.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Category ${c.label}`}
                  style={[
                    styles.catChip,
                    {
                      borderColor: postCat === c.key ? BRAND_COLORS.goldenYellow : surface.border,
                      backgroundColor: postCat === c.key
                        ? dark ? 'rgba(255,199,3,0.12)' : '#FFF9E3'
                        : 'transparent',
                    },
                  ]}
                >
                  <Ionicons name={c.icon} size={15} color={postCat === c.key ? '#8A6D00' : surface.textMuted} />
                  <Text
                    style={[
                      styles.catChipText,
                      { color: postCat === c.key ? '#8A6D00' : surface.textPrimary },
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: surface.textMuted }]}>Kaam kya hai?</Text>
            <TextInput
              value={postTitle}
              onChangeText={setPostTitle}
              placeholder="e.g. Fan kharab hai — capacitor change"
              placeholderTextColor={surface.textMuted}
              style={[styles.input, { color: surface.textPrimary, borderColor: surface.border }]}
            />
            <Text style={[styles.fieldLabel, { color: surface.textMuted }]}>Detail (optional)</Text>
            <TextInput
              value={postDesc}
              onChangeText={setPostDesc}
              placeholder="e.g. Godabass, aaj shaam 5 baje ke baad"
              placeholderTextColor={surface.textMuted}
              multiline
              style={[styles.input, styles.inputMulti, { color: surface.textPrimary, borderColor: surface.border }]}
            />
            <View style={[styles.zoneNote, { backgroundColor: dark ? 'rgba(255,255,255,0.04)' : '#F6F7F9' }]}>
              <Ionicons name="location-outline" size={13} color={surface.textMuted} />
              <Text style={[styles.zoneNoteText, { color: surface.textMuted }]}>
                Area: {zone.formattedAddress || zone.city} (aapke zone se)
              </Text>
            </View>

            {!!postErr && (
              <Text style={styles.postErr}>{postErr}</Text>
            )}

            <Pressable
              onPress={submitJob}
              disabled={posting}
              accessibilityRole="button"
              accessibilityLabel="Submit service job"
              style={[styles.submitBtn, posting && { opacity: 0.6 }]}
            >
              {posting ? (
                <ActivityIndicator size="small" color="#121416" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#121416" />
                  <Text style={styles.submitBtnText}>Post karo — quotes lo</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Toast */}
      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: SPACING.screenPadding, paddingTop: SPACING.sm, paddingBottom: SPACING.md, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  backBtn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,199,3,0.10)' },
  title: { ...TYPOGRAPHY.headlineLg, fontWeight: '800' },
  subtitle: { ...TYPOGRAPHY.bodySm, marginTop: 2 },
  postBtn: { borderRadius: RADII.full, overflow: 'hidden' },
  postBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9 },
  postBtnText: { color: '#121416', fontWeight: '800', fontSize: 13 },
  trustStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: SPACING.screenPadding, marginTop: SPACING.sm, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADII.md },
  trustText: { flex: 1, color: '#8A6D00', fontSize: 11.5, fontWeight: '600' },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: RADII.md, paddingHorizontal: 12, paddingVertical: 10 },
  providerText: { flex: 1, fontSize: 12.5, fontWeight: '700' },
  jobCard: { borderWidth: 1, borderRadius: RADII.lg, padding: SPACING.md, gap: 6 },
  jobTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  jobCatWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  jobCat: { fontSize: 11, fontWeight: '800', color: '#8A6D00', textTransform: 'uppercase', letterSpacing: 0.4 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADII.full },
  statusChipText: { fontSize: 10.5, fontWeight: '700' },
  jobTitle: { ...TYPOGRAPHY.bodyMd, fontWeight: '700' },
  windowText: { fontSize: 11.5 },
  quoteCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.4, borderRadius: RADII.md, padding: 10 },
  bestBadge: { marginBottom: 2 },
  bestBadgeText: { fontSize: 9.5, fontWeight: '900', color: '#8A6D00', letterSpacing: 0.5 },
  quotePrice: { ...TYPOGRAPHY.bodyMd, fontWeight: '900' },
  quoteNote: { fontSize: 11.5, marginTop: 1 },
  acceptBtn: { backgroundColor: BRAND_COLORS.goldenYellow, borderRadius: RADII.full, paddingHorizontal: 14, paddingVertical: 9, minWidth: 72, alignItems: 'center' },
  acceptBtnText: { color: '#121416', fontWeight: '900', fontSize: 12.5 },
  actionRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: 4 },
  satisfyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND_COLORS.goldenYellow, borderRadius: RADII.full, paddingHorizontal: 14, paddingVertical: 9 },
  satisfyBtnText: { color: '#121416', fontWeight: '900', fontSize: 12.5 },
  noShowBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.2, borderRadius: RADII.full, paddingHorizontal: 14, paddingVertical: 9 },
  noShowBtnText: { fontWeight: '800', fontSize: 12.5 },
  emptyCard: { borderWidth: 1, borderRadius: RADII.lg, padding: SPACING.lg, alignItems: 'center', gap: 8 },
  emptyTitle: { ...TYPOGRAPHY.bodyMd, fontWeight: '800' },
  emptyText: { fontSize: 12.5, textAlign: 'center', lineHeight: 19 },
  retryBtn: { borderWidth: 1.4, borderRadius: RADII.full, paddingHorizontal: 18, paddingVertical: 8, marginTop: 4 },
  explainerCard: { borderWidth: 1, borderRadius: RADII.lg, padding: SPACING.md, gap: 9 },
  explainerTitle: { ...TYPOGRAPHY.bodyMd, fontWeight: '800' },
  explainerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  explainerText: { flex: 1, fontSize: 12 },
  explainerFine: { fontSize: 10.5, fontStyle: 'italic', lineHeight: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,11,12,0.55)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: RADII.xl, borderTopRightRadius: RADII.xl, borderWidth: 1, padding: SPACING.lg, gap: 6 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { ...TYPOGRAPHY.titleMd, fontWeight: '800' },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.4, borderRadius: RADII.full, paddingHorizontal: 12, paddingVertical: 8 },
  catChipText: { fontSize: 12.5, fontWeight: '700' },
  input: { borderWidth: 1.2, borderRadius: RADII.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginTop: 6 },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  zoneNote: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: RADII.md, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8 },
  zoneNoteText: { flex: 1, fontSize: 11.5 },
  postErr: { color: STATUS_COLORS.errorBright, fontSize: 12, fontWeight: '600', marginTop: 6 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BRAND_COLORS.goldenYellow, borderRadius: RADII.full, paddingVertical: 13, marginTop: 10 },
  submitBtnText: { color: '#121416', fontWeight: '900', fontSize: 14 },
  toast: { position: 'absolute', bottom: 34, left: 20, right: 20, backgroundColor: '#121416', borderRadius: RADII.md, paddingVertical: 11, paddingHorizontal: 14, elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8 },
  toastText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
  muted: { fontSize: 12.5 },
});
