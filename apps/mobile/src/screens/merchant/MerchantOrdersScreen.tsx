import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BRAND_COLORS,
  ORDER_STATUS_TOKENS,
  RADII,
  SPACING,
  STATUS_COLORS,
  SURFACE_DARK,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';

export type OrdersLoadState = 'ready' | 'loading' | 'empty' | 'error';
export type MerchantOrderStatus =
  | 'pending'
  | 'accepted'
  | 'packing'
  | 'ready_for_pickup'
  | 'cancelled';

export interface MerchantOrderItemLine {
  name: string;
  qty: number;
  unitLabel: string;
}

export interface MerchantOrderRecord {
  id: string;
  orderCode: string;
  status: MerchantOrderStatus;
  customerLocality: string;
  paymentMode: 'UPI' | 'COD';
  totalPaise: number;
  prepMinutesRemaining: number;
  items: MerchantOrderItemLine[];
  rejectReason?: string;
}

export interface MerchantOrdersScreenProps {
  initialState?: OrdersLoadState;
  initialOrders?: MerchantOrderRecord[];
  onAcceptOrder?: (orderId: string) => Promise<void> | void;
  onRejectOrder?: (orderId: string, reason: string) => Promise<void> | void;
  onTransitionOrder?: (
    orderId: string,
    nextStatus: 'packing' | 'ready_for_pickup'
  ) => Promise<void> | void;
  onRefresh?: () => Promise<MerchantOrderRecord[] | void> | void;
}

const REJECT_REASONS = [
  'Item Out of Stock',
  'Store Closing Soon',
  'High Rush / Cannot Meet Prep SLA',
  'Customer Unreachable / Address Issue',
];

const DEFAULT_ORDERS: MerchantOrderRecord[] = [
  {
    id: 'ord_1042',
    orderCode: 'MKR-1042',
    status: 'pending',
    customerLocality: 'Jain Nagar, Makrana',
    paymentMode: 'UPI',
    totalPaise: 34200,
    prepMinutesRemaining: 10,
    items: [
      { name: 'Amul Taaza Toned Milk', qty: 2, unitLabel: '500 ml' },
      { name: 'Aashirvaad Chakki Atta', qty: 1, unitLabel: '5 kg' },
    ],
  },
  {
    id: 'ord_1041',
    orderCode: 'MKR-1041',
    status: 'accepted',
    customerLocality: 'Byepass Road, Makrana',
    paymentMode: 'COD',
    totalPaise: 18500,
    prepMinutesRemaining: 7,
    items: [{ name: 'Fortune Refined Oil', qty: 1, unitLabel: '1 L' }],
  },
  {
    id: 'ord_1039',
    orderCode: 'MKR-1039',
    status: 'packing',
    customerLocality: 'Charbhuja Colony, Makrana',
    paymentMode: 'UPI',
    totalPaise: 9800,
    prepMinutesRemaining: 3,
    items: [{ name: 'Classic Rozana Basmati Rice', qty: 1, unitLabel: '1 kg' }],
  },
];

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

