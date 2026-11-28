import { useNavigation } from '@react-navigation/native';
/**
 * AdminMerchantsScreen — REAL merchant governance list (Wave-A).
 * Merchants + their stores, KYC status, commission, active state.
 * Read-only: mutations stay in admin SQL/RPC surfaces (audited).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  type ChipTone,
  type ChromeMode,
} from '@/components/Chrome';

type MerchantRow = {
  id: string;
  business_name: string | null;
  legal_name: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  kyc_status: string | null;
  commission_bps: number | null;
  is_active: boolean | null;
  created_at: string;
};

type StoreRow = {
  id: string;
  merchant_id: string;
  name: string | null;
  is_active: boolean | null;
};

export const AdminMerchantsScreen: React.FC = () => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const mode: ChromeMode = colorScheme;
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [load, setLoad] = useState<'idle' | 'loading' | 'error'>('idle');
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoad('loading');
    try {
      const [{ data: mRows, error: mErr }, { data: sRows }] = await Promise.all([
        supabase
          .from('merchants')
          .select(
            'id, business_name, legal_name, phone, email, gstin, kyc_status, commission_bps, is_active, created_at',
          )
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('stores')
          .select('id, merchant_id, name, is_active')
          .limit(200),
      ]);
      if (mErr !== null) {
        setLoad('error');
        return;
      }
      setMerchants(((mRows ?? []) as unknown) as MerchantRow[]);
      setStores(((sRows ?? []) as unknown) as StoreRow[]);
      setLoad('idle');
    } catch {
      setLoad('error');
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const storesByMerchant = useMemo(() => {
    const map: Record<string, StoreRow[]> = {};
    for (const s of stores) {
      (map[s.merchant_id] ??= []).push(s);
    }
    return map;
  }, [stores]);

  const kycTone = (status: string | null): ChipTone => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'rejected':
        return 'error';
      case 'pending':
        return 'warning';
      default:
        return 'info';
    }
  };

  const navigation = useNavigation<any>();
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: surface.background }]}
      edges={['top', 'left', 'right']}
    >
      <ScreenHeader
        mode={mode}
        title="Merchants"
        subtitle={`${merchants.length} registered · ${stores.length} stores`}
        onBack={() => navigation.goBack()}
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
          <Text style={[styles.loadingText, { color: surface.textMuted }]}>Loading merchants…</Text>
        ) : null}
        {load === 'idle' && merchants.length === 0 ? (
          <SectionCard mode={mode}>
            <Text style={[styles.loadingText, { color: surface.textMuted }]}>
              Koi merchant registered nahi hai.
            </Text>
          </SectionCard>
        ) : null}
        {merchants.map((m) => {
          const mStores = storesByMerchant[m.id] ?? [];
          return (
            <SectionCard mode={mode} key={m.id} style={styles.mCard}>
              <View style={styles.mTop}>
                <View style={styles.mNameWrap}>
                  <Text numberOfLines={1} style={[styles.mName, { color: surface.textPrimary }]}>
                    {m.business_name ?? m.legal_name ?? 'Unnamed merchant'}
                  </Text>
                  <Text style={[styles.mSub, { color: surface.textMuted }]}>
                    {m.phone ?? m.email ?? '—'} · commission{' '}
                    {m.commission_bps === null ? '—' : `${(m.commission_bps / 100).toFixed(1)}%`}
                  </Text>
                </View>
                <View style={styles.mChips}>
                  {m.kyc_status !== null ? (
                    <StatusChip mode={mode} label={`KYC ${m.kyc_status.toUpperCase()}`} tone={kycTone(m.kyc_status)} />
                  ) : null}
                  <StatusChip
                    mode={mode}
                    label={m.is_active === false ? 'INACTIVE' : 'ACTIVE'}
                    tone={m.is_active === false ? 'error' : 'success'}
                  />
                </View>
              </View>
              {m.gstin !== null && m.gstin !== '' ? (
                <Text style={[styles.mGstin, { color: surface.textMuted }]}>GSTIN {m.gstin}</Text>
              ) : null}
              {mStores.length > 0 ? (
                <View style={styles.storeChips}>
                  {mStores.map((s) => (
                    <View
                      key={s.id}
                      style={[styles.storeChip, { backgroundColor: surface.surface2, borderColor: surface.borderAlt }]}
                    >
                      <Ionicons
                        name={s.is_active === false ? 'storefront-outline' : 'storefront'}
                        size={12}
                        color={s.is_active === false ? surface.textMuted : BRAND_COLORS.electricGreen}
                      />
                      <Text style={[styles.storeChipText, { color: surface.textSecondary }]} numberOfLines={1}>
                        {s.name ?? 'Store'}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.mGstin, { color: surface.textMuted }]}>Koi store nahi</Text>
              )}
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
  mCard: {
    gap: SPACING.sm,
  },
  mTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  mNameWrap: {
    flex: 1,
    gap: 2,
  },
  mName: {
    ...TYPOGRAPHY.titleMd,
    fontWeight: '800',
  },
  mSub: {
    ...TYPOGRAPHY.bodySm,
  },
  mChips: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  mGstin: {
    ...TYPOGRAPHY.captionMin,
  },
  storeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  storeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: RADII.full,
    borderWidth: 1,
    maxWidth: 180,
  },
  storeChipText: {
    ...TYPOGRAPHY.captionMin,
    flexShrink: 1,
  },
});
