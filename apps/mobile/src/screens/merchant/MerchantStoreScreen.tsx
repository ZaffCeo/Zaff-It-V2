/**
 * MerchantStoreScreen — REAL store settings (Wave-A).
 * Merchant's own stores: open/closed toggle (owner UPDATE policy),
 * timings, prep time, min order, zone, address.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
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
  type ChromeMode,
} from '@/components/Chrome';

type StoreRow = {
  id: string;
  name: string | null;
  address_line1: string | null;
  city: string | null;
  pincode: string | null;
  phone: string | null;
  is_open: boolean | null;
  opens_at: string | null;
  closes_at: string | null;
  prep_time_minutes: number | null;
  min_order_paise: number | null;
  fulfillment_type: string | null;
  service_zone_id: string | null;
};

type ZoneRow = { id: string; code: string; name: string | null };

export const MerchantStoreScreen: React.FC = () => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const setRole = useAppStore((s) => s.setRole);
  const mode: ChromeMode = colorScheme;
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [load, setLoad] = useState<'idle' | 'loading' | 'error'>('idle');
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [zones, setZones] = useState<Record<string, ZoneRow>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoad('loading');
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) {
        setLoad('error');
        return;
      }
      // merchant ids owned by this user
      const { data: merchantRows, error: mErr } = await supabase
        .from('merchants')
        .select('id')
        .eq('owner_user_id', uid);
      if (mErr !== null) {
        setLoad('error');
        return;
      }
      const mIds = ((merchantRows ?? []) as { id: string }[]).map((m) => m.id);
      if (mIds.length === 0) {
        setStores([]);
        setLoad('idle');
        return;
      }
      const [{ data: storeRows }, { data: zoneRows }] = await Promise.all([
        supabase
          .from('stores')
          .select(
            'id, name, address_line1, city, pincode, phone, is_open, opens_at, closes_at, prep_time_minutes, min_order_paise, fulfillment_type, service_zone_id',
          )
          .in('merchant_id', mIds)
          .order('name'),
        supabase.from('service_zones').select('id, code, name'),
      ]);
      const zMap: Record<string, ZoneRow> = {};
      for (const z of (zoneRows ?? []) as ZoneRow[]) {
        zMap[z.id] = z;
      }
      setZones(zMap);
      setStores(((storeRows ?? []) as unknown) as StoreRow[]);
      setLoad('idle');
    } catch {
      setLoad('error');
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const toggleOpen = async (store: StoreRow) => {
    setTogglingId(store.id);
    setNote(null);
    try {
      const next = store.is_open === null ? true : !store.is_open;
      const { error } = await supabase
        .from('stores')
        .update({ is_open: next })
        .eq('id', store.id);
      if (error !== null) {
        setNote(`Toggle failed: ${error.message}`);
      } else {
        setStores((rows) =>
          rows.map((r) => (r.id === store.id ? { ...r, is_open: next } : r)),
        );
        setNote(
          `${store.name ?? 'Store'} ab ${next ? 'OPEN' : 'CLOSED'} hai — customers ko turant dikhega.`,
        );
      }
    } catch (e) {
      setNote(`Toggle failed: ${String(e)}`);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: surface.background }]}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader
        mode={mode}
        title="My Stores"
        subtitle="Timings, min order & open status"
        right={
          <Pressable
            onPress={() => void loadData()}
            accessibilityRole="button"
            accessibilityLabel="Refresh stores"
            style={[
              styles.refreshBtn,
              { backgroundColor: surface.surface2, borderColor: surface.border },
            ]}
          >
            <Ionicons name="refresh" size={18} color={surface.textPrimary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Customer-mode switch — same account, 1-tap (persona workspace) */}
        <Pressable
          onPress={() => setRole('customer')}
          accessibilityRole="button"
          accessibilityLabel="Switch to customer shopping mode"
          style={[
            styles.customerSwitchCard,
            { backgroundColor: surface.surface2, borderColor: BRAND_COLORS.goldBorder },
          ]}
        >
          <Ionicons name="cart-outline" size={18} color={BRAND_COLORS.goldenYellow} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.customerSwitchTitle, { color: surface.textPrimary }]}>
              Shopping mode
            </Text>
            <Text style={[styles.customerSwitchSub, { color: surface.textSecondary }]}>
              Customer mode me switch karke apne liye order karo
            </Text>
          </View>
          <Ionicons name="swap-horizontal" size={18} color={BRAND_COLORS.goldenYellow} />
        </Pressable>
        {note !== null ? (
          <View
            style={[
              styles.noteBox,
              { backgroundColor: surface.surface2, borderColor: BRAND_COLORS.goldBorder },
            ]}
          >
            <Ionicons name="checkmark-circle" size={15} color={BRAND_COLORS.goldenYellow} />
            <Text style={[styles.noteText, { color: surface.textSecondary }]}>{note}</Text>
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
          <Text style={[styles.loadingText, { color: surface.textMuted }]}>Loading stores…</Text>
        ) : null}
        {load === 'idle' && stores.length === 0 ? (
          <SectionCard mode={mode}>
            <View style={styles.emptyWrap}>
              <Ionicons name="storefront-outline" size={28} color={surface.textMuted} />
              <Text style={[styles.emptyText, { color: surface.textMuted }]}>
                Aapke account se koi store linked nahi hai. Dukan onboarding ke baad
                stores yahan dikhenge.
              </Text>
            </View>
          </SectionCard>
        ) : null}

        {stores.map((s) => {
          const zone = s.service_zone_id !== null ? zones[s.service_zone_id] : undefined;
          return (
            <SectionCard mode={mode} key={s.id} style={styles.storeCard}>
              <View style={styles.storeTop}>
                <View style={styles.storeNameWrap}>
                  <Text numberOfLines={1} style={[styles.storeName, { color: surface.textPrimary }]}>
                    {s.name ?? 'Store'}
                  </Text>
                  <Text style={[styles.storeSub, { color: surface.textMuted }]}>
                    {zone !== undefined ? `${zone.code} · ` : ''}
                    {s.address_line1 ?? '—'}, {s.city ?? 'Makrana'} {s.pincode ?? ''}
                  </Text>
                </View>
                <View style={styles.openToggle}>
                  <Text
                    style={[
                      styles.openToggleLabel,
                      {
                        color:
                          (s.is_open ?? false) ? BRAND_COLORS.electricGreen : surface.textMuted,
                        fontWeight: '800',
                      },
                    ]}
                  >
                    {(s.is_open ?? false) ? 'OPEN' : 'CLOSED'}
                  </Text>
                  <Switch
                    value={s.is_open ?? false}
                    onValueChange={() => void toggleOpen(s)}
                    disabled={togglingId !== null}
                    trackColor={{
                      false: surface.surface3,
                      true: BRAND_COLORS.electricGreen,
                    }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
              <View style={styles.factsRow}>
                <View style={[styles.fact, { backgroundColor: surface.surface2 }]}>
                  <Ionicons name="time-outline" size={14} color={surface.textMuted} />
                  <Text style={[styles.factText, { color: surface.textSecondary }]}>
                    {s.opens_at ?? '—'}–{s.closes_at ?? '—'}
                  </Text>
                </View>
                <View style={[styles.fact, { backgroundColor: surface.surface2 }]}>
                  <Ionicons name="speedometer-outline" size={14} color={surface.textMuted} />
                  <Text style={[styles.factText, { color: surface.textSecondary }]}>
                    {s.prep_time_minutes === null ? '—' : `${s.prep_time_minutes} min prep`}
                  </Text>
                </View>
                <View style={[styles.fact, { backgroundColor: surface.surface2 }]}>
                  <Ionicons name="cash-outline" size={14} color={surface.textMuted} />
                  <Text style={[styles.factText, { color: surface.textSecondary }]}>
                    {s.min_order_paise === null
                      ? '—'
                      : `min ₹${(s.min_order_paise / 100).toFixed(0)}`}
                  </Text>
                </View>
              </View>
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
  refreshBtn: {
    width: 44,
    height: 44,
    borderRadius: RADII.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    padding: SPACING.md,
  },
  noteText: {
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
  storeCard: {
    gap: SPACING.sm,
  },
  storeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  storeNameWrap: {
    flex: 1,
    gap: 2,
  },
  storeName: {
    ...TYPOGRAPHY.titleMd,
    fontWeight: '800',
  },
  storeSub: {
    ...TYPOGRAPHY.bodySm,
  },
  openToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  openToggleLabel: {
    ...TYPOGRAPHY.captionMin,
  },
  factsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: RADII.full,
  },
  factText: {
    ...TYPOGRAPHY.captionMin,
  },
  customerSwitchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  customerSwitchTitle: {
    ...TYPOGRAPHY.labelLg,
  },
  customerSwitchSub: {
    ...TYPOGRAPHY.bodySm,
    marginTop: 2,
  },
});
