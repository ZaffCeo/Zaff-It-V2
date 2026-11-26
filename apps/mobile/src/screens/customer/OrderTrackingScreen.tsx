import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  BRAND_COLORS,
  ORDER_STATUS_TOKENS,
  RADII,
  SPACING,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { formatPaise, useAppStore, type OrderStatus } from '@/store/useAppStore';
import { getTranslation } from '@/i18n/translations';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import {
  EmptyState,
  ErrorRetryBanner,
  LoadingSkeleton,
} from '@/components/StateViews';
import type { CustomerTabParamList } from '@/navigation/RootNavigator';

interface TrackedOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  grand_total_paise: number;
  eta_min_minutes: number;
  eta_max_minutes: number;
  delivery_otp: string | null;
  rider_name: string | null;
}

const PIPELINE_STEPS: OrderStatus[] = [
  'pending',
  'accepted',
  'packing',
  'dispatched',
  'delivered',
];

export const OrderTrackingScreen: React.FC = () => {
  const navigation =
    useNavigation<BottomTabNavigationProp<CustomerTabParamList>>();
  const language = useAppStore((s) => s.language);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const activeOrderId = useAppStore((s) => s.activeOrderId);
  const t = getTranslation(language);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const statusLabels: Record<OrderStatus, string> = {
    pending: t.statusPending,
    accepted: t.statusAccepted,
    packing: t.statusPacking,
    dispatched: t.statusDispatched,
    delivered: t.statusDelivered,
    cancelled: t.statusCancelled,
  };

  const fetchOrder = useCallback(async () => {
    if (activeOrderId === null) {
      setOrder(null);
      return;
    }

    if (!isSupabaseConfigured()) {
      setOrder({
        id: activeOrderId,
        order_number: 'ZAF-MAKRANA-DEMO',
        status: 'packing',
        grand_total_paise: 27600,
        eta_min_minutes: 22,
        eta_max_minutes: 28,
        delivery_otp: '4821',
        rider_name: 'Salman R.',
      });
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_number, status, grand_total_paise, eta_min_minutes, eta_max_minutes, delivery_otp',
        )
        .eq('id', activeOrderId)
        .single();

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data) {
        setOrder({
          id: String(data.id),
          order_number: String(data.order_number ?? activeOrderId),
          status: (data.status as OrderStatus) ?? 'pending',
          grand_total_paise: Math.trunc(Number(data.grand_total_paise ?? 0)),
          eta_min_minutes: Math.trunc(Number(data.eta_min_minutes ?? 20)),
          eta_max_minutes: Math.trunc(Number(data.eta_max_minutes ?? 30)),
          delivery_otp: data.delivery_otp ? String(data.delivery_otp) : null,
          rider_name: null,
        });
      }
    } catch {
      setErrorMsg(t.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [activeOrderId, t.errorGeneric]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Live Supabase Realtime subscription for order status state machine
  useEffect(() => {
    if (activeOrderId === null || !isSupabaseConfigured()) {
      return;
    }

    const channel = supabase
      .channel(`order-tracking-${activeOrderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${activeOrderId}`,
        },
        (payload) => {
          const updated = payload.new as Partial<TrackedOrder>;
          setOrder((prev) =>
            prev
              ? {
                  ...prev,
                  status: (updated.status as OrderStatus) ?? prev.status,
                  eta_min_minutes:
                    updated.eta_min_minutes ?? prev.eta_min_minutes,
                  eta_max_minutes:
                    updated.eta_max_minutes ?? prev.eta_max_minutes,
                }
              : prev,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrderId]);

  const activeStepIndex =
    order !== null ? PIPELINE_STEPS.indexOf(order.status) : -1;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: surface.background }]}
      edges={['top', 'left', 'right']}
    >
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>
          {t.trackingTitle}
        </Text>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{t.liveStatusBadge}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.pad}>
          <LoadingSkeleton rows={3} mode={colorScheme} />
        </View>
      ) : errorMsg !== null ? (
        <View style={styles.pad}>
          <ErrorRetryBanner
            message={errorMsg}
            retryLabel={t.retryBtn}
            onRetry={fetchOrder}
            mode={colorScheme}
          />
        </View>
      ) : order === null ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="navigate-outline"
            title={t.trackingTitle}
            subtitle={t.emptyCartSubtitle}
            ctaLabel={t.browseStoresBtn}
            onCtaPress={() => navigation.navigate('HomeTab')}
            mode={colorScheme}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Summary Card */}
          <View
            style={[
              styles.card,
              { backgroundColor: surface.surface1, borderColor: surface.border },
            ]}
          >
            <View style={styles.summaryTopRow}>
              <View>
                <Text style={[styles.orderNumLabel, { color: surface.textMuted }]}>
                  {t.orderNumberLabel} #{order.order_number}
                </Text>
                <Text style={[styles.statusHeadline, { color: surface.textPrimary }]}>
                  {statusLabels[order.status]}
                </Text>
              </View>
              <View style={styles.etaBox}>
                <Text style={styles.etaBoxLabel}>{t.estimatedArrival}</Text>
                <Text style={styles.etaBoxValue}>
                  {order.eta_min_minutes}-{order.eta_max_minutes} {t.etaUnit}
                </Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text style={[styles.metaText, { color: surface.textSecondary }]}>
                {t.grandTotalLabel}: {formatPaise(order.grand_total_paise)}
              </Text>
              {order.delivery_otp !== null ? (
                <View style={styles.otpBadge}>
                  <Text style={styles.otpBadgeText}>
                    {t.deliveryOtpLabel}: {order.delivery_otp}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* State Machine Timeline */}
          <View
            style={[
              styles.card,
              { backgroundColor: surface.surface1, borderColor: surface.border },
            ]}
          >
            {PIPELINE_STEPS.map((stepStatus, idx) => {
              const isCompleted =
                order.status !== 'cancelled' && activeStepIndex >= idx;
              const isCurrent = order.status === stepStatus;
              const token = ORDER_STATUS_TOKENS[stepStatus];

              return (
                <View key={stepStatus} style={styles.stepRow}>
                  <View style={styles.stepIndicatorCol}>
                    <View
                      style={[
                        styles.stepCircle,
                        {
                          backgroundColor: isCompleted
                            ? token.color
                            : surface.surface3,
                        },
                      ]}
                    >
                      <Ionicons
                        name={isCompleted ? 'checkmark' : 'ellipse-outline'}
                        size={14}
                        color={
                          isCompleted
                            ? BRAND_COLORS.charcoalBlack
                            : surface.textMuted
                        }
                      />
                    </View>
                    {idx < PIPELINE_STEPS.length - 1 ? (
                      <View
                        style={[
                          styles.stepLine,
                          {
                            backgroundColor: isCompleted
                              ? BRAND_COLORS.electricGreen
                              : surface.border,
                          },
                        ]}
                      />
                    ) : null}
                  </View>
                  <View style={styles.stepTextCol}>
                    <Text
                      style={[
                        styles.stepTitle,
                        {
                          color: isCurrent
                            ? surface.textPrimary
                            : isCompleted
                              ? surface.textSecondary
                              : surface.textMuted,
                          fontWeight: isCurrent ? '800' : '600',
                        },
                      ]}
                    >
                      {statusLabels[stepStatus]}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '700',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND_COLORS.electricGreenSurface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.full,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: RADII.full,
    backgroundColor: BRAND_COLORS.electricGreen,
  },
  liveText: {
    color: BRAND_COLORS.electricGreen,
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '800',
  },
  pad: {
    padding: SPACING.screenPadding,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.screenPadding,
  },
  scrollContent: {
    padding: SPACING.screenPadding,
    gap: SPACING.md,
  },
  card: {
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    borderWidth: 1,
    gap: SPACING.md,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  orderNumLabel: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '600',
  },
  statusHeadline: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '700',
    marginTop: 4,
  },
  etaBox: {
    backgroundColor: BRAND_COLORS.charcoalBlack,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
    alignItems: 'flex-end',
  },
  etaBoxLabel: {
    color: BRAND_COLORS.goldenYellow,
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '700',
  },
  etaBoxValue: {
    color: BRAND_COLORS.pureWhite,
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '600',
  },
  otpBadge: {
    backgroundColor: BRAND_COLORS.goldenYellow,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.sm,
  },
  otpBadgeText: {
    color: BRAND_COLORS.charcoalBlack,
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '800',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  stepIndicatorCol: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: RADII.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {
    width: 2,
    height: 28,
    marginVertical: 2,
  },
  stepTextCol: {
    flex: 1,
    paddingTop: 2,
    paddingBottom: SPACING.md,
  },
  stepTitle: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
});
