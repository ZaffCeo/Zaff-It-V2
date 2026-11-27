import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BRAND_COLORS,
  ELEVATION,
  GLOW,
  RADII,
  SPACING,
  STATUS_COLORS,
  SURFACE_DARK,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { MerchantInsightsCard } from '@/screens/merchant/MerchantInsightsCard';
import { MerchantKhataCard } from '@/screens/merchant/MerchantKhataCard';

export type ScreenLoadState = 'ready' | 'loading' | 'empty' | 'error';

export interface MerchantDashboardMetrics {
  storeId: string;
  storeName: string;
  locality: string;
  isOpen: boolean;
  todayOrdersTotal: number;
  pendingOrdersCount: number;
  packingOrdersCount: number;
  dispatchedOrdersCount: number;
  deliveredOrdersCount: number;
  todayRevenuePaise: number;
  upiRevenuePaise: number;
  codRevenuePaise: number;
  activeSlaSecondsRemaining: number;
  targetPrepMinutes: number;
  dynamicEtaMin: number;
  dynamicEtaMax: number;
  lastUpdatedLabel: string;
}

export interface MerchantDashboardScreenProps {
  initialState?: ScreenLoadState;
  initialMetrics?: MerchantDashboardMetrics;
  onToggleStore?: (nextOpen: boolean) => Promise<void> | void;
  onOpenOrders?: () => void;
  onOpenInventory?: () => void;
  onRefresh?: () => Promise<MerchantDashboardMetrics | void> | void;
}

const DEFAULT_METRICS: MerchantDashboardMetrics = {
  storeId: 'store_mkr_001',
  storeName: 'Makrana Supermart & Kirana',
  locality: 'Station Road, Makrana',
  isOpen: true,
  todayOrdersTotal: 42,
  pendingOrdersCount: 3,
  packingOrdersCount: 4,
  dispatchedOrdersCount: 2,
  deliveredOrdersCount: 33,
  todayRevenuePaise: 1845250,
  upiRevenuePaise: 1210000,
  codRevenuePaise: 635250,
  activeSlaSecondsRemaining: 522, // 08:42
  targetPrepMinutes: 12,
  dynamicEtaMin: 22,
  dynamicEtaMax: 28,
  lastUpdatedLabel: 'Just now',
};

