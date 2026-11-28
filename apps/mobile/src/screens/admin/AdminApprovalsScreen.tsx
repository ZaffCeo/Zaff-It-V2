/**
 * Admin Approvals — unified verification queue (backlog #3, doc §12).
 * One pipeline for seller / rider / service_provider applications:
 * submit (customer) -> review (Zaff office) -> approve grants the earned role
 * (server-side via admin_decide_verification; seller approval also verifies
 * merchant KYC). Reject requires a reason (enforced server-side).
 *
 * Data truth: admin_list_verification_requests / admin_decide_verification.
 * DPDP note: payloads hold masked doc refs only (last-4, booleans, photo refs).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  RADII,
  SPACING,
  STATUS_COLORS,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { useAppStore } from '@/store/useAppStore';
import { isSupabaseConfigured, supabase } from '@/services/supabase';

type VKind = 'seller' | 'rider' | 'service_provider';
type VStatus = 'pending' | 'approved' | 'rejected';

type VerificationRequest = {
  id: string;
  kind: VKind;
  display_name: string;
  phone: string | null;
  payload: Record<string, unknown>;
  note: string | null;
  status: VStatus;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

const KIND_META: Record<VKind, { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  seller: { label: 'Seller / Shop', icon: 'storefront-outline', tint: '#8A6D00' },
  rider: { label: 'Rider', icon: 'bicycle-outline', tint: '#0B6BA8' },
  service_provider: { label: 'Service Pro', icon: 'build-outline', tint: '#7A3E00' },
};

const PAYLOAD_LABELS: Record<string, string> = {
  services: 'Services',
  id_type: 'ID type',
  govt_id_last4: 'ID last-4',
  dl_last4: 'DL last-4',
  vehicle: 'Vehicle',
  city: 'City',
  experience: 'Experience',
  business_name: 'Business',
  fssai: 'FSSAI',
  gstin: 'GSTIN',
};

const STATUS_LABEL: Record<VStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const timeAgo = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

const payloadChips = (payload: Record<string, unknown>) =>
  Object.entries(payload)
    .filter(([k]) => PAYLOAD_LABELS[k])
    .map(([k, v]) => ({
      label: `${PAYLOAD_LABELS[k]}: ${
        Array.isArray(v) ? (v as unknown[]).map(String).join(', ') : String(v)
      }`,
    }));

export const AdminApprovalsScreen: React.FC = () => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const dark = colorScheme === 'dark';
  const surface = dark ? SURFACE_DARK : SURFACE_LIGHT;

  const [statusFilter, setStatusFilter] = useState<VStatus>('pending');
  const [items, setItems] = useState<VerificationRequest[]>([]);
  const [counts, setCounts] = useState<Record<VStatus, number>>({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<VerificationRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectErr, setRejectErr] = useState<string | null>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  }, []);

  const loadCounts = useCallback(async () => {
    const next: Record<VStatus, number> = { pending: 0, approved: 0, rejected: 0 };
    await Promise.all(
      (['pending', 'approved', 'rejected'] as VStatus[]).map(async (st) => {
        if (!isSupabaseConfigured()) return;
        const { data } = await supabase.rpc('admin_list_verification_requests', { p_status: st });
        next[st] = Array.isArray(data) ? data.length : 0;
      }),
    );
    setCounts(next);
  }, []);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setErr('Backend configured nahi hai — approvals live data ke liye Supabase chahiye.');
      setLoading(false);
      return;
    }
    setErr(null);
    try {
      const { data, error } = await supabase.rpc('admin_list_verification_requests', {
        p_status: statusFilter,
      });
      if (error) throw new Error(error.message);
      setItems((Array.isArray(data) ? data : []) as VerificationRequest[]);
      void loadCounts();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Load fail');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, loadCounts]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const decide = useCallback(
    async (req: VerificationRequest, decision: 'approved' | 'rejected', note?: string) => {
      if (busyId) return;
      setBusyId(req.id);
      try {
        const { data, error } = await supabase.rpc('admin_decide_verification', {
          p_request_id: req.id,
          p_decision: decision,
          p_review_note: note ?? null,
        });
        if (error) throw new Error(error.message);
        const res = (data ?? {}) as { ok?: boolean; role_granted?: string | null };
        if (!res.ok) throw new Error('Decision fail');
        flash(
          decision === 'approved'
            ? `${req.display_name} approved ✓ role: ${res.role_granted ?? ''}`
            : `${req.display_name} rejected — note saved`,
        );
        setRejectFor(null);
        setRejectNote('');
        await load();
      } catch (e) {
        const m = e instanceof Error ? e.message : 'Decision fail';
        if (decision === 'rejected') setRejectErr(m);
        else flash(m);
      } finally {
        setBusyId(null);
      }
    },
    [busyId, flash, load],
  );

  const grouped = useMemo(() => {
    const byKind: Record<VKind, VerificationRequest[]> = {
      seller: [], rider: [], service_provider: [],
    };
    for (const r of items) if (byKind[r.kind]) byKind[r.kind].push(r);
    return byKind;
  }, [items]);

  const segBtn = (st: VStatus, label: string) => (
    <Pressable
      key={st}
      onPress={() => setStatusFilter(st)}
      accessibilityRole="button"
      accessibilityLabel={`Filter ${label}`}
      style={[
        styles.segBtn,
        statusFilter === st && styles.segBtnActive,
      ]}
    >
      <Text style={[styles.segText, statusFilter === st && styles.segTextActive]}>
        {label}
      </Text>
      <View style={[styles.segCount, statusFilter === st && { backgroundColor: BRAND_COLORS.charcoalBlack }]}>
        <Text style={[styles.segCountText, statusFilter === st && { color: BRAND_COLORS.goldenYellow }]}>
          {counts[st]}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: surface.background }]} edges={['top']}>
      {/* Header — gold gradient band */}
      <LinearGradient
        colors={['#FFD34D', '#FFC703', '#F5B800']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroRow}>
          <View style={styles.heroIcon}>
            <Ionicons name="shield-checkmark" size={22} color={BRAND_COLORS.charcoalBlack} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Approvals</Text>
            <Text style={styles.heroSub}>
              Seller · Rider · Service Pro — docs verify karo, role grant karo
            </Text>
          </View>
          <Pressable
            onPress={() => void onRefresh()}
            accessibilityRole="button"
            accessibilityLabel="Refresh approvals"
            style={styles.heroRefresh}
          >
            <Ionicons name="refresh" size={18} color={BRAND_COLORS.charcoalBlack} />
          </Pressable>
        </View>
        {counts.pending > 0 && statusFilter !== 'pending' ? (
          <View style={styles.pendingNudge}>
            <Ionicons name="notifications" size={13} color={BRAND_COLORS.charcoalBlack} />
            <Text style={styles.pendingNudgeText}>{counts.pending} pending approvals baaki hain</Text>
          </View>
        ) : null}
      </LinearGradient>

      {/* Segmented status filter */}
      <View style={[styles.segRow, { backgroundColor: dark ? surface.surface2 : '#F1F3F5' }]}>
        {segBtn('pending', 'Pending')}
        {segBtn('approved', 'Approved')}
        {segBtn('rejected', 'Rejected')}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACING.screenPadding, paddingBottom: 48, gap: SPACING.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND_COLORS.goldenYellow} />}
      >
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <View key={i} style={[styles.skeletonCard, { backgroundColor: dark ? surface.surface1 : '#FFFFFF' }]}>
                <View style={styles.skeletonRow}>
                  <View style={[styles.skelAvatar, { backgroundColor: dark ? surface.surface2 : '#F1F3F5' }]} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <View style={[styles.skelLine, { backgroundColor: dark ? surface.surface2 : '#F1F3F5', width: '55%' }]} />
                    <View style={[styles.skelLine, { backgroundColor: dark ? surface.surface2 : '#F1F3F5', width: '38%' }]} />
                  </View>
                </View>
                <View style={[styles.skelLine, { backgroundColor: dark ? surface.surface2 : '#F1F3F5', width: '92%' }]} />
                <View style={[styles.skelLine, { backgroundColor: dark ? surface.surface2 : '#F1F3F5', width: '70%' }]} />
              </View>
            ))}
          </>
        ) : err ? (
          <View style={[styles.emptyCard, { borderColor: surface.border, backgroundColor: surface.surface1 }]}>
            <Ionicons name="cloud-offline-outline" size={30} color={surface.textMuted} />
            <Text style={[styles.emptyTitle, { color: surface.textPrimary }]}>{err}</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: surface.border, backgroundColor: surface.surface1 }]}>
            <Ionicons
              name={statusFilter === 'pending' ? 'checkmark-done-circle-outline' : 'archive-outline'}
              size={36}
              color={BRAND_COLORS.goldenYellow}
            />
            <Text style={[styles.emptyTitle, { color: surface.textPrimary }]}>
              {statusFilter === 'pending'
                ? 'Sab clear hai — koi pending approval nahi 🎉'
                : `${STATUS_LABEL[statusFilter]} queue khali hai`}
            </Text>
            <Text style={[styles.emptyText, { color: surface.textMuted }]}>
              Naye applications Services / Merchant Registration se aate hi yahan dikhenge.
            </Text>
          </View>
        ) : (
          (['seller', 'rider', 'service_provider'] as VKind[]).map((k) => {
            const group = grouped[k];
            if (group.length === 0) return null;
            const meta = KIND_META[k];
            return (
              <View key={k} style={{ gap: SPACING.sm }}>
                <View style={styles.kindHeader}>
                  <Ionicons name={meta.icon} size={14} color={meta.tint} />
                  <Text style={[styles.kindHeaderText, { color: meta.tint }]}>{meta.label}</Text>
                  <View style={[styles.kindCount, { backgroundColor: dark ? surface.surface2 : '#F1F3F5' }]}>
                    <Text style={[styles.kindCountText, { color: surface.textMuted }]}>{group.length}</Text>
                  </View>
                </View>
                {group.map((r) => {
                  const initials = r.display_name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase() ?? '')
                    .join('');
                  return (
                    <View
                      key={r.id}
                      style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]
                      }
                    >
                      <View style={styles.cardTop}>
                        <View style={[styles.avatar, { backgroundColor: dark ? surface.surface2 : '#FFF3C4' }]}>
                          <Text style={[styles.avatarText, { color: '#8A6D00' }]}>{initials || 'Z'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.name, { color: surface.textPrimary }]} numberOfLines={1}>
                            {r.display_name}
                          </Text>
                          <Text style={[styles.sub, { color: surface.textMuted }]}>
                            {r.phone ?? 'phone missing'} · {timeAgo(r.created_at)} pehle
                          </Text>
                        </View>
                        {r.status !== 'pending' && (
                          <View
                            style={[
                              styles.statusPill,
                              {
                                backgroundColor:
                                  r.status === 'approved'
                                    ? dark ? STATUS_COLORS.successBgDark : STATUS_COLORS.successBgLight
                                    : dark ? STATUS_COLORS.errorBgDark : STATUS_COLORS.errorBgLight,
                              },
                            ]}
                          >
                            <Ionicons
                              name={r.status === 'approved' ? 'checkmark-circle' : 'close-circle'}
                              size={12}
                              color={r.status === 'approved'
                                ? dark ? STATUS_COLORS.successBright : STATUS_COLORS.successTextLight
                                : dark ? STATUS_COLORS.errorBright : STATUS_COLORS.errorTextLight}
                            />
                            <Text
                              style={{
                                color: r.status === 'approved'
                                  ? dark ? STATUS_COLORS.successBright : STATUS_COLORS.successTextLight
                                  : dark ? STATUS_COLORS.errorBright : STATUS_COLORS.errorTextLight,
                                fontSize: 10.5,
                                fontWeight: '800',
                              }}
                            >
                              {STATUS_LABEL[r.status]}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Payload chips (masked doc refs) */}
                      {payloadChips(r.payload ?? {}).length > 0 && (
                        <View style={styles.chipWrap}>
                          {payloadChips(r.payload ?? {}).map((c) => (
                            <View
                              key={c.label}
                              style={[styles.chip, { backgroundColor: dark ? surface.surface2 : '#F6F7F9' }]}
                            >
                              <Text style={[styles.chipText, { color: surface.textSecondary }]} numberOfLines={1}>
                                {c.label}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {!!r.note && (
                        <Text style={[styles.applicantNote, { color: surface.textMuted }]} numberOfLines={3}>
                          “{r.note}”
                        </Text>
                      )}

                      {r.status === 'pending' ? (
                        <View style={styles.actionRow}>
                          <Pressable
                            onPress={() => void decide(r, 'approved')}
                            disabled={busyId !== null}
                            accessibilityRole="button"
                            accessibilityLabel={`Approve ${r.display_name}`}
                            style={[styles.approveBtn, busyId === r.id && { opacity: 0.6 }]}
                          >
                            {busyId === r.id ? (
                              <ActivityIndicator size="small" color={BRAND_COLORS.charcoalBlack} />
                            ) : (
                              <>
                                <Ionicons name="checkmark" size={16} color={BRAND_COLORS.charcoalBlack} />
                                <Text style={styles.approveText}>Approve</Text>
                              </>
                            )}
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              setRejectFor(r);
                              setRejectErr(null);
                              setRejectNote('');
                            }}
                            disabled={busyId !== null}
                            accessibilityRole="button"
                            accessibilityLabel={`Reject ${r.display_name}`}
                            style={[styles.rejectBtn, { borderColor: surface.borderStrong }]}
                          >
                            <Ionicons
                              name="close"
                              size={16}
                              color={dark ? STATUS_COLORS.errorBright : STATUS_COLORS.errorTextLight}
                            />
                            <Text style={[styles.rejectText, { color: dark ? STATUS_COLORS.errorBright : STATUS_COLORS.errorTextLight }]}>
                              Reject
                            </Text>
                          </Pressable>
                        </View>
                      ) : (
                        !!r.review_note && (
                          <View style={[styles.reviewNoteBox, { backgroundColor: dark ? surface.surface2 : '#F6F7F9' }]}>
                            <Ionicons name="chatbox-ellipses-outline" size={12} color={surface.textMuted} />
                            <Text style={[styles.reviewNoteText, { color: surface.textMuted }]} numberOfLines={3}>
                              {r.review_note}
                            </Text>
                          </View>
                        )
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Reject reason modal */}
      <Modal visible={rejectFor !== null} transparent animationType="slide" onRequestClose={() => setRejectFor(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: surface.textPrimary }]}>Reject wajah</Text>
              <Pressable onPress={() => setRejectFor(null)} accessibilityRole="button" accessibilityLabel="Close reject form">
                <Ionicons name="close" size={22} color={surface.textMuted} />
              </Pressable>
            </View>
            {!!rejectFor && (
              <Text style={[styles.modalSub, { color: surface.textMuted }]}>
                {rejectFor.display_name} ({KIND_META[rejectFor.kind].label}) — wajah applicant ko dikhegi
              </Text>
            )}
            <TextInput
              value={rejectNote}
              onChangeText={setRejectNote}
              placeholder="e.g. DL photo clear nahi thi — dobara bhejo"
              placeholderTextColor={surface.textMuted}
              multiline
              style={[styles.noteInput, { color: surface.textPrimary, borderColor: surface.border }]}
            />
            {!!rejectErr && <Text style={styles.rejectErr}>{rejectErr}</Text>}
            <Pressable
              onPress={() => rejectFor && void decide(rejectFor, 'rejected', rejectNote.trim())}
              disabled={busyId !== null}
              accessibilityRole="button"
              accessibilityLabel="Confirm rejection"
              style={[styles.rejectConfirm, busyId !== null && { opacity: 0.6 }]}
            >
              {busyId === rejectFor?.id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.rejectConfirmText}>Reject confirm</Text>
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
  hero: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomLeftRadius: RADII.xl,
    borderBottomRightRadius: RADII.xl,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,20,22,0.14)',
  },
  heroTitle: { ...TYPOGRAPHY.headlineMd, color: BRAND_COLORS.charcoalBlack },
  heroSub: { ...TYPOGRAPHY.bodySm, color: BRAND_COLORS.charcoalBlack, opacity: 0.78, marginTop: 2 },
  heroRefresh: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,20,22,0.10)',
  },
  pendingNudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(18,20,22,0.14)',
    borderRadius: RADII.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pendingNudgeText: { color: BRAND_COLORS.charcoalBlack, fontSize: 11.5, fontWeight: '800' },
  segRow: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: SPACING.screenPadding,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: RADII.full,
    padding: 4,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: RADII.full,
  },
  segBtnActive: { backgroundColor: BRAND_COLORS.goldenYellow },
  segText: { fontSize: 12.5, fontWeight: '700', color: '#475569' },
  segTextActive: { color: BRAND_COLORS.charcoalBlack },
  segCount: {
    backgroundColor: 'rgba(18,20,22,0.10)',
    borderRadius: 9,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: 'center',
  },
  segCountText: { fontSize: 10.5, fontWeight: '900', color: '#475569' },
  kindHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, paddingHorizontal: 2 },
  kindHeaderText: { fontSize: 11.5, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  kindCount: { borderRadius: 9, minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, alignItems: 'center' },
  kindCountText: { fontSize: 10.5, fontWeight: '900' },
  card: { borderWidth: 1, borderRadius: RADII.lg, padding: SPACING.md, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '900' },
  name: { ...TYPOGRAPHY.bodyMd, fontWeight: '800' },
  sub: { fontSize: 11.5, marginTop: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADII.full, paddingHorizontal: 8, paddingVertical: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: RADII.sm, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 10.5, fontWeight: '600' },
  applicantNote: { fontSize: 12, fontStyle: 'italic', lineHeight: 17 },
  actionRow: { flexDirection: 'row', gap: SPACING.sm },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderRadius: RADII.full,
    paddingVertical: 11,
  },
  approveText: { color: BRAND_COLORS.charcoalBlack, fontWeight: '900', fontSize: 13 },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.4,
    borderRadius: RADII.full,
    paddingVertical: 11,
  },
  rejectText: { fontWeight: '800', fontSize: 13 },
  reviewNoteBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: RADII.md, paddingHorizontal: 10, paddingVertical: 8 },
  reviewNoteText: { flex: 1, fontSize: 11.5 },
  skeletonCard: { borderRadius: RADII.lg, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)', padding: SPACING.md, gap: 10 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skelAvatar: { width: 42, height: 42, borderRadius: 21 },
  skelLine: { height: 10, borderRadius: 5 },
  emptyCard: { borderWidth: 1, borderRadius: RADII.lg, padding: SPACING.lg, alignItems: 'center', gap: 8 },
  emptyTitle: { ...TYPOGRAPHY.bodyMd, fontWeight: '800', textAlign: 'center' },
  emptyText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,11,12,0.55)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: RADII.xl, borderTopRightRadius: RADII.xl, borderWidth: 1, padding: SPACING.lg, gap: 8 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { ...TYPOGRAPHY.titleMd, fontWeight: '800' },
  modalSub: { fontSize: 12 },
  noteInput: { borderWidth: 1.2, borderRadius: RADII.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 84, textAlignVertical: 'top', marginTop: 4 },
  rejectErr: { color: '#DC2626', fontSize: 12, fontWeight: '700' },
  rejectConfirm: { backgroundColor: '#DC2626', borderRadius: RADII.full, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  rejectConfirmText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13.5 },
  toast: { position: 'absolute', bottom: 34, left: 20, right: 20, backgroundColor: '#121416', borderRadius: RADII.md, paddingVertical: 11, paddingHorizontal: 14, elevation: 6 },
  toastText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
});
