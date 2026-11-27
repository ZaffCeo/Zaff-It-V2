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

type KhataSummary = {
  bound: boolean;
  today_orders: number;
  today_revenue_paise: number;
  today_commission_paise: number;
  pending_paise: number;
  settled_paise: number;
  lifetime_orders: number;
};

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;
}

/** "Aaj ka Khata" — live merchant day summary backed by merchant_khata_summary(). */
export const MerchantKhataCard: React.FC = () => {
  const [khata, setKhata] = useState<KhataSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.rpc('merchant_khata_summary');
      if (!error && data) setKhata(data as KhataSummary);
    } catch {
      // non-fatal: card hides itself
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!khata || !khata.bound) return null;

  return (
    <Pressable
      onPress={load}
      disabled={refreshing}
      accessibilityRole="button"
      accessibilityLabel="Refresh today's khata"
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Ionicons name="book-outline" size={16} color={BRAND_COLORS.goldenYellow} />
          <Text style={styles.title}>Aaj ka Khata</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{refreshing ? 'SYNC…' : 'LIVE'}</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{khata.today_orders}</Text>
          <Text style={styles.statLabel}>aaj ke orders</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatPaise(khata.today_revenue_paise)}</Text>
          <Text style={styles.statLabel}>aaj ki kamai</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: BRAND_COLORS.goldenYellow }]}>
            {formatPaise(khata.pending_paise)}
          </Text>
          <Text style={styles.statLabel}>payout pending</Text>
        </View>
      </View>

      <View style={styles.footRow}>
        <Text style={styles.footText}>
          Settled: {formatPaise(khata.settled_paise)} · Lifetime orders: {khata.lifetime_orders}
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
