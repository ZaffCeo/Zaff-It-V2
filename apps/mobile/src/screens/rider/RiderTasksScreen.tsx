import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

export type RiderTasksLoadState = 'ready' | 'loading' | 'empty' | 'error';
export type TaskPhase = 'offer' | 'pickup_en_route' | 'picked_up' | 'handover_ready';

export interface RiderAssignment {
  taskId: string;
  orderCode: string;
  phase: TaskPhase;
  offerSecondsLeft: number;
  payoutPaise: number;
  distanceKm: number;
  etaMin: number;
  etaMax: number;
  paymentMode: 'UPI' | 'COD';
  codAmountPaise: number;
  storeName: string;
  storeAddress: string;
  storeLat: number;
  storeLng: number;
  customerLocality: string;
  customerLat: number;
  customerLng: number;
}

export interface RiderTasksScreenProps {
  initialState?: RiderTasksLoadState;
  initialOnline?: boolean;
  initialAssignment?: RiderAssignment | null;
  onToggleOnline?: (nextOnline: boolean) => Promise<void> | void;
  onAcceptOffer?: (taskId: string) => Promise<void> | void;
  onDeclineOffer?: (taskId: string) => Promise<void> | void;
  onConfirmPickup?: (taskId: string) => Promise<void> | void;
  onProceedToOtp?: (assignment: RiderAssignment) => void;
  onRefresh?: () => Promise<RiderAssignment | null | void> | void;
}