export const MerchantOrdersScreen: React.FC<MerchantOrdersScreenProps> = ({
  initialState = 'ready',
  initialOrders = DEFAULT_ORDERS,
  onAcceptOrder,
  onRejectOrder,
  onTransitionOrder,
  onRefresh,
}) => {
  const [loadState, setLoadState] = useState<OrdersLoadState>(initialState);
  const [orders, setOrders] = useState<MerchantOrderRecord[]>(initialOrders);
  const [activeTab, setActiveTab] = useState<'active' | 'ready'>('active');
  const [refreshing, setRefreshing] = useState(false);

  // Reject modal state
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>(REJECT_REASONS[0]);
  const [customReason, setCustomReason] = useState('');

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (onRefresh) {
        const updated = await onRefresh();
        if (updated) setOrders(updated);
      }
      setLoadState('ready');
    } catch {
      setLoadState('error');
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const handleAccept = useCallback(
    (orderId: string) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: 'accepted' } : o))
      );
      if (onAcceptOrder) void onAcceptOrder(orderId);
    },
    [onAcceptOrder]
  );

  const handleTransition = useCallback(
    (orderId: string, nextStatus: 'packing' | 'ready_for_pickup') => {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
      );
      if (onTransitionOrder) void onTransitionOrder(orderId, nextStatus);
    },
    [onTransitionOrder]
  );

  const confirmReject = useCallback(() => {
    if (!rejectTargetId) return;
    const finalReason = customReason.trim() || selectedReason;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === rejectTargetId ? { ...o, status: 'cancelled', rejectReason: finalReason } : o
      )
    );
    if (onRejectOrder) void onRejectOrder(rejectTargetId, finalReason);
    setRejectTargetId(null);
    setCustomReason('');
  }, [customReason, onRejectOrder, rejectTargetId, selectedReason]);

  const visibleOrders = useMemo(() => {
    if (activeTab === 'ready') {
      return orders.filter((o) => o.status === 'ready_for_pickup' || o.status === 'cancelled');
    }
    return orders.filter(
      (o) => o.status === 'pending' || o.status === 'accepted' || o.status === 'packing'
    );
  }, [activeTab, orders]);

  if (loadState === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.skeletonWrap}>
          <View style={styles.skeletonCard} />
          <View style={styles.skeletonCard} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'error') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.stateContainer}>
          <Text style={styles.stateTitle}>Orders Feed Disconnected</Text>
          <Text style={styles.stateBody}>
            Could not fetch incoming orders. Retry to avoid missing prep SLAs.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleRefresh} accessibilityRole="button">
            <Text style={styles.primaryBtnText}>Retry Connection</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.topHeader}>
        <Text style={styles.screenTitle}>Live Orders & Prep</Text>
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'active' && styles.tabBtnActive]}
            onPress={() => setActiveTab('active')}
            accessibilityRole="button"
          >
            <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
              Incoming & Packing
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'ready' && styles.tabBtnActive]}
            onPress={() => setActiveTab('ready')}
            accessibilityRole="button"
          >
            <Text style={[styles.tabText, activeTab === 'ready' && styles.tabTextActive]}>
              Ready / Closed
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loadState === 'empty' || visibleOrders.length === 0 ? (
        <View style={styles.stateContainer}>
          <Text style={styles.stateTitle}>No Orders in This Queue</Text>
          <Text style={styles.stateBody}>
            New customer orders from Makrana will appear here with an alert.
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleOrders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={BRAND_COLORS.goldenYellow}
            />
          }
          renderItem={({ item }) => {
            const statusToken =
              item.status === 'ready_for_pickup'
                ? ORDER_STATUS_TOKENS.dispatched
                : ORDER_STATUS_TOKENS[item.status];

            return (
              <View style={styles.orderCard}>
                <View style={styles.orderHeaderRow}>
                  <View>
                    <Text style={styles.orderCode}>#{item.orderCode}</Text>
                    <Text style={styles.orderLocality}>{item.customerLocality}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusToken.bgDark }]}>
                    <Text style={[styles.statusBadgeText, { color: statusToken.color }]}>
                      {item.status.replace(/_/g, ' ').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.itemsBox}>
                  {item.items.map((line, idx) => (
                    <Text key={`${item.id}-${idx}`} style={styles.itemLine}>
                      {line.qty}× {line.name} ({line.unitLabel})
                    </Text>
                  ))}
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.totalText}>{formatPaiseToINR(item.totalPaise)}</Text>
                  <Text style={styles.paymentPill}>{item.paymentMode}</Text>
                  {item.status !== 'cancelled' && item.status !== 'ready_for_pickup' && (
                    <Text style={styles.slaText}>SLA {item.prepMinutesRemaining}m left</Text>
                  )}
                </View>

                {item.rejectReason ? (
                  <Text style={styles.rejectNote}>Rejected: {item.rejectReason}</Text>
                ) : null}

                {/* State Transition CTAs (>=44dp / 52dp) */}
                {item.status === 'pending' && (
                  <View style={styles.ctaRow}>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => setRejectTargetId(item.id)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.rejectBtnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => handleAccept(item.id)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.acceptBtnText}>Accept Order</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {item.status === 'accepted' && (
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => handleTransition(item.id, 'packing')}
                    accessibilityRole="button"
                  >
                    <Text style={styles.primaryBtnText}>Start Packing</Text>
                  </TouchableOpacity>
                )}

                {item.status === 'packing' && (
                  <TouchableOpacity
                    style={styles.readyBtn}
                    onPress={() => handleTransition(item.id, 'ready_for_pickup')}
                    accessibilityRole="button"
                  >
                    <Text style={styles.readyBtnText}>Mark Ready for Rider Pickup</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Reject Reason Modal */}
      <Modal
        visible={Boolean(rejectTargetId)}
        transparent
        animationType="slide"
        onRequestClose={() => setRejectTargetId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Rejection Reason</Text>
            <View style={styles.reasonList}>
              {REJECT_REASONS.map((reason) => {
                const selected = selectedReason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.reasonBtn, selected && styles.reasonBtnActive]}
                    onPress={() => setSelectedReason(reason)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.reasonText, selected && styles.reasonTextActive]}>
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={styles.customInput}
              value={customReason}
              onChangeText={setCustomReason}
              placeholder="Optional note for ops/customer..."
              placeholderTextColor={SURFACE_DARK.textMuted}
            />
            <View style={styles.ctaRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRejectTargetId(null)}
                accessibilityRole="button"
              >
                <Text style={styles.modalCancelText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmRejectBtn}
                onPress={confirmReject}
                accessibilityRole="button"
              >
                <Text style={styles.modalConfirmRejectText}>Confirm Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: SURFACE_DARK.background },
  topHeader: {
    padding: SPACING.screenPadding,
    gap: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: SURFACE_DARK.border,
  },
  screenTitle: { ...TYPOGRAPHY.headlineLg, color: SURFACE_DARK.textPrimary },
  tabRow: { flexDirection: 'row', gap: SPACING.sm },
  tabBtn: {
    flex: 1,
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: { backgroundColor: BRAND_COLORS.goldenYellow },
  tabText: { ...TYPOGRAPHY.labelMd, color: SURFACE_DARK.textSecondary },
  tabTextActive: { color: SURFACE_DARK.onPrimary },
  listContent: { padding: SPACING.screenPadding, gap: SPACING.md, paddingBottom: SPACING.xxl },
  orderCard: {
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.lg,
    padding: SPACING.cardPadding,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    gap: SPACING.md,
  },
  orderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderCode: {
    ...TYPOGRAPHY.titleMd,
    color: SURFACE_DARK.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  orderLocality: { ...TYPOGRAPHY.bodySm, color: SURFACE_DARK.textMuted },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.sm,
  },
  statusBadgeText: { ...TYPOGRAPHY.captionMin },
  itemsBox: {
    backgroundColor: SURFACE_DARK.surface2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  itemLine: { ...TYPOGRAPHY.bodyMd, color: SURFACE_DARK.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  totalText: {
    ...TYPOGRAPHY.titleMd,
    color: BRAND_COLORS.goldenYellow,
    fontVariant: ['tabular-nums'],
  },
  paymentPill: {
    ...TYPOGRAPHY.captionMin,
    color: SURFACE_DARK.textSecondary,
    backgroundColor: SURFACE_DARK.surface3,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.sm,
  },
  slaText: {
    ...TYPOGRAPHY.labelMd,
    color: STATUS_COLORS.warningBright,
    marginLeft: 'auto',
    fontVariant: ['tabular-nums'],
  },
  rejectNote: { ...TYPOGRAPHY.bodySm, color: STATUS_COLORS.errorBright },
  ctaRow: { flexDirection: 'row', gap: SPACING.md },
  rejectBtn: {
    flex: 1,
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: STATUS_COLORS.errorBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtnText: { ...TYPOGRAPHY.labelLg, color: STATUS_COLORS.errorBright },
  acceptBtn: {
    flex: 2,
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.electricGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.onSuccess },
  primaryBtn: {
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  primaryBtnText: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.onPrimary },
  readyBtn: {
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.electricGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyBtnText: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.onSuccess },
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
  skeletonCard: { height: 170, borderRadius: RADII.lg, backgroundColor: SURFACE_DARK.surface2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: SURFACE_DARK.surface3,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  modalTitle: { ...TYPOGRAPHY.headlineMd, color: SURFACE_DARK.textPrimary },
  reasonList: { gap: SPACING.sm },
  reasonBtn: {
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    justifyContent: 'center',
    backgroundColor: SURFACE_DARK.surface2,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
  },
  reasonBtnActive: {
    borderColor: BRAND_COLORS.goldenYellow,
    backgroundColor: BRAND_COLORS.goldenYellowGlow,
  },
  reasonText: { ...TYPOGRAPHY.bodyMd, color: SURFACE_DARK.textSecondary },
  reasonTextActive: { ...TYPOGRAPHY.labelLg, color: BRAND_COLORS.goldenYellow },
  customInput: {
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface1,
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
    paddingHorizontal: SPACING.md,
    color: SURFACE_DARK.textPrimary,
    ...TYPOGRAPHY.bodyMd,
  },
  modalCancelBtn: {
    flex: 1,
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.textPrimary },
  modalConfirmRejectBtn: {
    flex: 2,
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.md,
    backgroundColor: STATUS_COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmRejectText: { ...TYPOGRAPHY.labelLg, color: BRAND_COLORS.pureWhite },
});

export default MerchantOrdersScreen;
