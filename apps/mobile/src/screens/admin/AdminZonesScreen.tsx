/**
 * AdminZonesScreen — REAL geofence view (Wave-A).
 * Makrana service zones: radius, delivery fee, free threshold, service hours.
 * Read-only (zone writes stay SQL-side, audited).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { useAppStore } from '@/store/useAppStore';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import {
  ScreenHeader,
  SectionCard,
  StatusChip,
  type ChromeMode,
} from '@/components/Chrome';

type ZoneRow = {
  id: string;
  code: string;
  name: string | null;
  city: string | null;
  radius_meters: number | null;
  base_delivery_fee_paise: number | null;
  free_delivery_threshold_paise: number | null;
  launch_free_delivery: boolean | null;
  service_open_time: string | null;
  service_close_time: string | null;
  night_close_time: string | null;
  is_active: boolean | null;
};

const fmtTime = (t: string | null): string => {
  if (t === null) return '—';
  const parts = t.split(':');
  return `${parts[0]}:${parts[1] ?? '00'}`;
};

export const AdminZonesScreen: React.FC = () => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const mode: ChromeMode = colorScheme;
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [load, setLoad] = useState<'idle' | 'loading' | 'error'>('idle');
  const [zones, setZones] = useState<ZoneRow[]>([]);

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoad('loading');
    try {
      const { data, error } = await supabase
        .from('service_zones')
        .select(
          'id, code, name, city, radius_meters, base_delivery_fee_paise, free_delivery_threshold_paise, launch_free_delivery, service_open_time, service_close_time, night_close_time, is_active',
        )
        .order('code');
      if (error !== null) {
        setLoad('error');
        return;
      }
      setZones(((data ?? []) as unknown) as ZoneRow[]);
      setLoad('idle');
    } catch {
      setLoad('error');
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: surface.background }]}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader
        mode={mode}
        title="Geofence Zones"
        subtitle={`${zones.length} service zones · Makrana & expansion`}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
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
          <Text style={[styles.loadingText, { color: surface.textMuted }]}>Loading zones…</Text>
        ) : null}
        {zones.map((z) => (
          <SectionCard mode={mode} key={z.id} style={styles.zoneCard}>
            <View style={styles.zoneTop}>
              <View style={styles.zoneCodeBadge}>
                <Ionicons name="navigate" size={14} color={BRAND_COLORS.charcoalBlack} />
                <Text style={styles.zoneCodeText}>{z.code}</Text>
              </View>
              <View style={styles.zoneChips}>
                {z.launch_free_delivery === true ? (
                  <StatusChip mode={mode} label="LAUNCH FREE" tone="gold" />
                ) : null}
                <StatusChip
                  mode={mode}
                  label={z.is_active === false ? 'DARK' : 'LIVE'}
                  tone={z.is_active === false ? 'warning' : 'success'}
                />
              </View>
            </View>
            <Text style={[styles.zoneName, { color: surface.textPrimary }]}>
              {z.name ?? 'Zone'} · {z.city ?? 'Makrana'}
            </Text>
            <View style={styles.zoneStats}>
              <View style={[styles.zoneStat, { backgroundColor: surface.surface2 }]}>
                <Text style={[styles.zoneStatValue, { color: surface.textPrimary }]}>
                  {z.radius_meters === null ? '—' : `${(z.radius_meters / 1000).toFixed(1)} km`}
                </Text>
                <Text style={[styles.zoneStatLabel, { color: surface.textMuted }]}>radius</Text>
              </View>
              <View style={[styles.zoneStat, { backgroundColor: surface.surface2 }]}>
                <Text style={[styles.zoneStatValue, { color: surface.textPrimary }]}>
                  {z.base_delivery_fee_paise === null
                    ? '—'
                    : `₹${(z.base_delivery_fee_paise / 100).toFixed(0)}`}
                </Text>
                <Text style={[styles.zoneStatLabel, { color: surface.textMuted }]}>base fee</Text>
              </View>
              <View style={[styles.zoneStat, { backgroundColor: surface.surface2 }]}>
                <Text style={[styles.zoneStatValue, { color: surface.textPrimary }]}>
                  {z.free_delivery_threshold_paise === null
                    ? '—'
                    : `₹${(z.free_delivery_threshold_paise / 100).toFixed(0)}`}
                </Text>
                <Text style={[styles.zoneStatLabel, { color: surface.textMuted }]}>free above</Text>
              </View>
              <View style={[styles.zoneStat, { backgroundColor: surface.surface2 }]}>
                <Text style={[styles.zoneStatValue, { color: surface.textPrimary }]}>
                  {fmtTime(z.service_open_time)}–{fmtTime(z.night_close_time ?? z.service_close_time)}
                </Text>
                <Text style={[styles.zoneStatLabel, { color: surface.textMuted }]}>hours IST</Text>
              </View>
            </View>
          </SectionCard>
        ))}
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
  zoneCard: {
    gap: SPACING.sm,
  },
  zoneTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zoneCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND_COLORS.goldenYellow,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADII.full,
  },
  zoneCodeText: {
    ...TYPOGRAPHY.captionMin,
    color: BRAND_COLORS.charcoalBlack,
    fontWeight: '900',
  },
  zoneChips: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  zoneName: {
    ...TYPOGRAPHY.titleMd,
    fontWeight: '800',
  },
  zoneStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  zoneStat: {
    flex: 1,
    minWidth: 76,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    alignItems: 'center',
    gap: 1,
  },
  zoneStatValue: {
    ...TYPOGRAPHY.labelMd,
  },
  zoneStatLabel: {
    ...TYPOGRAPHY.captionMin,
    fontSize: 9,
  },
});