const DEFAULT_ASSIGNMENT: RiderAssignment = {
  taskId: 'tsk_mkr_701',
  orderCode: 'MKR-1042',
  phase: 'offer',
  offerSecondsLeft: 38,
  payoutPaise: 4200,
  distanceKm: 2.4,
  etaMin: 22,
  etaMax: 28,
  paymentMode: 'COD',
  codAmountPaise: 34200,
  storeName: 'Makrana Supermart & Kirana',
  storeAddress: 'Station Road, Near Railway Crossing, Makrana',
  storeLat: 27.0418,
  storeLng: 74.7186,
  customerLocality: 'Jain Nagar, Ward 14, Makrana',
  customerLat: 27.0485,
  customerLng: 74.7261,
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

export const RiderTasksScreen: React.FC<RiderTasksScreenProps> = ({
  initialState = 'ready',
  initialOnline = true,
  initialAssignment = DEFAULT_ASSIGNMENT,
  onToggleOnline,
  onAcceptOffer,
  onDeclineOffer,
  onConfirmPickup,
  onProceedToOtp,
  onRefresh,
}) => {
  const [loadState, setLoadState] = useState<RiderTasksLoadState>(initialState);
  const [isOnline, setIsOnline] = useState(initialOnline);
  const [sosSending, setSosSending] = useState(false);
  const [assignment, setAssignment] = useState<RiderAssignment | null>(initialAssignment);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!assignment || assignment.phase !== 'offer') return;
    const timer = setInterval(() => {
      setAssignment((prev) =>
        prev && prev.phase === 'offer'
          ? { ...prev, offerSecondsLeft: Math.max(0, prev.offerSecondsLeft - 1) }
          : prev
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [assignment?.phase]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (onRefresh) {
        const next = await onRefresh();
        if (next !== undefined) setAssignment(next);
      }
      setLoadState('ready');
    } catch {
      setLoadState('error');
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const handleOnlineToggle = useCallback(
    (nextVal: boolean) => {
      setIsOnline(nextVal);
      if (onToggleOnline) void onToggleOnline(nextVal);
    },
    [onToggleOnline]
  );

  const handleAccept = useCallback(() => {
    if (!assignment) return;
    setAssignment({ ...assignment, phase: 'pickup_en_route' });
    if (onAcceptOffer) void onAcceptOffer(assignment.taskId);
  }, [assignment, onAcceptOffer]);

  const handleDecline = useCallback(() => {
    if (!assignment) return;
    if (onDeclineOffer) void onDeclineOffer(assignment.taskId);
    setAssignment(null);
  }, [assignment, onDeclineOffer]);

  const handleOpenOsmNavigation = useCallback(() => {
    if (!assignment) return;
    const isToStore = assignment.phase === 'pickup_en_route' || assignment.phase === 'offer';
    const destLat = isToStore ? assignment.storeLat : assignment.customerLat;
    const destLng = isToStore ? assignment.storeLng : assignment.customerLng;
    const url = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${destLat}%2C${destLng}`;
    void Linking.openURL(url);
  }, [assignment]);

  const handleConfirmPickup = useCallback(() => {
    if (!assignment) return;
    setAssignment({ ...assignment, phase: 'picked_up' });
    if (onConfirmPickup) void onConfirmPickup(assignment.taskId);
  }, [assignment, onConfirmPickup]);

  const handleSos = () => {
    Alert.alert(
      'Rider SOS',
      'Emergency alert control room ko bhejni hai? (Accident, threat, ya kisi bhi emergency me)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Bhejo SOS',
          style: 'destructive',
          onPress: async () => {
            if (sosSending) return;
            setSosSending(true);
            try {
              const { data: sess } = await supabase.auth.getSession();
              const uid = sess.session?.user?.id;
              if (!uid || !isSupabaseConfigured()) {
                Alert.alert('Offline', 'Network nahi hai. Direct store/control room ko call karein.');
                return;
              }
              const stamp = new Date().toISOString();
              const { error } = await supabase.from('support_tickets').insert({
                ticket_number: `TKT-SOS-${Date.now().toString(36).toUpperCase()}`,
                user_id: uid,
                category: 'sos',
                subject: 'RIDER SOS ALERT',
                description: `Rider emergency alert fired at ${stamp}. Online: ${isOnline ? 'yes' : 'no'}. Last assignment: ${assignment?.orderCode ?? 'none'}.`,
                priority: 'critical',
                status: 'open',
              });
              if (error) {
                Alert.alert('SOS fail', 'Bheja nahi ja saka. Turant control room ko call karein.');
                return;
              }
              Alert.alert(
                'SOS bhej diya gaya ✅',
                'Control room ko alert mil gaya. Help raste me hai. Zaruri ho to turant call karein.',
              );
            } catch {
              Alert.alert('SOS fail', 'Turant control room ko call karein.');
            } finally {
              setSosSending(false);
            }
          },
        },
      ],
    );
  };

  if (loadState === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.skeletonWrap}>
          <View style={styles.skeletonBar} />
          <View style={styles.skeletonCard} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'error') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.stateContainer}>
          <Text style={styles.stateTitle}>Dispatch Radar Offline</Text>
          <Text style={styles.stateBody}>
            Could not reach dispatch server. Retry to receive Makrana delivery tasks.
          </Text>
          <TouchableOpacity style={styles.ctaPrimary56} onPress={handleRefresh} accessibilityRole="button">
            <Text style={styles.ctaPrimary56Text}>Retry Dispatch</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Floating SOS — emergency alert to control room */}
      <TouchableOpacity
        style={[styles.sosFab, sosSending && { opacity: 0.6 }]}
        onPress={handleSos}
        disabled={sosSending}
        accessibilityRole="button"
        accessibilityLabel="Rider emergency SOS"
      >
        <Text style={styles.sosFabText}>SOS</Text>
      </TouchableOpacity>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={BRAND_COLORS.goldenYellow}
          />
        }
      >
        {/* Online / Offline Duty Toggle Bar */}
        <View style={styles.dutyBar}>
          <View style={styles.dutyTextCol}>
            <Text style={styles.dutyLabel}>RIDER DUTY STATUS</Text>
            <Text
              style={[
                styles.dutyStateText,
                { color: isOnline ? BRAND_COLORS.electricGreenLight : STATUS_COLORS.errorBright },
              ]}
            >
              {isOnline ? 'ONLINE · Makrana Zone' : 'OFFLINE · Not Receiving Tasks'}
            </Text>
          </View>
          <View style={styles.switchBox}>
            <Switch
              value={isOnline}
              onValueChange={handleOnlineToggle}
              trackColor={{ false: SURFACE_DARK.surface3, true: BRAND_COLORS.electricGreen }}
              thumbColor={BRAND_COLORS.pureWhite}
              accessibilityLabel="Toggle rider online or offline"
            />
          </View>
        </View>

        {!isOnline ? (
          <View style={styles.emptyCard}>
            <Text style={styles.stateTitle}>You Are Currently Offline</Text>
            <Text style={styles.stateBody}>
              Switch your duty status to Online to start receiving delivery offers in Makrana.
            </Text>
          </View>
        ) : loadState === 'empty' || !assignment ? (
          <View style={styles.emptyCard}>
            <Text style={styles.stateTitle}>Waiting for Next Order</Text>
            <Text style={styles.stateBody}>
              Stay near Station Road or Market Chowk for fastest assignment matching.
            </Text>
            <TouchableOpacity style={styles.ctaSecondary56} onPress={handleRefresh} accessibilityRole="button">
              <Text style={styles.ctaSecondary56Text}>Refresh Radar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.taskCard}>
            {/* Offer / Active Header */}
            <View style={styles.taskHeader}>
              <View>
                <Text style={styles.taskEyebrow}>
                  {assignment.phase === 'offer' ? 'NEW DELIVERY OFFER' : 'ACTIVE DELIVERY'}
                </Text>
                <Text style={styles.orderCode}>#{assignment.orderCode}</Text>
              </View>
              {assignment.phase === 'offer' ? (
                <View style={styles.countdownBadge}>
                  <Text style={styles.countdownText}>{assignment.offerSecondsLeft}s</Text>
                </View>
              ) : (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>
                    {assignment.phase === 'pickup_en_route' ? 'GO TO STORE' : 'EN ROUTE DROP'}
                  </Text>
                </View>
              )}
            </View>

            {/* Payout & Distance */}
            <View style={styles.payoutRow}>
              <View style={styles.payoutCell}>
                <Text style={styles.cellLabel}>EST. PAYOUT</Text>
                <Text style={styles.payoutValue}>{formatPaiseToINR(assignment.payoutPaise)}</Text>
              </View>
              <View style={styles.payoutCell}>
                <Text style={styles.cellLabel}>DISTANCE</Text>
                <Text style={styles.metricValue}>{assignment.distanceKm.toFixed(1)} km</Text>
              </View>
              <View style={styles.payoutCell}>
                <Text style={styles.cellLabel}>ETA WINDOW</Text>
                <Text style={styles.metricValue}>
                  {assignment.etaMin}–{assignment.etaMax}m
                </Text>
              </View>
            </View>

            {/* Pickup & Drop Locations */}
            <View style={styles.routeBox}>
              <View style={styles.routeStop}>
                <Text style={styles.stopTag}>PICKUP</Text>
                <Text style={styles.stopTitle}>{assignment.storeName}</Text>
                <Text style={styles.stopAddress}>{assignment.storeAddress}</Text>
              </View>
              <View style={styles.routeDivider} />
              <View style={styles.routeStop}>
                <Text style={styles.stopTag}>DROP</Text>
                <Text style={styles.stopTitle}>{assignment.customerLocality}</Text>
                <Text style={styles.stopAddress}>
                  {assignment.paymentMode === 'COD'
                    ? `Collect COD: ${formatPaiseToINR(assignment.codAmountPaise)}`
                    : 'Prepaid via UPI (Do Not Collect Cash)'}
                </Text>
              </View>
            </View>

            {/* 56dp High-Contrast Rider CTAs */}
            {assignment.phase === 'offer' ? (
              <View style={styles.offerCtaRow}>
                <TouchableOpacity
                  style={styles.declineBtn56}
                  onPress={handleDecline}
                  accessibilityRole="button"
                >
                  <Text style={styles.declineBtn56Text}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.acceptBtn56}
                  onPress={handleAccept}
                  accessibilityRole="button"
                >
                  <Text style={styles.acceptBtn56Text}>Accept Offer</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.activeCtaStack}>
                <TouchableOpacity
                  style={styles.osmNavBtn56}
                  onPress={handleOpenOsmNavigation}
                  accessibilityRole="button"
                >
                  <Text style={styles.osmNavBtn56Text}>
                    Navigate via OSM / OSRM ({assignment.phase === 'pickup_en_route' ? 'To Store' : 'To Customer'})
                  </Text>
                </TouchableOpacity>

                {assignment.phase === 'pickup_en_route' ? (
                  <TouchableOpacity
                    style={styles.acceptBtn56}
                    onPress={handleConfirmPickup}
                    accessibilityRole="button"
                  >
                    <Text style={styles.acceptBtn56Text}>Confirm Store Pickup</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.ctaPrimary56}
                    onPress={() => onProceedToOtp?.(assignment)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.ctaPrimary56Text}>Arrived · Enter Handover OTP</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: SURFACE_DARK.background },
  container: { padding: SPACING.screenPadding, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  dutyBar: {
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.lg,
    padding: SPACING.cardPadding,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dutyTextCol: { flex: 1, gap: SPACING.xxs },
  dutyLabel: { ...TYPOGRAPHY.captionMin, color: SURFACE_DARK.textMuted },
  dutyStateText: { ...TYPOGRAPHY.titleMd },
  switchBox: {
    minWidth: TOUCH_TARGETS.recommendedSize,
    minHeight: TOUCH_TARGETS.recommendedSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    alignItems: 'center',
    gap: SPACING.md,
  },
  taskCard: {
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: BRAND_COLORS.goldenYellow,
    gap: SPACING.md,
  },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskEyebrow: { ...TYPOGRAPHY.captionMin, color: BRAND_COLORS.goldenYellow },
  orderCode: {
    ...TYPOGRAPHY.headlineMd,
    color: SURFACE_DARK.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  countdownBadge: {
    minWidth: TOUCH_TARGETS.recommendedSize,
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    backgroundColor: STATUS_COLORS.warningBgDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  countdownText: {
    ...TYPOGRAPHY.titleMd,
    color: STATUS_COLORS.warningBright,
    fontVariant: ['tabular-nums'],
  },
  activeBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.sm,
    backgroundColor: STATUS_COLORS.successBgDark,
  },
  activeBadgeText: { ...TYPOGRAPHY.captionMin, color: BRAND_COLORS.electricGreenLight },
  payoutRow: {
    flexDirection: 'row',
    backgroundColor: SURFACE_DARK.surface2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  payoutCell: { flex: 1, gap: SPACING.xxs },
  cellLabel: { ...TYPOGRAPHY.captionMin, color: SURFACE_DARK.textMuted },
  payoutValue: {
    ...TYPOGRAPHY.titleMd,
    color: BRAND_COLORS.goldenYellow,
    fontVariant: ['tabular-nums'],
  },
  metricValue: {
    ...TYPOGRAPHY.titleMd,
    color: SURFACE_DARK.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  routeBox: {
    backgroundColor: SURFACE_DARK.surface2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  routeStop: { gap: SPACING.xxs },
  stopTag: { ...TYPOGRAPHY.captionMin, color: BRAND_COLORS.goldenYellow },
  stopTitle: { ...TYPOGRAPHY.titleMd, color: SURFACE_DARK.textPrimary },
  stopAddress: { ...TYPOGRAPHY.bodySm, color: SURFACE_DARK.textSecondary },
  routeDivider: { height: 1, backgroundColor: SURFACE_DARK.border },
  offerCtaRow: { flexDirection: 'row', gap: SPACING.md },
  declineBtn56: {
    flex: 1,
    minHeight: TOUCH_TARGETS.riderActionHeight,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface2,
    borderWidth: 1,
    borderColor: STATUS_COLORS.errorBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtn56Text: { ...TYPOGRAPHY.labelLg, color: STATUS_COLORS.errorBright },
  acceptBtn56: {
    flex: 2,
    minHeight: TOUCH_TARGETS.riderActionHeight,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.electricGreen,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  acceptBtn56Text: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.onSuccess },
  activeCtaStack: { gap: SPACING.md },
  osmNavBtn56: {
    minHeight: TOUCH_TARGETS.riderActionHeight,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface2,
    borderWidth: 1,
    borderColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  osmNavBtn56Text: { ...TYPOGRAPHY.labelLg, color: BRAND_COLORS.goldenYellow },
  ctaPrimary56: {
    minHeight: TOUCH_TARGETS.riderActionHeight,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  ctaPrimary56Text: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.onPrimary },
  ctaSecondary56: {
    minHeight: TOUCH_TARGETS.riderActionHeight,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface2,
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  ctaSecondary56Text: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.textPrimary },
  stateContainer: {
    flex: 1,
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  stateTitle: { ...TYPOGRAPHY.headlineMd, color: SURFACE_DARK.textPrimary, textAlign: 'center' },
  stateBody: { ...TYPOGRAPHY.bodyMd, color: SURFACE_DARK.textSecondary, textAlign: 'center' },
  skeletonWrap: { padding: SPACING.screenPadding, gap: SPACING.md },
  skeletonBar: { height: 72, borderRadius: RADII.lg, backgroundColor: SURFACE_DARK.surface2 },
  skeletonCard: { height: 280, borderRadius: RADII.lg, backgroundColor: SURFACE_DARK.surface2 },
  sosFab: {
    position: 'absolute',
    bottom: 96,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    elevation: 6,
    shadowColor: '#DC2626',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  sosFabText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
});

export default RiderTasksScreen;
