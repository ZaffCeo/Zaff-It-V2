import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  STATUS_COLORS,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import type { OrderStatus, TicketCategory } from '@zaff-it/shared/types';
import { formatPaise, useAppStore } from '@/store/useAppStore';
import {
  isSupabaseConfigured,
  supabase,
  SUPABASE_FUNCTIONS_URL,
} from '@/services/supabase';
import {
  EmptyState,
  ErrorRetryBanner,
  LoadingSkeleton,
  PrimaryButton,
} from '@/components/StateViews';

interface OrderItemSummary {
  id: string;
  product_name_snapshot: string;
  unit_label_snapshot: string;
  qty: number;
  unit_price_paise: number;
  line_total_paise: number;
}

interface OrderRecord {
  id: string;
  order_number: string;
  store_name: string;
  status: OrderStatus;
  payment_method: 'razorpay' | 'cod';
  subtotal_paise: number;
  delivery_fee_paise: number;
  discount_paise: number;
  tax_paise: number;
  total_paise: number;
  created_at: string;
  items: OrderItemSummary[];
}

const FALLBACK_ORDERS: OrderRecord[] = [
  {
    id: 'ord_makrana_1001',
    order_number: 'ZAF-MK-1001',
    store_name: 'Marwar Kirana & General Store',
    status: 'delivered',
    payment_method: 'razorpay',
    subtotal_paise: 48400,
    delivery_fee_paise: 0,
    discount_paise: 2500,
    tax_paise: 0,
    total_paise: 45900,
    created_at: '2026-11-25T10:15:00Z',
    items: [
      {
        id: 'oi_1',
        product_name_snapshot: 'India Gate Basmati Rice',
        unit_label_snapshot: '5 kg',
        qty: 1,
        unit_price_paise: 45900,
        line_total_paise: 45900,
      },
      {
        id: 'oi_2',
        product_name_snapshot: 'Fresh Hybrid Tomatoes',
        unit_label_snapshot: '500 g',
        qty: 1,
        unit_price_paise: 2500,
        line_total_paise: 2500,
      },
    ],
  },
  {
    id: 'ord_makrana_1002',
    order_number: 'ZAF-MK-1002',
    store_name: 'Makrana Dairy & Fresh',
    status: 'placed',
    payment_method: 'cod',
    subtotal_paise: 14500,
    delivery_fee_paise: 1500,
    discount_paise: 0,
    tax_paise: 0,
    total_paise: 16000,
    created_at: '2026-11-26T09:30:00Z',
    items: [
      {
        id: 'oi_3',
        product_name_snapshot: 'Saras Gold Full Cream Milk',
        unit_label_snapshot: '1 L',
        qty: 2,
        unit_price_paise: 6600,
        line_total_paise: 13200,
      },
    ],
  },
];

const TICKET_CATEGORIES: Array<{ id: TicketCategory; label: string }> = [
  { id: 'order_issue', label: 'Order Issue' },
  { id: 'missing_item', label: 'Missing Item' },
  { id: 'payment_refund', label: 'Payment / Refund' },
  { id: 'delivery_delay', label: 'Delivery Delay' },
  { id: 'other', label: 'Other' },
];

function getStatusPillStyle(status: OrderStatus): {
  label: string;
  bg: string;
  fg: string;
} {
  switch (status) {
    case 'delivered':
      return {
        label: 'DELIVERED',
        bg: STATUS_COLORS.successBgLight,
        fg: STATUS_COLORS.successTextLight,
      };
    case 'cancelled':
      return {
        label: 'CANCELLED',
        bg: STATUS_COLORS.errorBgLight,
        fg: STATUS_COLORS.errorTextLight,
      };
    case 'refund_pending':
    case 'refunded':
      return {
        label: status === 'refunded' ? 'REFUNDED' : 'REFUND PENDING',
        bg: STATUS_COLORS.infoBgLight,
        fg: STATUS_COLORS.infoTextLight,
      };
    case 'out_for_delivery':
    case 'picked_up':
      return {
        label: 'ON THE WAY',
        bg: STATUS_COLORS.successBgLight,
        fg: STATUS_COLORS.successTextLight,
      };
    default:
      return {
        label: status.replace(/_/g, ' ').toUpperCase(),
        bg: STATUS_COLORS.warningBgLight,
        fg: STATUS_COLORS.warningTextLight,
      };
  }
}

