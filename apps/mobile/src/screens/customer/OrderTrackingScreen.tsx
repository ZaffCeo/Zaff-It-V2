import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';
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
import { SUPABASE_FUNCTIONS_URL } from '@/services/supabase';
import {
  EmptyState,
  ErrorRetryBanner,
  LoadingSkeleton,
} from '@/components/StateViews';
import { PulsingDot } from '@/components/ui/PremiumKit';
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
    useNavigation<
      BottomTabNavigationProp<CustomerTabParamList> & NativeStackNavigationProp<CustomerStackParamList>
    >();
  const language = useAppStore((s) => s.language);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const activeOrderId = useAppStore((s) => s.activeOrderId);
  const t = getTranslation(language);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [escalation, setEscalation] = useState<{
    required: boolean;
    choice: string | null;
    level: number;
  } | null>(null);
  const [escalationBusy, setEscalationBusy] = useState(false);
  const [escalationNotice, setEscalationNotice] = useState<string | null>(null);
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
      // AUD-LOW-7: orders table has no delivery_otp column (it lives in the
      // deny-all vault table). Use the customer-scoped security-definer RPC.
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_number, status, grand_total_paise, eta_min_minutes, eta_max_minutes',
        )
        .eq('id', activeOrderId)
        .single();

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      let deliveryOtp: string | null = null;
      try {
        const { data: otpData, error: otpError } = await supabase.rpc(
          'get_my_delivery_otp',
          { p_order_id: activeOrderId },
        );
        if (!otpError && typeof otpData === 'string') {
          deliveryOtp = otpData;
        }
      } catch {
        // OTP display is best-effort; tracking still works without it
      }

      if (data) {
        setOrder({
          id: String(data.id),
          order_number: String(data.order_number ?? activeOrderId),
          status: (data.status as OrderStatus) ?? 'pending',
          grand_total_paise: Math.trunc(Number(data.grand_total_paise ?? 0)),
          eta_min_minutes: Math.trunc(Number(data.eta_min_minutes ?? 20)),
          eta_max_minutes: Math.trunc(Number(data.eta_max_minutes ?? 30)),
          delivery_otp: deliveryOtp,
          rider_name: null,
        });
      }

      // W5 escalation ladder state (pg_cron sweeps delivery_tasks every minute)
      try {
        const { data: task } = await supabase
          .from('delivery_tasks')
          .select('escalation_level, customer_choice_required, customer_choice, status')
          .eq('order_id', activeOrderId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setEscalation(
          task && task.status === 'unassigned'
            ? {
                required: task.customer_choice_required === true,
                choice: (task.customer_choice as string | null) ?? null,
                level: Math.trunc(Number(task.escalation_level ?? 0)),
              }
            : null,
        );
      } catch {
        setEscalation(null);
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

  // 30s poll: escalation choice_required flips server-side via pg_cron sweep
  useEffect(() => {
    if (activeOrderId === null || !isSupabaseConfigured()) return;
    const id = setInterval(() => {
      fetchOrder();
    }, 30000);
    return () => clearInterval(id);
  }, [activeOrderId, fetchOrder]);

  // W5: customer escalation choice — wait / shift-SameDay via RPC, free-cancel
  // through the existing order-lifecycle cancel path (release stock + refund).
  const handleEscalationChoice = useCallback(
    async (choice: 'wait' | 'sameday') => {
      if (activeOrderId === null || escalationBusy) return;
      setEscalationBusy(true);
      setEscalationNotice(null);
      try {
        const { data, error } = await supabase.rpc('resolve_delivery_escalation', {
          p_order_id: activeOrderId,
          p_choice: choice,
        });
        if (error) {
          setEscalationNotice(error.message);
        } else {
          const note = (data as { note?: string } | null)?.note ?? null;
          setEscalationNotice(
            note ?? (choice === 'wait' ? 'Rider ka intezaar — 10 min aur' : 'SameDay shift request recorded'),
          );
        }
      } catch {
        setEscalationNotice(t.errorGeneric);
      } finally {
        setEscalationBusy(false);
        fetchOrder();
      }
    },
    [activeOrderId, escalationBusy, fetchOrder, t.errorGeneric],
  );

  const handleEscalationFreeCancel = useCallback(() => {
    if (activeOrderId === null || order === null || escalationBusy) return;
    Alert.alert(
      'Free cancel',
      'Rider assign nahi hua. Order cancel hoga — poora paisa wallet/refund mein wapas.',
      [
        { text: 'Nahi', style: 'cancel' },
        {
          text: 'Cancel karo',
          style: 'destructive',
          onPress: async () => {
            setEscalationBusy(true);
            setEscalationNotice(null);
            try {
              const { data: sessionData } = await supabase.auth.getSession();
              const token = sessionData.session?.access_token ?? '';
              const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/order-lifecycle`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  order_id: activeOrderId,
                  action: 'cancel',
                  reason: 'escalation_no_rider_free_cancel',
                }),
              });
              const json = (await res.json()) as { error?: { message?: string } };
              if (!res.ok) {
                setEscalationNotice(json.error?.message ?? 'Cancel failed');
              } else {
                setEscalationNotice('Order cancel ho gaya — paisa refund process mein.');
              }
            } catch {
              setEscalationNotice(t.errorGeneric);
            } finally {
              setEscalationBusy(false);
              fetchOrder();
            }
          },
        },
      ],
    );
  }, [activeOrderId, order, escalationBusy, fetchOrder, t.errorGeneric]);

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
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={surface.textPrimary} />
        </Pressable>
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
                <View style={styles.etaLabelRow}>
                  <PulsingDot />
                  <Text style={styles.etaBoxLabel}>{t.estimatedArrival}</Text>
                </View>
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
            {order.delivery_otp !== null ? (
              <Text style={[styles.otpHint, { color: surface.textMuted }]}>
                🔐 OTP sirf delivery ke time rider ko batao — pehle share na karo.
              </Text>
            ) : null}
          </View>

          {/* W5: Rider escalation ladder — customer choice when no rider accepts */}
          {order.status !== 'delivered' &&
          order.status !== 'cancelled' &&
          escalation !== null &&
          escalation.required ? (
            <View
              style={[
                styles.card,
                { backgroundColor: surface.surface1, borderColor: BRAND_COLORS.goldenYellow },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: BRAND_COLORS.goldenYellow, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="bicycle" size={18} color={BRAND_COLORS.charcoalBlack} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900', color: surface.textPrimary }}>
                    Rider nahi mil raha
                  </Text>
                  <Text style={{ fontSize: TYPOGRAPHY.bodySm.fontSize, color: surface.textMuted, marginTop: 1 }}>
                    Aap choose karo — hum wahi karenge
                  </Text>
                </View>
              </View>

              {escalationNotice !== null ? (
                <Text style={{ fontSize: TYPOGRAPHY.bodySm.fontSize, color: surface.textSecondary, marginTop: 10 }}>
                  {escalationNotice}
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Pressable
                  onPress={() => handleEscalationChoice('wait')}
                  disabled={escalationBusy}
                  style={{
                    flex: 1,
                    minWidth: 100,
                    paddingVertical: 10,
                    borderRadius: RADII.md,
                    backgroundColor: BRAND_COLORS.charcoalBlack,
                    alignItems: 'center',
                    opacity: escalationBusy ? 0.6 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Wait 10 more minutes for a rider"
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: TYPOGRAPHY.bodySm.fontSize }}>
                    10 min wait
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleEscalationChoice('sameday')}
                  disabled={escalationBusy}
                  style={{
                    flex: 1,
                    minWidth: 100,
                    paddingVertical: 10,
                    borderRadius: RADII.md,
                    backgroundColor: surface.surface2,
                    alignItems: 'center',
                    opacity: escalationBusy ? 0.6 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Request SameDay shift"
                >
                  <Text style={{ color: surface.textPrimary, fontWeight: '800', fontSize: TYPOGRAPHY.bodySm.fontSize }}>
                    SameDay shift
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleEscalationFreeCancel}
                  disabled={escalationBusy}
                  style={{
                    flex: 1,
                    minWidth: 100,
                    paddingVertical: 10,
                    borderRadius: RADII.md,
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: surface.border,
                    alignItems: 'center',
                    opacity: escalationBusy ? 0.6 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Free cancel order with full refund"
                >
                  <Text style={{ color: surface.textSecondary, fontWeight: '800', fontSize: TYPOGRAPHY.bodySm.fontSize }}>
                    Free cancel
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* W3: Rate & Tip (delivered orders, Stitch rating_rider_tip design) */}
          {order.status === 'delivered' ? (
            <Pressable
              onPress={() => navigation.navigate('RatingTip', { orderId: order.id })}
              style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}
              accessibilityRole="button"
              accessibilityLabel="Rate delivery and add tip"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: BRAND_COLORS.goldenYellow, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="star" size={18} color={BRAND_COLORS.charcoalBlack} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900', color: surface.textPrimary }}>
                    Rate Your Delivery Hero
                  </Text>
                  <Text style={{ fontSize: TYPOGRAPHY.bodySm.fontSize, color: surface.textMuted, marginTop: 1 }}>
                    Stars + tip do — +20 Z-Coins milenge
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={surface.textMuted} />
              </View>
            </Pressable>
          ) : null}

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
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
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
  etaLabelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  otpHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
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
