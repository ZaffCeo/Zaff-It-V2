/**
 * MerchantInsightsCard — "Aaj ka intelligence" widget on the Khata dashboard.
 *
 * Wire: get_merchant_daily_insights(store_id) RPC (migration 010/011, merchant-
 * owned guard). Resolves the caller's store via merchants.owner_user_id.
 * Falls back to demo values when no real session exists (dev preview mode),
 * so the dashboard never shows an empty box.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BRAND_COLORS,
  SURFACE_DARK,
  SURFACE_LIGHT,
} from '@zaff-it/shared/tokens';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import { PressableScale } from '@/components/ui/PremiumKit';
import { useAppStore } from '@/store/useAppStore';

type Insights = {
  today_orders: number;
  today_revenue_paise: number;
  avg_order_paise: number;
  top_products_today: { name: string; qty: number; revenue_paise: number }[];
  low_stock: { name: string; available: number }[];
  unsold_7d: { name: string }[];
  live: boolean;
};

const DEMO_INSIGHTS: Insights = {
  today_orders: 27,
  today_revenue_paise: 834100,
  avg_order_paise: 30890,
  top_products_today: [
    { name: 'Amul Taaza Milk 500ml', qty: 18, revenue_paise: 48600 },
    { name: 'Tomato Hybrid 500g', qty: 14, revenue_paise: 35000 },
    { name: 'India Gate Basmati 5kg', qty: 6, revenue_paise: 275400 },
  ],
  low_stock: [
    { name: 'Onion 1kg', available: 4 },
    { name: 'Amul Butter 100g', available: 7 },
  ],
  unsold_7d: [{ name: 'Maggi Atta Noodles' }],
  live: false,
};

const inr = (paise: number): string =>
  `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const MerchantInsightsCard: React.FC = () => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const dark = colorScheme === 'dark';
  const surface = dark ? SURFACE_DARK : SURFACE_LIGHT;
  const [insights, setInsights] = useState<Insights>(DEMO_INSIGHTS);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return; // demo session -> keep demo values

      const { data: storeRow } = await supabase
        .from('stores')
        .select('id, merchants!inner(owner_user_id)')
        .eq('merchants.owner_user_id', user.id)
        .limit(1)
        .maybeSingle();

      const storeId = (storeRow as { id?: string } | null)?.id;
      if (!storeId) return;

      const { data, error } = await supabase.rpc('get_merchant_daily_insights', {
        p_store_id: storeId,
      });
      if (error || !data) return;
      setInsights({
        ...(data as Omit<Insights, 'live'>),
        live: true,
      });
    } catch {
      // keep demo fallback
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: surface.surface1, borderColor: surface.border },
      ]}
    >
      <View style={styles.headerRow}>
        <Ionicons
          name="stats-chart"
          size={16}
          color={BRAND_COLORS.goldenYellowPressed}
        />
        <Text style={[styles.title, { color: surface.textPrimary }]}>
          Aaj ka Intelligence
        </Text>
        <View
          style={[
            styles.liveDot,
            insights.live
              ? { backgroundColor: BRAND_COLORS.electricGreen }
              : { backgroundColor: surface.textMuted },
          ]}
        />
        <Text style={[styles.liveLabel, { color: surface.textMuted }]}>
          {insights.live ? 'LIVE' : 'DEMO'}
        </Text>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={[styles.metricValue, { color: surface.textPrimary }]}>
            {insights.today_orders}
          </Text>
          <Text style={[styles.metricLabel, { color: surface.textMuted }]}>
            Aaj ke orders
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={[styles.metricValue, { color: BRAND_COLORS.electricGreen }]}>
            {inr(insights.today_revenue_paise)}
          </Text>
          <Text style={[styles.metricLabel, { color: surface.textMuted }]}>
            Aaj ki sale
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={[styles.metricValue, { color: surface.textPrimary }]}>
            {inr(insights.avg_order_paise)}
          </Text>
          <Text style={[styles.metricLabel, { color: surface.textMuted }]}>
            Avg order
          </Text>
        </View>
      </View>

      <PressableScale
        haptic={false}
        onPress={() => setExpanded((v) => !v)}
        style={styles.moreRow}
      >
        <Text style={[styles.moreText, { color: BRAND_COLORS.goldenYellowPressed }]}>
          {expanded ? 'Kam dikhao' : 'Best sellers, low stock, unsold dekho'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={BRAND_COLORS.goldenYellowPressed}
        />
      </PressableScale>

      {expanded && (
        <View style={styles.detailWrap}>
          <Text style={[styles.sectionLabel, { color: surface.textSecondary }]}>
            🏆 Best sellers (aaj)
          </Text>
          {insights.top_products_today.slice(0, 3).map((p, i) => (
            <Text key={`${p.name}-${i}`} style={[styles.line, { color: surface.textPrimary }]}>
              {i + 1}. {p.name} — {p.qty} pcs · {inr(p.revenue_paise)}
            </Text>
          ))}
          {insights.top_products_today.length === 0 && (
            <Text style={[styles.line, { color: surface.textMuted }]}>Aaj abhi koi sale nahi.</Text>
          )}

          <Text style={[styles.sectionLabel, { color: surface.textSecondary }]}>
            ⚠️ Low stock (turant mangwao)
          </Text>
          {insights.low_stock.slice(0, 3).map((p, i) => (
            <Text key={`${p.name}-${i}`} style={[styles.line, { color: surface.textPrimary }]}>
              {p.name} — sirf {p.available} bacche
            </Text>
          ))}
          {insights.low_stock.length === 0 && (
            <Text style={[styles.line, { color: surface.textMuted }]}>Sab stock theek hai.</Text>
          )}

          <Text style={[styles.sectionLabel, { color: surface.textSecondary }]}>
            😴 7 din se nahi bika
          </Text>
          {insights.unsold_7d.slice(0, 3).map((p, i) => (
            <Text key={`${p.name}-${i}`} style={[styles.line, { color: surface.textPrimary }]}>
              {p.name}
            </Text>
          ))}
          {insights.unsold_7d.length === 0 && (
            <Text style={[styles.line, { color: surface.textMuted }]}>Har item chal raha hai!</Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: '800', flex: 1 },
  liveDot: { width: 7, height: 7, borderRadius: 999 },
  liveLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  metricsRow: { flexDirection: 'row', marginTop: 12 },
  metric: { flex: 1, alignItems: 'flex-start', gap: 2 },
  metricValue: { fontSize: 17, fontWeight: '900' },
  metricLabel: { fontSize: 11 },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  moreText: { fontSize: 12, fontWeight: '700' },
  detailWrap: { marginTop: 10, gap: 3 },
  sectionLabel: { fontSize: 11, fontWeight: '800', marginTop: 8, letterSpacing: 0.3 },
  line: { fontSize: 12.5, marginTop: 3 },
});