function canCancelOrder(status: OrderStatus): boolean {
  return (
    status === 'created' ||
    status === 'payment_pending' ||
    status === 'placed' ||
    status === 'accepted' ||
    status === 'preparing'
  );
}

function canRequestRefund(status: OrderStatus): boolean {
  return status === 'delivered' || status === 'cancelled';
}

export const OrdersAndSupportScreen: React.FC = () => {
  const navigation = useNavigation();
  const colorScheme = useAppStore((s) => s.colorScheme);
  const userId = useAppStore((s) => s.userId);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Invoice Modal
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  // Support Ticket Modal
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [ticketOrderId, setTicketOrderId] = useState<string | null>(null);
  const [ticketCategory, setTicketCategory] =
    useState<TicketCategory>('order_issue');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [submittingTicket, setSubmittingTicket] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    if (!isSupabaseConfigured() || userId === null) {
      setOrders(FALLBACK_ORDERS);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          id,
          order_number,
          status,
          payment_method,
          subtotal_paise,
          delivery_fee_paise,
          discount_paise,
          tax_paise,
          total_paise,
          created_at,
          stores:store_id ( name ),
          order_items (
            id,
            product_name_snapshot,
            unit_label_snapshot,
            qty,
            unit_price_paise,
            line_total_paise
          )
        `,
        )
        .eq('customer_id', userId)
        .order('created_at', { ascending: false })
        .limit(25);

      if (error) {
        setErrorMsg(error.message);
        setOrders(FALLBACK_ORDERS);
      } else if (data && data.length > 0) {
        const mapped: OrderRecord[] = data.map((row) => {
          const storeObj = row.stores as unknown as { name?: string } | null;
          return {
            id: String(row.id),
            order_number: String(row.order_number),
            store_name: storeObj?.name ?? 'Makrana Store',
            status: row.status as OrderStatus,
            payment_method: row.payment_method as 'razorpay' | 'cod',
            subtotal_paise: Math.trunc(row.subtotal_paise ?? 0),
            delivery_fee_paise: Math.trunc(row.delivery_fee_paise ?? 0),
            discount_paise: Math.trunc(row.discount_paise ?? 0),
            tax_paise: Math.trunc(row.tax_paise ?? 0),
            total_paise: Math.trunc(row.total_paise ?? 0),
            created_at: String(row.created_at),
            items: Array.isArray(row.order_items)
              ? (row.order_items as OrderItemSummary[])
              : [],
          };
        });
        setOrders(mapped);
      } else {
        setOrders([]);
      }
    } catch {
      setErrorMsg('Unable to fetch orders. Showing recent Makrana sample orders.');
      setOrders(FALLBACK_ORDERS);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const triggerOrderLifecycle = async (
    order: OrderRecord,
    action: 'cancel' | 'request_refund',
  ) => {
    setLifecycleBusy(true);
    setErrorMsg(null);
    setStatusNotice(null);

    const nextStatus: OrderStatus =
      action === 'cancel' ? 'cancelled' : 'refund_pending';

    if (!isSupabaseConfigured()) {
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)),
      );
      setSelectedOrder((prev) =>
        prev !== null && prev.id === order.id ? { ...prev, status: nextStatus } : prev,
      );
      setStatusNotice(
        action === 'cancel'
          ? `Order ${order.order_number} cancelled.`
          : `Refund requested for ${order.order_number}.`,
      );
      setLifecycleBusy(false);
      return;
    }

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
          order_id: order.id,
          action,
          reason:
            action === 'cancel'
              ? 'Customer requested cancellation'
              : 'Customer requested refund',
        }),
      });
      const json = (await res.json()) as {
        status?: OrderStatus;
        error?: { message?: string };
      };
      if (!res.ok) {
        setErrorMsg(json.error?.message ?? 'Could not update order status.');
        return;
      }

      const resolvedStatus = json.status ?? nextStatus;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id ? { ...o, status: resolvedStatus } : o,
        ),
      );
      setSelectedOrder((prev) =>
        prev !== null && prev.id === order.id
          ? { ...prev, status: resolvedStatus }
          : prev,
      );
      setStatusNotice(
        action === 'cancel'
          ? `Order ${order.order_number} cancelled.`
          : `Refund initiated for ${order.order_number}.`,
      );
    } catch {
      setErrorMsg('Network error calling order-lifecycle.');
    } finally {
      setLifecycleBusy(false);
    }
  };

  const openSupportForOrder = (orderId: string | null) => {
    setTicketOrderId(orderId);
    setSupportModalOpen(true);
  };

  const handleCreateSupportTicket = async () => {
    if (ticketSubject.trim().length < 4 || ticketDescription.trim().length < 8) {
      setErrorMsg('Please enter a subject and brief description for your ticket.');
      return;
    }
    setSubmittingTicket(true);
    setErrorMsg(null);

    try {
      if (isSupabaseConfigured() && userId !== null) {
        const { error } = await supabase.from('support_tickets').insert({
          user_id: userId,
          order_id: ticketOrderId,
          category: ticketCategory,
          subject: ticketSubject.trim(),
          description: ticketDescription.trim(),
          priority: 'normal',
        });
        if (error) {
          setErrorMsg(error.message);
          setSubmittingTicket(false);
          return;
        }
      }

      setStatusNotice('Support ticket submitted. Our Makrana desk will respond shortly.');
      setSupportModalOpen(false);
      setTicketSubject('');
      setTicketDescription('');
      setTicketOrderId(null);
    } catch {
      setErrorMsg('Failed to submit support ticket.');
    } finally {
      setSubmittingTicket(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: surface.background }]}
      edges={['top', 'left', 'right']}
    >
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <View style={styles.headerRow}>
          {navigation.canGoBack() ? (
            <Pressable
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={[styles.iconBtn, { borderColor: surface.border }]}
            >
              <Ionicons name="arrow-back" size={20} color={surface.textPrimary} />
            </Pressable>
          ) : null}
          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>
              Orders & Support
            </Text>
            <Text style={[styles.headerSub, { color: surface.textMuted }]}>
              Invoices, cancellations & help desk
            </Text>
          </View>
          <Pressable
            onPress={() => openSupportForOrder(null)}
            accessibilityRole="button"
            accessibilityLabel="Create support ticket"
            style={styles.supportTopBtn}
          >
            <Ionicons name="help-buoy-outline" size={18} color={BRAND_COLORS.charcoalBlack} />
            <Text style={styles.supportTopText}>Help</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {statusNotice !== null ? (
          <View
            style={[
              styles.noticeBanner,
              { backgroundColor: STATUS_COLORS.successBgLight },
            ]}
          >
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={STATUS_COLORS.successTextLight}
            />
            <Text
              style={[styles.noticeText, { color: STATUS_COLORS.successTextLight }]}
            >
              {statusNotice}
            </Text>
          </View>
        ) : null}

        {errorMsg !== null ? (
          <ErrorRetryBanner
            message={errorMsg}
            retryLabel="Retry"
            onRetry={loadOrders}
            mode={colorScheme}
          />
        ) : null}

        {loading ? (
          <LoadingSkeleton rows={3} mode={colorScheme} />
        ) : orders.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No orders yet"
            subtitle="Your Makrana quick-commerce orders and receipts will appear here."
            ctaLabel="Raise a Support Ticket"
            onCtaPress={() => openSupportForOrder(null)}
            mode={colorScheme}
          />
        ) : (
          orders.map((order) => {
            const pill = getStatusPillStyle(order.status);
            return (
              <View
                key={order.id}
                style={[
                  styles.card,
                  { backgroundColor: surface.surface1, borderColor: surface.border },
                ]}
              >
                <View style={styles.orderTopRow}>
                  <View style={styles.orderTitleWrap}>
                    <Text style={[styles.orderNum, { color: surface.textPrimary }]}>
                      {order.order_number}
                    </Text>
                    <Text style={[styles.storeName, { color: surface.textMuted }]}>
                      {order.store_name}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
                    <Text style={[styles.statusPillText, { color: pill.fg }]}>
                      {pill.label}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.orderMeta, { color: surface.textSecondary }]}>
                  {order.items.length} item(s) •{' '}
                  {order.payment_method === 'cod' ? 'Cash on Delivery' : 'Razorpay UPI/Card'} •{' '}
                  {formatPaise(order.total_paise)}
                </Text>

                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => setSelectedOrder(order)}
                    accessibilityRole="button"
                    accessibilityLabel={`View invoice for ${order.order_number}`}
                    style={[
                      styles.secondaryBtn,
                      {
                        backgroundColor: surface.surface2,
                        borderColor: surface.borderStrong,
                      },
                    ]}
                  >
                    <Ionicons
                      name="document-text-outline"
                      size={16}
                      color={surface.textPrimary}
                    />
                    <Text style={[styles.secondaryBtnText, { color: surface.textPrimary }]}>
                      Invoice
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => openSupportForOrder(order.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Get help for ${order.order_number}`}
                    style={[
                      styles.secondaryBtn,
                      {
                        backgroundColor: surface.surface2,
                        borderColor: surface.borderStrong,
                      },
                    ]}
                  >
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={16}
                      color={surface.textPrimary}
                    />
                    <Text style={[styles.secondaryBtnText, { color: surface.textPrimary }]}>
                      Support
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Itemized Invoice / Receipt Modal */}
      <Modal
        visible={selectedOrder !== null}
        animationType="slide"
        onRequestClose={() => setSelectedOrder(null)}
      >
        <SafeAreaView
          style={[styles.safe, { backgroundColor: surface.background }]}
          edges={['top', 'bottom', 'left', 'right']}
        >
          <View style={[styles.header, { borderBottomColor: surface.border }]}>
            <View style={styles.headerRow}>
              <Text style={[styles.headerTitle, { color: surface.textPrimary, flex: 1 }]}>
                Order Receipt
              </Text>
              <Pressable
                onPress={() => setSelectedOrder(null)}
                accessibilityRole="button"
                accessibilityLabel="Close invoice modal"
                style={[styles.iconBtn, { borderColor: surface.border }]}
              >
                <Ionicons name="close" size={22} color={surface.textPrimary} />
              </Pressable>
            </View>
          </View>

          {selectedOrder !== null ? (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <View
                style={[
                  styles.card,
                  { backgroundColor: surface.surface1, borderColor: surface.border },
                ]}
              >
                <Text style={[styles.orderNum, { color: surface.textPrimary }]}>
                  {selectedOrder.order_number}
                </Text>
                <Text style={[styles.storeName, { color: surface.textMuted }]}>
                  {selectedOrder.store_name}
                </Text>

                <View style={[styles.divider, { backgroundColor: surface.border }]} />

                {selectedOrder.items.map((item) => (
                  <View key={item.id} style={styles.invoiceRow}>
                    <Text style={[styles.invoiceItem, { color: surface.textPrimary }]}>
                      {item.qty} × {item.product_name_snapshot} ({item.unit_label_snapshot})
                    </Text>
                    <Text style={[styles.invoiceVal, { color: surface.textPrimary }]}>
                      {formatPaise(item.line_total_paise)}
                    </Text>
                  </View>
                ))}

                <View style={[styles.divider, { backgroundColor: surface.border }]} />

                <View style={styles.invoiceRow}>
                  <Text style={[styles.invoiceLabel, { color: surface.textSecondary }]}>
                    Subtotal
                  </Text>
                  <Text style={[styles.invoiceVal, { color: surface.textPrimary }]}>
                    {formatPaise(selectedOrder.subtotal_paise)}
                  </Text>
                </View>
                <View style={styles.invoiceRow}>
                  <Text style={[styles.invoiceLabel, { color: surface.textSecondary }]}>
                    Delivery Fee
                  </Text>
                  <Text style={[styles.invoiceVal, { color: surface.textPrimary }]}>
                    {selectedOrder.delivery_fee_paise === 0
                      ? 'FREE'
                      : formatPaise(selectedOrder.delivery_fee_paise)}
                  </Text>
                </View>
                {selectedOrder.discount_paise > 0 ? (
                  <View style={styles.invoiceRow}>
                    <Text style={[styles.invoiceLabel, { color: BRAND_COLORS.electricGreen }]}>
                      Promo Discount
                    </Text>
                    <Text style={[styles.invoiceVal, { color: BRAND_COLORS.electricGreen }]}>
                      -{formatPaise(selectedOrder.discount_paise)}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.invoiceRow}>
                  <Text style={[styles.grandLabel, { color: surface.textPrimary }]}>
                    Grand Total
                  </Text>
                  <Text style={[styles.grandVal, { color: surface.textPrimary }]}>
                    {formatPaise(selectedOrder.total_paise)}
                  </Text>
                </View>
              </View>

              {canCancelOrder(selectedOrder.status) ? (
                <PrimaryButton
                  label="Cancel Order"
                  onPress={() => triggerOrderLifecycle(selectedOrder, 'cancel')}
                  loading={lifecycleBusy}
                  variant="danger"
                  icon="close-circle-outline"
                  mode={colorScheme}
                />
              ) : null}

              {canRequestRefund(selectedOrder.status) ? (
                <PrimaryButton
                  label="Request Refund"
                  onPress={() =>
                    triggerOrderLifecycle(selectedOrder, 'request_refund')
                  }
                  loading={lifecycleBusy}
                  variant="outline"
                  icon="refresh-circle-outline"
                  mode={colorScheme}
                />
              ) : null}
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* Support Ticket Creation Modal */}
      <Modal
        visible={supportModalOpen}
        animationType="slide"
        onRequestClose={() => setSupportModalOpen(false)}
      >
        <SafeAreaView
          style={[styles.safe, { backgroundColor: surface.background }]}
          edges={['top', 'bottom', 'left', 'right']}
        >
          <View style={[styles.header, { borderBottomColor: surface.border }]}>
            <View style={styles.headerRow}>
              <Text style={[styles.headerTitle, { color: surface.textPrimary, flex: 1 }]}>
                Create Support Ticket
              </Text>
              <Pressable
                onPress={() => setSupportModalOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close support ticket modal"
                style={[styles.iconBtn, { borderColor: surface.border }]}
              >
                <Ionicons name="close" size={22} color={surface.textPrimary} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View
              style={[
                styles.card,
                { backgroundColor: surface.surface1, borderColor: surface.border },
              ]}
            >
              <Text style={[styles.sectionLabel, { color: surface.textPrimary }]}>
                Issue Category
              </Text>
              <View style={styles.chipWrap}>
                {TICKET_CATEGORIES.map((cat) => {
                  const selected = ticketCategory === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => setTicketCategory(cat.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      style={[
                        styles.catChip,
                        {
                          backgroundColor: selected
                            ? BRAND_COLORS.goldenYellow
                            : surface.surface2,
                          borderColor: selected
                            ? BRAND_COLORS.goldenYellowPressed
                            : surface.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.catChipText,
                          {
                            color: selected
                              ? BRAND_COLORS.charcoalBlack
                              : surface.textPrimary,
                          },
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                value={ticketSubject}
                onChangeText={setTicketSubject}
                placeholder="Subject (e.g. Missing item in ZAF-MK-1001)"
                placeholderTextColor={surface.textMuted}
                style={[
                  styles.input,
                  {
                    backgroundColor: surface.surface2,
                    borderColor: surface.border,
                    color: surface.textPrimary,
                  },
                ]}
              />
              <TextInput
                value={ticketDescription}
                onChangeText={setTicketDescription}
                placeholder="Describe what happened so our Makrana team can help quickly..."
                placeholderTextColor={surface.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={[
                  styles.textArea,
                  {
                    backgroundColor: surface.surface2,
                    borderColor: surface.border,
                    color: surface.textPrimary,
                  },
                ]}
              />
            </View>

            <PrimaryButton
              label="Submit Support Ticket"
              onPress={handleCreateSupportTicket}
              loading={submittingTicket}
              variant="success"
              icon="send-outline"
              mode={colorScheme}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    marginTop: 2,
  },
  iconBtn: {
    minWidth: TOUCH_TARGETS.minSize,
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportTopBtn: {
    minWidth: TOUCH_TARGETS.minSize,
    minHeight: TOUCH_TARGETS.minSize,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.goldenYellow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  supportTopText: {
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '700',
    color: BRAND_COLORS.charcoalBlack,
  },
  scrollContent: {
    padding: SPACING.screenPadding,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  noticeBanner: {
    padding: SPACING.md,
    borderRadius: RADII.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  noticeText: {
    flex: 1,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '600',
  },
  card: {
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  orderTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  orderTitleWrap: {
    flex: 1,
  },
  orderNum: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '800',
  },
  storeName: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADII.full,
  },
  statusPillText: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '800',
  },
  orderMeta: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  secondaryBtnText: {
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: SPACING.xs,
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  invoiceItem: {
    flex: 1,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
  invoiceLabel: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
  invoiceVal: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '700',
  },
  grandLabel: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '800',
  },
  grandVal: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '800',
  },
  sectionLabel: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '700',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  catChip: {
    minHeight: TOUCH_TARGETS.chipMinHeight,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catChipText: {
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '700',
  },
  input: {
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
  textArea: {
    minHeight: 112,
    borderWidth: 1,
    borderRadius: RADII.md,
    padding: SPACING.md,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
});
