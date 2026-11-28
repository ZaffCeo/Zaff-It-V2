/**
 * Zaff Service — provider job inbox (backlog #2, doc §15).
 * Earned-role gated: open_service_requests() throws unless user_roles has an
 * active 'service_provider' row — the UI shows the earn-path notice on error.
 * One quote per provider per request (server upserts re-quotes back to open).
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
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '@/store/useAppStore';
import { isSupabaseConfigured, supabase } from '@/services/supabase';

type OpenRequest = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  quote_count: number;
  created_at: string;
};

export const ServiceJobsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const colorScheme = useAppStore((s) => s.colorScheme);
  const dark = colorScheme === 'dark';
  const surface = dark ? SURFACE_DARK : SURFACE_LIGHT;

  const [jobs, setJobs] = useState<OpenRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // quote modal
  const [qJob, setQJob] = useState<OpenRequest | null>(null);
  const [qPrice, setQPrice] = useState('');
  const [qNote, setQNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [qErr, setQErr] = useState<string | null>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setErr(null);
    try {
      const { data, error } = await supabase.rpc('open_service_requests');
      if (error) throw new Error(error.message);
      setJobs((Array.isArray(data) ? data : []) as OpenRequest[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Load fail';
      setErr(
        msg.includes('Service provider access required')
          ? 'Provider mode abhi aapke account pe ON nahi hai. Service Provider bano — ₹199/month, docs + personal verification ke baad quotes milte hain.'
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const submitQuote = useCallback(async () => {
    if (!qJob || submitting) return;
    const paise = Math.round(parseFloat(qPrice.trim()) * 100);
    if (!Number.isFinite(paise) || paise <= 0) {
      setQErr('Sahi rate likho (₹ me, 0 se bada)');
      return;
    }
    setSubmitting(true);
    setQErr(null);
    try {
      const { data, error } = await supabase.rpc('submit_service_quote', {
        p_request_id: qJob.id,
        p_price_paise: paise,
        p_note: qNote.trim() || null,
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { ok?: boolean };
      if (!res.ok) throw new Error('Quote submit nahi hua');
      setQJob(null);
      setQPrice('');
      setQNote('');
      flash('Quote bhej diya! Customer ko dikhega 💬');
      await load();
    } catch (e) {
      setQErr(e instanceof Error ? e.message : 'Quote fail');
    } finally {
      setSubmitting(false);
    }
  }, [qJob, submitting, qPrice, qNote, flash, load]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: surface.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
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
          <Text style={[styles.title, { color: surface.textPrimary }]}>Provider Jobs</Text>
          <Text style={[styles.subtitle, { color: surface.textMuted }]}>
            Open jobs · quote bhejo, customer chunega
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACING.screenPadding, paddingBottom: 40, gap: SPACING.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator color={BRAND_COLORS.goldenYellow} size="large" />
          </View>
        ) : err ? (
          <View style={[styles.emptyCard, { borderColor: surface.border }]}>
            <Ionicons name="lock-closed-outline" size={30} color={surface.textMuted} />
            <Text style={[styles.emptyTitle, { color: surface.textPrimary }]}>{err}</Text>
          </View>
        ) : jobs.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: surface.border }]}>
            <Ionicons name="briefcase-outline" size={34} color={BRAND_COLORS.goldenYellow} />
            <Text style={[styles.emptyTitle, { color: surface.textPrimary }]}>
              Abhi koi open job nahi
            </Text>
            <Text style={[styles.emptyText, { color: surface.textMuted }]}>
              Naya job post hote hi yahan dikhega — 30 min window me quote bhejo.
            </Text>
          </View>
        ) : (
          jobs.map((j) => (
            <View key={j.id} style={[styles.jobCard, { borderColor: surface.border, backgroundColor: surface.surface1 }]}>
              <Text style={[styles.jobTitle, { color: surface.textPrimary }]}>{j.title}</Text>
              {!!j.description && (
                <Text style={[styles.jobDesc, { color: surface.textMuted }]} numberOfLines={3}>
                  {j.description}
                </Text>
              )}
              <View style={styles.jobMeta}>
                <Ionicons name="pricetag-outline" size={12} color={surface.textMuted} />
                <Text style={[styles.jobMetaText, { color: surface.textMuted }]}>
                  {j.category} · {j.quote_count} quote already
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setQJob(j);
                  setQErr(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Quote on ${j.title}`}
                style={styles.quoteBtn}
              >
                <Ionicons name="send-outline" size={14} color="#121416" />
                <Text style={styles.quoteBtnText}>Quote bhejo</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      {/* Quote modal */}
      <Modal visible={qJob !== null} animationType="slide" transparent onRequestClose={() => setQJob(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: surface.textPrimary }]} numberOfLines={1}>
                {qJob?.title ?? ''}
              </Text>
              <Pressable onPress={() => setQJob(null)} accessibilityRole="button" accessibilityLabel="Close quote form">
                <Ionicons name="close" size={22} color={surface.textMuted} />
              </Pressable>
            </View>
            {!!qJob?.description && (
              <Text style={[styles.qDesc, { color: surface.textMuted }]}>{qJob.description}</Text>
            )}
            <Text style={[styles.fieldLabel, { color: surface.textMuted }]}>Aapka rate (₹)</Text>
            <TextInput
              value={qPrice}
              onChangeText={setQPrice}
              keyboardType="number-pad"
              placeholder="e.g. 250"
              placeholderTextColor={surface.textMuted}
              style={[styles.input, { color: surface.textPrimary, borderColor: surface.border }]}
            />
            <Text style={[styles.fieldLabel, { color: surface.textMuted }]}>Note (optional)</Text>
            <TextInput
              value={qNote}
              onChangeText={setQNote}
              placeholder="e.g. Capacitor + fitting included, aaj shaam"
              placeholderTextColor={surface.textMuted}
              multiline
              style={[styles.input, styles.inputMulti, { color: surface.textPrimary, borderColor: surface.border }]}
            />
            <Text style={[styles.qHint, { color: surface.textMuted }]}>
              Customer ko sabse sasta quote pehle dikhega. Raat (Night Job ON) = 1.5x rate —
              breakup note me likh do.
            </Text>
            {!!qErr && <Text style={styles.qErr}>{qErr}</Text>}
            <Pressable
              onPress={submitQuote}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Submit quote"
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#121416" />
              ) : (
                <Text style={styles.submitBtnText}>Quote bhejo</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

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
  backBtn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,199,3,0.10)', marginRight: 4 },
  header: { paddingHorizontal: SPACING.screenPadding, paddingTop: SPACING.sm, paddingBottom: SPACING.md, borderBottomWidth: 1 },
  title: { ...TYPOGRAPHY.headlineLg, fontWeight: '800' },
  subtitle: { ...TYPOGRAPHY.bodySm, marginTop: 2 },
  jobCard: { borderWidth: 1, borderRadius: RADII.lg, padding: SPACING.md, gap: 8 },
  jobTitle: { ...TYPOGRAPHY.bodyMd, fontWeight: '800' },
  jobDesc: { fontSize: 12.5, lineHeight: 18 },
  jobMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  jobMetaText: { fontSize: 11.5 },
  quoteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: BRAND_COLORS.goldenYellow, borderRadius: RADII.full, paddingVertical: 11 },
  quoteBtnText: { color: '#121416', fontWeight: '900', fontSize: 13 },
  emptyCard: { borderWidth: 1, borderRadius: RADII.lg, padding: SPACING.lg, alignItems: 'center', gap: 8 },
  emptyTitle: { ...TYPOGRAPHY.bodyMd, fontWeight: '800', textAlign: 'center' },
  emptyText: { fontSize: 12.5, textAlign: 'center', lineHeight: 19 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,11,12,0.55)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: RADII.xl, borderTopRightRadius: RADII.xl, borderWidth: 1, padding: SPACING.lg, gap: 6 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { ...TYPOGRAPHY.titleMd, fontWeight: '800', flex: 1, marginRight: 10 },
  qDesc: { fontSize: 12.5, lineHeight: 18, marginBottom: 4 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { borderWidth: 1.2, borderRadius: RADII.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginTop: 6 },
  inputMulti: { minHeight: 68, textAlignVertical: 'top' },
  qHint: { fontSize: 10.5, fontStyle: 'italic', lineHeight: 15, marginTop: 6 },
  qErr: { color: BRAND_COLORS.goldenYellow === '#FFC703' ? '#DC2626' : '#DC2626', fontSize: 12, fontWeight: '700', marginTop: 6 },
  submitBtn: { backgroundColor: BRAND_COLORS.goldenYellow, borderRadius: RADII.full, paddingVertical: 13, marginTop: 10, alignItems: 'center' },
  submitBtnText: { color: '#121416', fontWeight: '900', fontSize: 14 },
  toast: { position: 'absolute', bottom: 34, left: 20, right: 20, backgroundColor: '#121416', borderRadius: RADII.md, paddingVertical: 11, paddingHorizontal: 14, elevation: 6 },
  toastText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
});
