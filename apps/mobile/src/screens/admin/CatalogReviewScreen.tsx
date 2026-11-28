import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View, } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  STATUS_COLORS,
  SURFACE_DARK,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { supabase, isSupabaseConfigured } from '@/services/supabase';

/**
 * Admin Catalog Review — closes the catalog autonomy loop.
 * Lists products the ingest worker flagged as `needs_review` and lets an
 * admin approve (→ admin_verified + auto ZP-ID) or reject them.
 * Access is RLS-guarded: catalog_review_queue is security_invoker and only
 * admins see non-active products; approve_catalog_product re-checks is_admin().
 */

type ReviewRow = {
  id: string;
  zaff_product_id: string | null;
  name: string;
  brand: string | null;
  barcode: string | null;
  image_url: string | null;
  source_system: string | null;
  unit_label: string | null;
  created_at: string;
};

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

const SOURCE_LABELS: Record<string, string> = {
  open_food_facts: 'Open Food Facts',
  wikimedia_commons: 'Wikimedia Commons',
  seller: 'Seller',
};

export const CatalogReviewScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setState('error');
      return;
    }
    setState((prev) => (prev === 'ready' ? prev : 'loading'));
    const { data, error } = await supabase
      .from('catalog_review_queue')
      .select(
        'id, zaff_product_id, name, brand, barcode, image_url, source_system, unit_label, created_at',
      )
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      setState('error');
      return;
    }
    setRows((data ?? []) as ReviewRow[]);
    setState((data ?? []).length ? 'ready' : 'empty');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    (row: ReviewRow, decision: 'approve' | 'reject') => {
      Alert.alert(
        decision === 'approve' ? 'Approve product?' : 'Reject product?',
        `${row.name}\n\n${
          decision === 'approve'
            ? 'Live ho jayega + permanent Zaff ID milegi.'
            : 'Catalog me publish nahi hoga.'
        }`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: decision === 'approve' ? 'Approve' : 'Reject',
            style: decision === 'approve' ? 'default' : 'destructive',
            onPress: async () => {
              setBusyId(row.id);
              const { error } = await supabase.rpc('approve_catalog_product', {
                p_product_id: row.id,
                p_decision: decision,
                p_note: decision === 'approve' ? 'admin approved via catalog review' : 'admin rejected via catalog review',
              });
              setBusyId(null);
              if (error) {
                Alert.alert('Action failed', error.message);
                return;
              }
              setRows((prev) => prev.filter((r) => r.id !== row.id));
              if (decision === 'approve') {
                Alert.alert('✅ Live ho gaya', `${row.name} ab permanent Zaff Product ID ke saath published hai.`);
              }
            },
          },
        ],
      );
    },
    [],
  );

  const renderRow = (row: ReviewRow) => {
    const busy = busyId === row.id;
    return (
      <View key={row.id} style={styles.card}>
        <View style={styles.cardTop}>
          {row.image_url ? (
            <Image source={{ uri: row.image_url }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Ionicons name="image-outline" size={22} color={SURFACE_DARK.textMuted} />
            </View>
          )}
          <View style={styles.cardMeta}>
            <Text style={styles.name} numberOfLines={2}>
              {row.name}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {[row.brand, row.unit_label].filter(Boolean).join(' · ') || '—'}
            </Text>
            <View style={styles.chipRow}>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  {SOURCE_LABELS[row.source_system ?? ''] ?? row.source_system ?? 'unknown'}
                </Text>
              </View>
              {row.barcode ? (
                <View style={[styles.chip, styles.chipAlt]}>
                  <Text style={styles.chipText} numberOfLines={1}>
                    {row.barcode}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.btn, styles.btnApprove, busy && styles.btnBusy]}
            disabled={busy}
            onPress={() => decide(row, 'approve')}
            accessibilityRole="button"
            accessibilityLabel={`Approve ${row.name}`}
          >
            <Ionicons name="checkmark-circle" size={18} color={BRAND_COLORS.charcoalBlack} />
            <Text style={styles.btnApproveText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.btn, styles.btnReject, busy && styles.btnBusy]}
            disabled={busy}
            onPress={() => decide(row, 'reject')}
            accessibilityRole="button"
            accessibilityLabel={`Reject ${row.name}`}
          >
            <Ionicons name="close-circle" size={18} color="#FCA5A5" />
            <Text style={styles.btnRejectText}>Reject</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={20} color={BRAND_COLORS.goldenYellow} />
        </Pressable>
        <View style={styles.headerIcon}>
          <Ionicons name="shield-checkmark" size={20} color={BRAND_COLORS.goldenYellow} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Catalog Review</Text>
          <Text style={styles.subtitle}>
            AI worker ke flagged products — approve karo, Zaff ID auto-milegi
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={state === 'loading'} onRefresh={load} tintColor={BRAND_COLORS.goldenYellow} />}
      >
        {state === 'error' ? (
          <View style={styles.stateBox}>
            <Ionicons name="cloud-offline-outline" size={28} color={STATUS_COLORS.warning} />
            <Text style={styles.stateText}>Review queue load nahi hua. Pull karke retry karo.</Text>
          </View>
        ) : null}
        {state === 'empty' ? (
          <View style={styles.stateBox}>
            <Ionicons name="checkmark-done-circle-outline" size={28} color={STATUS_COLORS.success} />
            <Text style={styles.stateText}>Queue clear hai — koi product pending review nahi hai.</Text>
          </View>
        ) : null}
        {state !== 'error' && state !== 'empty' ? rows.map(renderRow) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SURFACE_DARK.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: 'rgba(255,199,3,0.10)' },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: RADII.md,
    backgroundColor: 'rgba(255,199,3,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...TYPOGRAPHY.headlineMd, color: SURFACE_DARK.textPrimary },
  subtitle: { ...TYPOGRAPHY.bodySm, color: SURFACE_DARK.textMuted, marginTop: 2 },
  list: { padding: SPACING.md, gap: SPACING.sm, paddingBottom: SPACING.xl },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: RADII.lg,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,199,3,0.18)',
  },
  cardTop: { flexDirection: 'row', gap: SPACING.sm },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: RADII.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardMeta: { flex: 1, gap: 2 },
  name: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.textPrimary },
  sub: { ...TYPOGRAPHY.bodySm, color: SURFACE_DARK.textMuted },
  chipRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  chip: {
    backgroundColor: 'rgba(255,199,3,0.10)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipAlt: { backgroundColor: 'rgba(255,255,255,0.08)' },
  chipText: { ...TYPOGRAPHY.captionMin, color: BRAND_COLORS.goldenYellow },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  btn: {
    flex: 1,
    minHeight: TOUCH_TARGETS.minSize,
    maxHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnApprove: { backgroundColor: BRAND_COLORS.goldenYellow },
  btnReject: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
  },
  btnBusy: { opacity: 0.5 },
  btnApproveText: { ...TYPOGRAPHY.labelMd, color: BRAND_COLORS.charcoalBlack },
  btnRejectText: { ...TYPOGRAPHY.labelMd, color: '#FCA5A5' },
  stateBox: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xl * 1.5,
  },
  stateText: { ...TYPOGRAPHY.bodyMd, color: SURFACE_DARK.textMuted, textAlign: 'center' },
});
