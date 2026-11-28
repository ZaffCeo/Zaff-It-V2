import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  SURFACE_DARK,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { supabase, isSupabaseConfigured } from '@/services/supabase';

type SettlementRow = {
  id: string;
  store_id: string;
  order_count: number;
  gross_paise: number;
  commission_paise: number;
  net_paise: number;
  status: 'pending' | 'settled';
  utr: string | null;
  period_start: string;
  period_end: string;
  settled_at: string | null;
  created_at: string;
};

type SettlementSummary = {
  fee_paise: number;
  pending_unbatched_paise: number;
  pending_batched_paise: number;
  settled_total_paise: number;
  settlements: SettlementRow[];
};

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;
}

/**
 * W-Seller: settlement card — flat seller fee per order, daily 8-10AM IST payout
 * batches, UTR-tracked bank transfers. Backed by my_seller_settlements().
 */
export const MerchantSettlementCard: React.FC = () => {
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.rpc('my_seller_settlements');
      if (!error && data) setSummary(data as unknown as SettlementSummary);
    } catch {
      // non-fatal: card hides itself
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!summary) return null;

  const pendingTotal =
    summary.pending_unbatched_paise + summary.pending_batched_paise;

  return (
    <Pressable
      onPress={load}
      disabled={refreshing}
      accessibilityRole="button"
      accessibilityLabel="Refresh seller settlements"
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Ionicons name="wallet-outline" size={16} color={BRAND_COLORS.goldenYellow} />
          <Text style={styles.title}>Settlements</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{refreshing ? 'SYNC…' : 'LIVE'}</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatPaise(pendingTotal)}</Text>
          <Text style={styles.statLabel}>payout pending</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: BRAND_COLORS.electricGreen }]}>
            {formatPaise(summary.settled_total_paise)}
          </Text>
          <Text style={styles.statLabel}>settled</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: BRAND_COLORS.goldenYellow }]}>
            {formatPaise(summary.fee_paise)}
          </Text>
          <Text style={styles.statLabel}>fee/order</Text>
        </View>
      </View>

      {summary.settlements.slice(0, 3).map((s) => (
        <View key={s.id} style={styles.batchRow}>
          <View style={styles.batchLeft}>
            <View
              style={[
                styles.batchChip,
                {
                  backgroundColor:
                    s.status === 'settled'
                      ? 'rgba(16,185,129,0.16)'
                      : 'rgba(255,199,3,0.16)',
                },
              ]}
            >
              <Text
                style={[
                  styles.batchChipText,
                  { color: s.status === 'settled' ? BRAND_COLORS.electricGreen : BRAND_COLORS.goldenYellow },
                ]}
              >
                {s.status.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.batchMeta}>
              {s.order_count} order{s.order_count === 1 ? '' : 's'} ·{' '}
              {new Date(s.period_start).toLocaleDateString('en-IN')}
            </Text>
          </View>
          <View style={styles.batchRight}>
            <Text style={styles.batchNet}>{formatPaise(s.net_paise)}</Text>
            {s.utr ? <Text style={styles.batchUtr} numberOfLines={1}>UTR {s.utr}</Text> : null}
          </View>
        </View>
      ))}

      <View style={styles.footRow}>
        <Text style={styles.footText}>
          Daily 8-10AM IST batch · UTR-tracked bank transfer
        </Text>
        <Ionicons name="refresh" size={13} color={SURFACE_DARK.textMuted} />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: SURFACE_DARK.surface2,
    borderColor: SURFACE_DARK.border,
    borderWidth: 1,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    color: SURFACE_DARK.textPrimary,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '800',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.full,
    backgroundColor: 'rgba(16,185,129,0.14)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: RADII.full,
    backgroundColor: BRAND_COLORS.electricGreen,
  },
  liveText: {
    color: BRAND_COLORS.electricGreen,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statRow: { flexDirection: 'row', gap: SPACING.sm },
  stat: { flex: 1, gap: 2 },
  statValue: {
    color: SURFACE_DARK.textPrimary,
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '800',
  },
  statLabel: {
    color: SURFACE_DARK.textMuted,
    fontSize: TYPOGRAPHY.captionMin.fontSize,
  },
  batchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: SURFACE_DARK.border,
    gap: SPACING.sm,
  },
  batchLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  batchChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADII.full,
  },
  batchChipText: { fontSize: 9, fontWeight: '800' },
  batchMeta: { color: SURFACE_DARK.textMuted, fontSize: TYPOGRAPHY.captionMin.fontSize, flexShrink: 1 },
  batchRight: { alignItems: 'flex-end', gap: 1 },
  batchNet: { color: SURFACE_DARK.textPrimary, fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '800' },
  batchUtr: { color: SURFACE_DARK.textMuted, fontSize: 10 },
  footRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: SURFACE_DARK.border,
  },
  footText: { color: SURFACE_DARK.textMuted, fontSize: TYPOGRAPHY.captionMin.fontSize },
});
