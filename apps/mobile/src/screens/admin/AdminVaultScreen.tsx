/**
 * AdminVaultScreen — REAL COD deposit control tower (Wave-A).
 * Lists rider_cod_deposits; pending deposits can be verified/rejected
 * via the verify_cod_deposit RPC (admin-only, server-side guards).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { useAppStore } from '@/store/useAppStore';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import {
  ScreenHeader,
  SectionCard,
  StatusChip,
  type ChromeMode,
} from '@/components/Chrome';

type DepositRow = {
  id: string;
  rider_id: string;
  amount_paise: number;
  order_ids: string[] | null;
  deposit_date: string;
  status: string;
  note: string | null;
  verified_at: string | null;
  created_at: string;
};

type RiderMeta = { id: string; phone: string | null; full_name: string | null };

export const AdminVaultScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const colorScheme = useAppStore((s) => s.colorScheme);
  const mode: ChromeMode = colorScheme;
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [load, setLoad] = useState<'idle' | 'loading' | 'error'>('idle');
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [riders, setRiders] = useState<Record<string, RiderMeta>>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoad('loading');
    try {
      const { data, error } = await supabase
        .from('rider_cod_deposits')
        .select(
          'id, rider_id, amount_paise, order_ids, deposit_date, status, note, verified_at, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(60);
      if (error !== null) {
        setLoad('error');
        return;
      }
      const rows = ((data ?? []) as unknown) as DepositRow[];
      setDeposits(rows);
      const riderIds = Array.from(
        new Set(rows.map((r) => r.rider_id).filter(Boolean)),
      );
      if (riderIds.length > 0) {
        const { data: riderRows } = await supabase
          .from('profiles')
          .select('id, phone, full_name')
          .in('id', riderIds);
        const map: Record<string, RiderMeta> = {};
        for (const r of (riderRows ?? []) as RiderMeta[]) {
          map[r.id] = r;
        }
        setRiders(map);
      }
      setLoad('idle');
    } catch {
      setLoad('error');
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const act = async (depositId: string, approve: boolean) => {
    setActingId(depositId);
    setActionNote(null);
    try {
      const { error } = await supabase.rpc('verify_cod_deposit', {
        p_deposit_id: depositId,
        p_approve: approve,
        p_note: approve ? 'Verified via Admin Vault app' : 'Rejected via Admin Vault app',
      });
      if (error !== null) {
        setActionNote(`Action failed: ${error.message}`);
      } else {
        setActionNote(approve ? 'Deposit verified ✓' : 'Deposit rejected');
        await loadData();
      }
    } catch (e) {
      setActionNote(`Action failed: ${String(e)}`);
    } finally {
      setActingId(null);
    }
  };

  const pending = deposits.filter((d) => d.status === 'pending');
  const pendingTotal = pending.reduce((s, d) => s + d.amount_paise, 0);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: surface.background }]}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader
        mode={mode}
        title="COD Vault"
        subtitle="Rider cash deposits — verify & reconcile"
        onBack={navigation.goBack}
        right={
          <View style={styles.vaultBadge}>
            <Ionicons name="server" size={16} color={BRAND_COLORS.charcoalBlack} />
          </View>
        }
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: surface.surface1, borderColor: BRAND_COLORS.goldBorder }]}>
            <Text style={[styles.summaryValue, { color: surface.textPrimary }]}>
              ₹{(pendingTotal / 100).toFixed(2)}
            </Text>
            <Text style={[styles.summaryLabel, { color: surface.textMuted }]}>
              {pending.length} pending deposit{pending.length === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <Text style={[styles.summaryValue, { color: surface.textPrimary }]}>
              {deposits.filter((d) => d.status === 'verified').length}
            </Text>
            <Text style={[styles.summaryLabel, { color: surface.textMuted }]}>
              verified total
            </Text>
          </View>
        </View>

        {actionNote !== null ? (
          <View
            style={[
              styles.actionNote,
              { backgroundColor: surface.surface2, borderColor: surface.border },
            ]}
          >
            <Ionicons name="checkmark-circle" size={15} color={BRAND_COLORS.goldenYellow} />
            <Text style={[styles.actionNoteText, { color: surface.textSecondary }]}>
              {actionNote}
            </Text>
          </View>
        ) : null}

        {load === 'error' ? (
          <Pressable
            onPress={() => void loadData()}
            style={[styles.retryBox, { backgroundColor: surface.surface1, borderColor: surface.border }]}
          >
            <Ionicons name="refresh" size={18} color={BRAND_COLORS.goldenYellow} />
            <Text style={[styles.retryText, { color: surface.textPrimary }]}>
              Load failed — tap to retry
            </Text>
          </Pressable>
        ) : null}

        {load === 'loading' ? (
          <Text style={[styles.loadingText, { color: surface.textMuted }]}>
            Loading deposits…
          </Text>
        ) : null}

        {load === 'idle' && deposits.length === 0 ? (
          <SectionCard mode={mode}>
            <View style={styles.emptyWrap}>
              <Ionicons name="file-tray-outline" size={28} color={surface.textMuted} />
              <Text style={[styles.emptyText, { color: surface.textMuted }]}>
                Koi COD deposit record nahi. Riders shift-end par cash deposit karte
                hain — wahan entries yahan dikhengi.
              </Text>
            </View>
          </SectionCard>
        ) : null}

        {deposits.map((d) => {
          const rider = riders[d.rider_id];
          const orderCount = Array.isArray(d.order_ids) ? d.order_ids.length : 0;
          return (
            <SectionCard mode={mode} key={d.id} style={styles.depositCard}>
              <View style={styles.depositTop}>
                <View style={styles.depositAmountWrap}>
                  <Text style={[styles.depositAmount, { color: surface.textPrimary }]}>
                    ₹{(d.amount_paise / 100).toFixed(2)}
                  </Text>
                  <Text style={[styles.depositDate, { color: surface.textMuted }]}>
                    {d.deposit_date} · {orderCount} order{orderCount === 1 ? '' : 's'}
                  </Text>
                </View>
                <StatusChip
                  mode={mode}
                  label={d.status.toUpperCase()}
                  tone={
                    d.status === 'verified'
                      ? 'success'
                      : d.status === 'rejected'
                        ? 'error'
                        : 'warning'
                  }
                />
              </View>
              <Text style={[styles.riderLine, { color: surface.textSecondary }]}>
                <Ionicons name="bicycle" size={12} color={surface.textMuted} />{' '}
                {rider?.full_name ?? rider?.phone ?? d.rider_id.slice(0, 8)}
              </Text>
              {d.note !== null && d.note !== '' ? (
                <Text style={[styles.noteLine, { color: surface.textMuted }]} numberOfLines={2}>
                  “{d.note}”
                </Text>
              ) : null}
              {d.status === 'pending' ? (
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => void act(d.id, true)}
                    disabled={actingId !== null}
                    style={[
                      styles.actionBtn,
                      styles.approveBtn,
                      { opacity: actingId !== null ? 0.5 : 1 },
                    ]}
                  >
                    <Ionicons name="checkmark" size={18} color={BRAND_COLORS.charcoalBlack} />
                    <Text style={styles.approveText}>
                      {actingId === d.id ? 'Verifying…' : 'Verify'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void act(d.id, false)}
                    disabled={actingId !== null}
                    style={[
                      styles.actionBtn,
                      styles.rejectBtn,
                      { borderColor: surface.borderStrong, opacity: actingId !== null ? 0.5 : 1 },
                    ]}
                  >
                    <Ionicons name="close" size={18} color={surface.textPrimary} />
                    <Text style={[styles.rejectText, { color: surface.textPrimary }]}>
                      Reject
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </SectionCard>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    padding: SPACING.screenPadding,
    gap: SPACING.md,
    paddingBottom: SPACING.xxxl,
  },
  vaultBadge: {
    width: 40,
    height: 40,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  summaryCard: {
    flex: 1,
    borderRadius: RADII.lg,
    borderWidth: 1.5,
    padding: SPACING.md,
    gap: 2,
  },
  summaryValue: {
    ...TYPOGRAPHY.headlineMd,
    fontWeight: '900',
  },
  summaryLabel: {
    ...TYPOGRAPHY.captionMin,
  },
  actionNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    padding: SPACING.md,
  },
  actionNoteText: {
    ...TYPOGRAPHY.bodySm,
    flex: 1,
  },
  retryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    padding: SPACING.md,
  },
  retryText: {
    ...TYPOGRAPHY.bodyMd,
    fontWeight: '600',
  },
  loadingText: {
    ...TYPOGRAPHY.bodySm,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
  },
  emptyText: {
    ...TYPOGRAPHY.bodySm,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  depositCard: {
    gap: SPACING.xs,
  },
  depositTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  depositAmountWrap: {
    gap: 2,
  },
  depositAmount: {
    ...TYPOGRAPHY.headlineMd,
    fontWeight: '900',
  },
  depositDate: {
    ...TYPOGRAPHY.captionMin,
  },
  riderLine: {
    ...TYPOGRAPHY.bodySm,
    fontWeight: '600',
  },
  noteLine: {
    ...TYPOGRAPHY.bodySm,
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  actionBtn: {
    flex: 1,
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  approveBtn: {
    backgroundColor: BRAND_COLORS.goldenYellow,
  },
  rejectBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  approveText: {
    ...TYPOGRAPHY.labelMd,
    color: BRAND_COLORS.charcoalBlack,
  },
  rejectText: {
    ...TYPOGRAPHY.labelMd,
  },
});