function formatPaiseToINR(paise: number): string {
  const rupees = paise / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(rupees);
  } catch {
    return `₹${rupees.toFixed(2)}`;
  }
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const MerchantDashboardScreen: React.FC<MerchantDashboardScreenProps> = ({
  initialState = 'ready',
  initialMetrics = DEFAULT_METRICS,
  onToggleStore,
  onOpenOrders,
  onOpenInventory,
  onRefresh,
}) => {
  const [loadState, setLoadState] = useState<ScreenLoadState>(initialState);
  const [metrics, setMetrics] = useState<MerchantDashboardMetrics>(initialMetrics);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingStore, setTogglingStore] = useState(false);
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>(
    'Unable to sync store dashboard with server. Check your connection and retry.'
  );

  // Live SLA countdown tick
  useEffect(() => {
    if (loadState !== 'ready' || !metrics.isOpen) return;
    const timer = setInterval(() => {
      setMetrics((prev) => ({
        ...prev,
        activeSlaSecondsRemaining:
          prev.activeSlaSecondsRemaining > 0 ? prev.activeSlaSecondsRemaining - 1 : 0,
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [loadState, metrics.isOpen]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (onRefresh) {
        const updated = await onRefresh();
        if (updated) setMetrics(updated);
      }
      setLoadState('ready');
    } catch {
      setErrorMessage('Could not refresh merchant metrics. Please try again.');
      setLoadState('error');
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const commitStoreToggle = useCallback(
    async (nextOpen: boolean) => {
      setTogglingStore(true);
      try {
        if (onToggleStore) {
          await onToggleStore(nextOpen);
        }
        setMetrics((prev) => ({ ...prev, isOpen: nextOpen }));
      } catch {
        setErrorMessage('Failed to update store open/close status.');
        setLoadState('error');
      } finally {
        setTogglingStore(false);
        setCloseModalVisible(false);
      }
    },
    [onToggleStore]
  );

  const handleStoreSwitchPress = useCallback(
    (nextValue: boolean) => {
      if (!nextValue && metrics.isOpen) {
        setCloseModalVisible(true);
      } else {
        void commitStoreToggle(true);
      }
    },
    [commitStoreToggle, metrics.isOpen]
  );

  const slaUrgency = useMemo(() => {
    if (metrics.activeSlaSecondsRemaining <= 120) return 'critical';
    if (metrics.activeSlaSecondsRemaining <= 300) return 'warning';
    return 'healthy';
  }, [metrics.activeSlaSecondsRemaining]);

  if (loadState === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.container}>
          <View style={styles.skeletonHeader} />
          <View style={styles.skeletonCardLg} />
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonCardSm} />
            <View style={styles.skeletonCardSm} />
          </View>
          <View style={styles.skeletonCardMd} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'error') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.stateContainer}>
          <View style={[styles.stateBadge, { backgroundColor: STATUS_COLORS.errorBgDark }]}>
            <Text style={[styles.stateBadgeText, { color: STATUS_COLORS.errorBright }]}>
              SYNC ERROR
            </Text>
          </View>
          <Text style={styles.stateTitle}>Dashboard Unavailable</Text>
          <Text style={styles.stateBody}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.primaryCta}
            onPress={handleRefresh}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Retry loading merchant dashboard"
          >
            <Text style={styles.primaryCtaText}>Retry Sync</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'empty') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.stateContainer}>
          <View style={[styles.stateBadge, { backgroundColor: BRAND_COLORS.goldenYellowGlow }]}>
            <Text style={[styles.stateBadgeText, { color: BRAND_COLORS.goldenYellow }]}>
              NO ORDERS YET
            </Text>
          </View>
          <Text style={styles.stateTitle}>Ready for Today&apos;s First Order</Text>
          <Text style={styles.stateBody}>
            Your store is connected to the Makrana dispatch network. Keep your inventory updated to
            receive orders.
          </Text>
          <TouchableOpacity
            style={styles.primaryCta}
            onPress={onOpenInventory ?? handleRefresh}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Check store inventory"
          >
            <Text style={styles.primaryCtaText}>Review Inventory</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={BRAND_COLORS.goldenYellow}
          />
        }
      >
        {/* Store Header + Open/Close Toggle */}
        <View style={styles.headerCard}>
          <View style={styles.headerLogoTile}>
            <Image
              source={require('../../../assets/zaff-it-logo.jpg')}
              style={styles.headerLogoImage}
              resizeMode="contain"
              accessibilityLabel="ZAFF Partner Logo"
            />
          </View>
          <View style={styles.headerTextCol}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.storeName} numberOfLines={1}>
                ZAFF Partner
              </Text>
              {metrics.isOpen ? (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.livePillText}>LIVE</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.storeLocality} numberOfLines={1}>
              {metrics.storeName} · {metrics.locality}
            </Text>
            <Text style={styles.storeLocality}>{metrics.locality}</Text>
          </View>

          <View style={styles.toggleWrapper}>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: metrics.isOpen
                    ? BRAND_COLORS.electricGreen
                    : STATUS_COLORS.error,
                },
              ]}
            >
              <Text style={styles.statusPillText}>{metrics.isOpen ? 'OPEN' : 'CLOSED'}</Text>
            </View>
            <View style={styles.switchTouchBox}>
              {togglingStore ? (
                <ActivityIndicator color={BRAND_COLORS.goldenYellow} />
              ) : (
                <Switch
                  value={metrics.isOpen}
                  onValueChange={handleStoreSwitchPress}
                  trackColor={{
                    false: SURFACE_DARK.surface3,
                    true: BRAND_COLORS.electricGreen,
                  }}
                  thumbColor={BRAND_COLORS.pureWhite}
                  accessibilityLabel="Toggle store open or closed"
                />
              )}
            </View>
          </View>
        </View>

        {/* Aaj ka Khata (live settlement + order summary) */}
        <MerchantKhataCard />

        {/* Aaj ka Intelligence (live RPC + demo fallback) */}
        <MerchantInsightsCard />

        {/* Active SLA Timer Banner */}
        <View
          style={[
            styles.slaCard,
            slaUrgency === 'critical' && styles.slaCardCritical,
            slaUrgency === 'warning' && styles.slaCardWarning,
          ]}
        >
          <View style={styles.slaLeft}>
            <Text style={styles.slaEyebrow}>ACTIVE PREP SLA TIMER</Text>
            <Text style={styles.slaSubtext}>
              Target {metrics.targetPrepMinutes} min prep · Customer ETA {metrics.dynamicEtaMin}–
              {metrics.dynamicEtaMax} min
            </Text>
          </View>
          <View style={styles.slaTimerBox}>
            <Text
              style={[
                styles.slaTimerText,
                slaUrgency === 'critical' && { color: STATUS_COLORS.errorBright },
                slaUrgency === 'warning' && { color: STATUS_COLORS.warningBright },
              ]}
            >
              {metrics.isOpen ? formatCountdown(metrics.activeSlaSecondsRemaining) : '--:--'}
            </Text>
            <Text style={styles.slaTimerCaption}>MM:SS</Text>
          </View>
        </View>

        {/* Revenue Card (Paise formatted cleanly) */}
        <View style={styles.revenueCard}>
          <View style={styles.revenueHeader}>
            <Text style={styles.sectionLabel}>TODAY&apos;S GROSS REVENUE</Text>
            <Text style={styles.updatedText}>Updated {metrics.lastUpdatedLabel}</Text>
          </View>
          <Text style={styles.revenueValue}>{formatPaiseToINR(metrics.todayRevenuePaise)}</Text>
          <View style={styles.splitRow}>
            <View style={styles.splitPill}>
              <Text style={styles.splitLabel}>UPI / Online</Text>
              <Text style={styles.splitValue}>{formatPaiseToINR(metrics.upiRevenuePaise)}</Text>
            </View>
            <View style={styles.splitPill}>
              <Text style={styles.splitLabel}>Cash on Delivery</Text>
              <Text style={styles.splitValue}>{formatPaiseToINR(metrics.codRevenuePaise)}</Text>
            </View>
          </View>
        </View>

        {/* Today's Orders Breakdown */}
        <View style={styles.ordersSummaryCard}>
          <View style={styles.ordersHeader}>
            <Text style={styles.sectionLabel}>TODAY&apos;S ORDERS</Text>
            <Text style={styles.totalOrdersBadge}>{metrics.todayOrdersTotal} Total</Text>
          </View>

          <View style={styles.kpiGrid}>
            <View style={styles.kpiBox}>
              <Text style={[styles.kpiNumber, { color: STATUS_COLORS.warningBright }]}>
                {metrics.pendingOrdersCount}
              </Text>
              <Text style={styles.kpiLabel}>Pending</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={[styles.kpiNumber, { color: BRAND_COLORS.goldenYellow }]}>
                {metrics.packingOrdersCount}
              </Text>
              <Text style={styles.kpiLabel}>Packing</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={[styles.kpiNumber, { color: STATUS_COLORS.info }]}>
                {metrics.dispatchedOrdersCount}
              </Text>
              <Text style={styles.kpiLabel}>Dispatched</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={[styles.kpiNumber, { color: BRAND_COLORS.electricGreenLight }]}>
                {metrics.deliveredOrdersCount}
              </Text>
              <Text style={styles.kpiLabel}>Delivered</Text>
            </View>
          </View>
        </View>

        {/* Primary Quick Actions (>=52dp CTAs) */}
        <View style={styles.actionsColumn}>
          <TouchableOpacity
            style={styles.primaryCta}
            onPress={onOpenOrders}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open incoming orders queue"
          >
            <Text style={styles.primaryCtaText}>
              Manage Live Orders ({metrics.pendingOrdersCount} Pending)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryCta}
            onPress={onOpenInventory}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Update store inventory stock"
          >
            <Text style={styles.secondaryCtaText}>Quick Stock & Inventory</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Store Pause / Close Confirmation Modal */}
      <Modal
        visible={closeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCloseModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Close Store for New Orders?</Text>
            <Text style={styles.modalBody}>
              Customers in Makrana will not be able to place new orders while your store is closed.
              You must still fulfill {metrics.pendingOrdersCount + metrics.packingOrdersCount}{' '}
              active orders.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCloseModalVisible(false)}
                accessibilityRole="button"
              >
                <Text style={styles.modalCancelText}>Keep Open</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => commitStoreToggle(false)}
                accessibilityRole="button"
              >
                <Text style={styles.modalConfirmText}>Close Store</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: SURFACE_DARK.background,
  },
  scroll: {
    flex: 1,
  },
  container: {
    padding: SPACING.screenPadding,
    gap: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  headerCard: {
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.lg,
    padding: SPACING.cardPadding,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    ...ELEVATION.sm,
  },
  headerLogoTile: {
    width: 52,
    height: 52,
    borderRadius: RADII.md,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerLogoImage: {
    width: 44,
    height: 32,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND_COLORS.electricGreen,
    borderRadius: RADII.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: RADII.full,
    backgroundColor: BRAND_COLORS.pureWhite,
  },
  livePillText: {
    color: BRAND_COLORS.pureWhite,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerTextCol: {
    flex: 1,
    gap: SPACING.xxs,
  },
  storeLabel: {
    ...TYPOGRAPHY.captionMin,
    color: BRAND_COLORS.goldenYellow,
    letterSpacing: 0.8,
  },
  storeName: {
    ...TYPOGRAPHY.headlineMd,
    color: SURFACE_DARK.textPrimary,
  },
  storeLocality: {
    ...TYPOGRAPHY.bodySm,
    color: SURFACE_DARK.textMuted,
  },
  toggleWrapper: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  statusPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.full,
    minHeight: 24,
    justifyContent: 'center',
  },
  statusPillText: {
    ...TYPOGRAPHY.captionMin,
    color: SURFACE_DARK.onSuccess,
    fontWeight: '700',
  },
  switchTouchBox: {
    minWidth: TOUCH_TARGETS.minSize,
    minHeight: TOUCH_TARGETS.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slaCard: {
    backgroundColor: SURFACE_DARK.surface2,
    borderRadius: RADII.lg,
    padding: SPACING.cardPadding,
    borderWidth: 1,
    borderColor: BRAND_COLORS.electricGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  slaCardWarning: {
    borderColor: STATUS_COLORS.warningBright,
  },
  slaCardCritical: {
    borderColor: STATUS_COLORS.errorBright,
    backgroundColor: STATUS_COLORS.errorBgDark,
  },
  slaLeft: {
    flex: 1,
    gap: SPACING.xs,
  },
  slaEyebrow: {
    ...TYPOGRAPHY.labelMd,
    color: SURFACE_DARK.textPrimary,
  },
  slaSubtext: {
    ...TYPOGRAPHY.bodySm,
    color: SURFACE_DARK.textSecondary,
  },
  slaTimerBox: {
    alignItems: 'flex-end',
  },
  slaTimerText: {
    ...TYPOGRAPHY.headlineLg,
    color: BRAND_COLORS.electricGreenLight,
    fontVariant: ['tabular-nums'],
  },
  slaTimerCaption: {
    ...TYPOGRAPHY.captionMin,
    color: SURFACE_DARK.textMuted,
  },
  revenueCard: {
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    gap: SPACING.md,
  },
  revenueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    ...TYPOGRAPHY.labelMd,
    color: SURFACE_DARK.textMuted,
  },
  updatedText: {
    ...TYPOGRAPHY.captionMin,
    color: SURFACE_DARK.textMuted,
  },
  revenueValue: {
    ...TYPOGRAPHY.displayLg,
    color: BRAND_COLORS.goldenYellow,
    fontVariant: ['tabular-nums'],
  },
  splitRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  splitPill: {
    flex: 1,
    backgroundColor: SURFACE_DARK.surface2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  splitLabel: {
    ...TYPOGRAPHY.captionMin,
    color: SURFACE_DARK.textMuted,
  },
  splitValue: {
    ...TYPOGRAPHY.titleMd,
    color: SURFACE_DARK.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  ordersSummaryCard: {
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    gap: SPACING.md,
  },
  ordersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalOrdersBadge: {
    ...TYPOGRAPHY.labelMd,
    color: SURFACE_DARK.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  kpiGrid: {
    flexDirection: 'row',
    backgroundColor: SURFACE_DARK.canvasLowest,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    paddingVertical: SPACING.md,
    ...ELEVATION.sm,
  },
  kpiBox: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.xs,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: SURFACE_DARK.borderStrong,
  },
  kpiNumber: {
    ...TYPOGRAPHY.headlineLg,
    fontVariant: ['tabular-nums'],
  },
  kpiLabel: {
    ...TYPOGRAPHY.captionMin,
    color: SURFACE_DARK.textSecondary,
  },
  actionsColumn: {
    gap: SPACING.md,
  },
  primaryCta: {
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderRadius: RADII.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    ...GLOW.gold,
  },
  primaryCtaText: {
    ...TYPOGRAPHY.labelLg,
    color: SURFACE_DARK.onPrimary,
  },
  secondaryCta: {
    minHeight: TOUCH_TARGETS.recommendedSize,
    backgroundColor: SURFACE_DARK.surface2,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  secondaryCtaText: {
    ...TYPOGRAPHY.labelLg,
    color: SURFACE_DARK.textPrimary,
  },
  stateContainer: {
    flex: 1,
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  stateBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.full,
  },
  stateBadgeText: {
    ...TYPOGRAPHY.captionMin,
  },
  stateTitle: {
    ...TYPOGRAPHY.headlineMd,
    color: SURFACE_DARK.textPrimary,
    textAlign: 'center',
  },
  stateBody: {
    ...TYPOGRAPHY.bodyMd,
    color: SURFACE_DARK.textSecondary,
    textAlign: 'center',
  },
  skeletonHeader: {
    height: 84,
    borderRadius: RADII.lg,
    backgroundColor: SURFACE_DARK.surface2,
  },
  skeletonCardLg: {
    height: 150,
    borderRadius: RADII.lg,
    backgroundColor: SURFACE_DARK.surface2,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  skeletonCardSm: {
    flex: 1,
    height: 96,
    borderRadius: RADII.lg,
    backgroundColor: SURFACE_DARK.surface2,
  },
  skeletonCardMd: {
    height: 120,
    borderRadius: RADII.lg,
    backgroundColor: SURFACE_DARK.surface2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: SURFACE_DARK.surface3,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
  },
  modalTitle: {
    ...TYPOGRAPHY.headlineMd,
    color: SURFACE_DARK.textPrimary,
  },
  modalBody: {
    ...TYPOGRAPHY.bodyMd,
    color: SURFACE_DARK.textSecondary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  modalCancelBtn: {
    flex: 1,
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
  },
  modalCancelText: {
    ...TYPOGRAPHY.labelLg,
    color: SURFACE_DARK.textPrimary,
  },
  modalConfirmBtn: {
    flex: 1,
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.md,
    backgroundColor: STATUS_COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    ...TYPOGRAPHY.labelLg,
    color: BRAND_COLORS.pureWhite,
  },
});

export default MerchantDashboardScreen;
