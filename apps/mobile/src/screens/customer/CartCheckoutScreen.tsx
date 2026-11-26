import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
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
import {
  computeLocalCartTotalsPaise,
  formatPaise,
  useAppStore,
  type CartTotalsPaise,
} from '@/store/useAppStore';
import { getTranslation } from '@/i18n/translations';
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
import {
  FreeDeliveryProgressBar,
  SavingsChip,
} from '@/components/ui/PremiumKit';
import type { CustomerTabParamList } from '@/navigation/RootNavigator';

type PaymentMethod = 'razorpay' | 'cod';

function generateUuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function applyLocalPromoTotals(
  base: CartTotalsPaise,
  code: string | null,
): CartTotalsPaise {
  if (code === null || code.trim() === '' || base.subtotalPaise === 0) {
    return base;
  }
  const normalized = code.trim().toUpperCase();
  let discountPaise = 0;
  if (normalized === 'ZAFFMAKRANA' && base.subtotalPaise >= 19900) {
    discountPaise = 2500; // ₹25 flat off on Makrana pilot orders >= ₹199
  }
  const grandTotalPaise = Math.max(
    0,
    base.subtotalPaise + base.deliveryFeePaise + base.handlingFeePaise - discountPaise,
  );
  return {
    ...base,
    discountPaise,
    grandTotalPaise,
  };
}

export const CartCheckoutScreen: React.FC = () => {
  const navigation =
    useNavigation<BottomTabNavigationProp<CustomerTabParamList>>();
  const language = useAppStore((s) => s.language);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const zone = useAppStore((s) => s.zone);
  const selectedAddressId = useAppStore((s) => s.selectedAddressId);
  const selectedAddressLabel = useAppStore((s) => s.selectedAddressLabel);
  const cartStoreId = useAppStore((s) => s.cartStoreId);
  const cartStoreName = useAppStore((s) => s.cartStoreName);
  const cartItems = useAppStore((s) => s.cartItems);
  const promoCode = useAppStore((s) => s.promoCode);
  const setPromoCode = useAppStore((s) => s.setPromoCode);
  const setSelectedAddress = useAppStore((s) => s.setSelectedAddress);
  const updateItemQuantity = useAppStore((s) => s.updateItemQuantity);
  const clearCart = useAppStore((s) => s.clearCart);
  const setActiveOrderId = useAppStore((s) => s.setActiveOrderId);
  const t = getTranslation(language);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('razorpay');
  const [promoInput, setPromoInput] = useState(promoCode ?? '');
  const [promoFeedback, setPromoFeedback] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [serverTotals, setServerTotals] = useState<CartTotalsPaise | null>(null);

  // Stable Idempotency-Key per cart state to prevent duplicate orders on retry
  const cartSignature = useMemo(
    () =>
      cartItems
        .map((i) => `${i.productId}:${i.quantity}`)
        .sort()
        .join('|'),
    [cartItems],
  );
  const [idempotencyKey, setIdempotencyKey] = useState<string>(generateUuidV4);

  useEffect(() => {
    setIdempotencyKey(generateUuidV4());
  }, [cartSignature, paymentMethod, selectedAddressId, promoCode]);

  const localTotals = useMemo(() => {
    const base = computeLocalCartTotalsPaise(cartItems, zone);
    return applyLocalPromoTotals(base, promoCode);
  }, [cartItems, zone, promoCode]);

  const validateCartTotals = useCallback(async () => {
    if (cartItems.length === 0 || cartStoreId === null) {
      setServerTotals(null);
      return;
    }

    if (!isSupabaseConfigured()) {
      setServerTotals(localTotals);
      return;
    }

    setValidating(true);
    setErrorMsg(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/cart-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          store_id: cartStoreId,
          address_id: selectedAddressId,
          coupon_code: promoCode,
          items: cartItems.map((i) => ({
            product_id: i.productId,
            quantity: i.quantity,
          })),
        }),
      });

      const json = (await response.json()) as {
        subtotal_paise?: number;
        delivery_fee_paise?: number;
        handling_fee_paise?: number;
        discount_paise?: number;
        grand_total_paise?: number;
        error?: { message?: string };
      };

      if (!response.ok) {
        setErrorMsg(json.error?.message ?? t.errorGeneric);
        setServerTotals(localTotals);
        return;
      }

      setServerTotals({
        subtotalPaise: Math.trunc(json.subtotal_paise ?? localTotals.subtotalPaise),
        deliveryFeePaise: Math.trunc(
          json.delivery_fee_paise ?? localTotals.deliveryFeePaise,
        ),
        handlingFeePaise: Math.trunc(
          json.handling_fee_paise ?? localTotals.handlingFeePaise,
        ),
        discountPaise: Math.trunc(json.discount_paise ?? 0),
        grandTotalPaise: Math.trunc(
          json.grand_total_paise ?? localTotals.grandTotalPaise,
        ),
      });
    } catch {
      setServerTotals(localTotals);
    } finally {
      setValidating(false);
    }
  }, [
    cartItems,
    cartStoreId,
    promoCode,
    selectedAddressId,
    localTotals,
    t.errorGeneric,
  ]);

  useEffect(() => {
    validateCartTotals();
  }, [validateCartTotals]);

  const handleApplyPromo = () => {
    const cleaned = promoInput.trim().toUpperCase();
    if (cleaned.length === 0) {
      setPromoCode(null);
      setPromoFeedback(null);
      return;
    }
    setPromoCode(cleaned);
    if (!isSupabaseConfigured()) {
      if (cleaned === 'ZAFFMAKRANA') {
        const base = computeLocalCartTotalsPaise(cartItems, zone);
        if (base.subtotalPaise >= 19900) {
          setPromoFeedback('ZAFFMAKRANA applied: ₹25 saved!');
        } else {
          setPromoFeedback('Add items worth ₹199+ to unlock ZAFFMAKRANA.');
        }
      } else {
        setPromoFeedback('Promo code will be validated at server checkout.');
      }
    } else {
      setPromoFeedback(`Validating ${cleaned}...`);
    }
  };

  const handleRemovePromo = () => {
    setPromoInput('');
    setPromoCode(null);
    setPromoFeedback(null);
  };

  const handleSelectAddressPress = () => {
    const state = navigation.getState();
    const routeNames = state?.routeNames ?? [];
    if (routeNames.includes('AddressBook' as never)) {
      navigation.navigate('AddressBook' as never);
      return;
    }
    // Fallback before RootNavigator wires AddressBook route: set Makrana Central default
    setSelectedAddress(
      '00000000-0000-4000-8000-000000000101',
      'Home • Station Road, Makrana 341505',
    );
  };

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0 || cartStoreId === null) return;
    setErrorMsg(null);

    if (selectedAddressId === null) {
      setErrorMsg('Please select a delivery address before placing your order.');
      return;
    }

    if (!isSupabaseConfigured()) {
      const mockOrderId = `ord_local_${Date.now()}`;
      setActiveOrderId(mockOrderId);
      clearCart();
      navigation.navigate('TrackingTab', { orderId: mockOrderId });
      return;
    }

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';
      const response = await fetch(
        `${SUPABASE_FUNCTIONS_URL}/checkout-create-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            store_id: cartStoreId,
            address_id: selectedAddressId,
            payment_method: paymentMethod,
            coupon_code: promoCode,
            items: cartItems.map((i) => ({
              product_id: i.productId,
              quantity: i.quantity,
            })),
          }),
        },
      );

      const json = (await response.json()) as {
        order_id?: string;
        error?: { message?: string };
      };

      if (!response.ok || json.order_id === undefined) {
        setErrorMsg(json.error?.message ?? t.errorGeneric);
        return;
      }

      setActiveOrderId(json.order_id);
      clearCart();
      setIdempotencyKey(generateUuidV4());
      navigation.navigate('TrackingTab', { orderId: json.order_id });
    } catch {
      setErrorMsg(t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const activeTotals = serverTotals ?? localTotals;
  const hasSelectedAddress =
    selectedAddressId !== null && selectedAddressLabel.trim().length > 0;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: surface.background }]}
      edges={['top', 'left', 'right']}
    >
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>
          {t.cartTitle}
        </Text>
        {cartStoreName !== null ? (
          <Text style={[styles.storeSub, { color: surface.textMuted }]}>
            {cartStoreName}
          </Text>
        ) : null}
      </View>

      {cartItems.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="cart-outline"
            title={t.emptyCartTitle}
            subtitle={t.emptyCartSubtitle}
            ctaLabel={t.browseStoresBtn}
            onCtaPress={() => navigation.navigate('HomeTab')}
            mode={colorScheme}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {errorMsg !== null ? (
            <ErrorRetryBanner
              message={errorMsg}
              retryLabel={t.retryBtn}
              onRetry={validateCartTotals}
              mode={colorScheme}
            />
          ) : null}

          {/* Delivery Address Selector */}
          <Pressable
            onPress={handleSelectAddressPress}
            accessibilityRole="button"
            accessibilityLabel="Select or change delivery address"
            style={[
              styles.addressCard,
              {
                backgroundColor: surface.surface1,
                borderColor: hasSelectedAddress
                  ? BRAND_COLORS.electricGreen
                  : BRAND_COLORS.goldenYellow,
              },
            ]}
          >
            <View style={styles.addressIconCircle}>
              <Ionicons
                name="location"
                size={20}
                color={BRAND_COLORS.charcoalBlack}
              />
            </View>
            <View style={styles.addressTextWrap}>
              <Text style={[styles.addressLabelTitle, { color: surface.textPrimary }]}>
                {hasSelectedAddress ? 'Delivering to' : 'Select Delivery Address'}
              </Text>
              <Text
                style={[styles.addressSubText, { color: surface.textMuted }]}
                numberOfLines={2}
              >
                {hasSelectedAddress
                  ? selectedAddressLabel
                  : 'Tap to choose your Makrana home or shop address'}
              </Text>
            </View>
            <Text style={styles.changeLinkText}>
              {hasSelectedAddress ? 'Change' : 'Select'}
            </Text>
          </Pressable>

          {/* Cart Items */}
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: surface.surface1, borderColor: surface.border },
            ]}
          >
            {cartItems.map((item) => (
              <View key={item.productId} style={styles.cartItemRow}>
                <View style={styles.itemText}>
                  <Text
                    style={[styles.itemName, { color: surface.textPrimary }]}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                  <Text style={[styles.itemMeta, { color: surface.textMuted }]}>
                    {item.unitLabel} • {formatPaise(item.unitPricePaise)}
                  </Text>
                </View>

                <View style={styles.stepperBox}>
                  <Pressable
                    onPress={() => updateItemQuantity(item.productId, -1)}
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease ${item.name}`}
                    style={styles.stepperBtn}
                  >
                    <Ionicons name="remove" size={16} color={BRAND_COLORS.pureWhite} />
                  </Pressable>
                  <Text style={styles.stepperQty}>{item.quantity}</Text>
                  <Pressable
                    onPress={() => updateItemQuantity(item.productId, 1)}
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${item.name}`}
                    style={styles.stepperBtn}
                  >
                    <Ionicons name="add" size={16} color={BRAND_COLORS.pureWhite} />
                  </Pressable>
                </View>

                <Text style={[styles.lineTotal, { color: surface.textPrimary }]}>
                  {formatPaise(item.unitPricePaise * item.quantity)}
                </Text>
              </View>
            ))}
          </View>

          {/* Coupon / Promo Input */}
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: surface.surface1, borderColor: surface.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
              Promo & Coupon Code
            </Text>
            <View style={styles.promoRow}>
              <TextInput
                value={promoInput}
                onChangeText={setPromoInput}
                placeholder="Try ZAFFMAKRANA"
                placeholderTextColor={surface.textMuted}
                autoCapitalize="characters"
                style={[
                  styles.promoInput,
                  {
                    backgroundColor: surface.surface2,
                    borderColor: surface.border,
                    color: surface.textPrimary,
                  },
                ]}
              />
              {promoCode !== null ? (
                <Pressable
                  onPress={handleRemovePromo}
                  accessibilityRole="button"
                  accessibilityLabel="Remove promo code"
                  style={[
                    styles.promoBtn,
                    { backgroundColor: STATUS_COLORS.errorBgLight },
                  ]}
                >
                  <Text
                    style={[
                      styles.promoBtnText,
                      { color: STATUS_COLORS.errorTextLight },
                    ]}
                  >
                    Remove
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleApplyPromo}
                  accessibilityRole="button"
                  accessibilityLabel="Apply promo code"
                  style={[
                    styles.promoBtn,
                    { backgroundColor: BRAND_COLORS.goldenYellow },
                  ]}
                >
                  <Text
                    style={[
                      styles.promoBtnText,
                      { color: BRAND_COLORS.charcoalBlack },
                    ]}
                  >
                    Apply
                  </Text>
                </Pressable>
              )}
            </View>
            {promoFeedback !== null ? (
              <Text
                style={[
                  styles.promoFeedback,
                  {
                    color:
                      activeTotals.discountPaise > 0
                        ? BRAND_COLORS.electricGreen
                        : surface.textMuted,
                  },
                ]}
              >
                {promoFeedback}
              </Text>
            ) : null}
          </View>

          {/* Server-Validated Paise Summary */}
          {validating ? (
            <LoadingSkeleton rows={2} mode={colorScheme} />
          ) : (
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: surface.surface1, borderColor: surface.border },
              ]}
            >
              <View style={styles.billHeaderRow}>
                <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
                  {t.billSummaryTitle}
                </Text>
                <View style={styles.verifiedPill}>
                  <Ionicons
                    name="shield-checkmark"
                    size={13}
                    color={BRAND_COLORS.electricGreen}
                  />
                  <Text style={styles.verifiedText}>{t.serverValidatedBadge}</Text>
                </View>
              </View>

              {activeTotals.deliveryFeePaise > 0 ? (
                <FreeDeliveryProgressBar
                  currentPaise={activeTotals.subtotalPaise - activeTotals.discountPaise}
                  thresholdPaise={
                    activeTotals.subtotalPaise + activeTotals.deliveryFeePaise
                  }
                />
              ) : null}
              <SavingsChip savedPaise={activeTotals.discountPaise} />

              <View style={styles.billLine}>
                <Text style={[styles.billLabel, { color: surface.textSecondary }]}>
                  {t.subtotalLabel}
                </Text>
                <Text style={[styles.billValue, { color: surface.textPrimary }]}>
                  {formatPaise(activeTotals.subtotalPaise)}
                </Text>
              </View>

              <View style={styles.billLine}>
                <Text style={[styles.billLabel, { color: surface.textSecondary }]}>
                  {t.deliveryFeeLabel}
                </Text>
                <Text style={[styles.billValue, { color: surface.textPrimary }]}>
                  {activeTotals.deliveryFeePaise === 0
                    ? t.freeLabel
                    : formatPaise(activeTotals.deliveryFeePaise)}
                </Text>
              </View>

              <View style={styles.billLine}>
                <Text style={[styles.billLabel, { color: surface.textSecondary }]}>
                  {t.handlingFeeLabel}
                </Text>
                <Text style={[styles.billValue, { color: surface.textPrimary }]}>
                  {formatPaise(activeTotals.handlingFeePaise)}
                </Text>
              </View>

              {activeTotals.discountPaise > 0 ? (
                <View style={styles.billLine}>
                  <Text style={[styles.billLabel, { color: BRAND_COLORS.electricGreen }]}>
                    {t.discountLabel}
                  </Text>
                  <Text style={[styles.billValue, { color: BRAND_COLORS.electricGreen }]}>
                    -{formatPaise(activeTotals.discountPaise)}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.totalDivider, { backgroundColor: surface.border }]} />

              <View style={styles.billLine}>
                <Text style={[styles.grandLabel, { color: surface.textPrimary }]}>
                  {t.grandTotalLabel}
                </Text>
                <Text style={[styles.grandValue, { color: surface.textPrimary }]}>
                  {formatPaise(activeTotals.grandTotalPaise)}
                </Text>
              </View>
            </View>
          )}

          {/* Payment Method Selector */}
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: surface.surface1, borderColor: surface.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
              {t.paymentMethodTitle}
            </Text>

            {(
              [
                {
                  id: 'razorpay' as PaymentMethod,
                  title: t.razorpayTitle,
                  subtitle: t.razorpaySubtitle,
                  icon: 'card-outline' as const,
                  badge:
                    activeTotals.subtotalPaise - activeTotals.discountPaise <=
                    100000
                      ? 'UPI Lite · PIN-free ≤ ₹1,000'
                      : 'UPI · Fastest checkout',
                },
                {
                  id: 'cod' as PaymentMethod,
                  title: t.codTitle,
                  subtitle: t.codSubtitle,
                  icon: 'cash-outline' as const,
                  badge: null,
                },
              ] as const
            ).map((option) => {
              const selected = paymentMethod === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setPaymentMethod(option.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={[
                    styles.paymentOption,
                    {
                      backgroundColor: selected
                        ? BRAND_COLORS.goldenYellowGlow
                        : surface.surface2,
                      borderColor: selected
                        ? BRAND_COLORS.goldenYellow
                        : surface.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={option.icon}
                    size={22}
                    color={surface.textPrimary}
                  />
                  <View style={styles.paymentTextWrap}>
                    <Text style={[styles.paymentTitle, { color: surface.textPrimary }]}>
                      {option.title}
                    </Text>
                    <Text style={[styles.paymentSub, { color: surface.textMuted }]}>
                      {option.subtitle}
                    </Text>
                    {option.badge ? (
                      <View style={styles.upiBadge}>
                        <Text style={styles.upiBadgeText}>{option.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={
                      selected
                        ? BRAND_COLORS.electricGreen
                        : surface.textMuted
                    }
                  />
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.idempotencyCaption, { color: surface.textMuted }]}>
            Idempotency Ref: {idempotencyKey.slice(0, 13)}...
          </Text>

          <PrimaryButton
            label={`${t.placeOrderBtn} • ${formatPaise(activeTotals.grandTotalPaise)}`}
            onPress={handlePlaceOrder}
            loading={submitting}
            variant="success"
            mode={colorScheme}
            icon="bag-check-outline"
          />
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
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '700',
  },
  storeSub: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    marginTop: 2,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.screenPadding,
  },
  scrollContent: {
    padding: SPACING.screenPadding,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  addressCard: {
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    padding: SPACING.md,
    borderRadius: RADII.lg,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  addressIconCircle: {
    width: 40,
    height: 40,
    borderRadius: RADII.full,
    backgroundColor: BRAND_COLORS.goldenYellowGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressTextWrap: {
    flex: 1,
  },
  addressLabelTitle: {
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '700',
  },
  addressSubText: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    marginTop: 2,
  },
  changeLinkText: {
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '800',
    color: BRAND_COLORS.electricGreen,
  },
  sectionCard: {
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    borderWidth: 1,
    gap: SPACING.md,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '700',
  },
  promoRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  promoInput: {
    flex: 1,
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '600',
  },
  promoBtn: {
    minWidth: 88,
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoBtnText: {
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '700',
  },
  promoFeedback: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    fontWeight: '600',
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  itemText: {
    flex: 1,
  },
  itemName: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '600',
  },
  itemMeta: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    marginTop: 2,
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND_COLORS.electricGreen,
    borderRadius: RADII.sm,
    minHeight: TOUCH_TARGETS.minSize,
  },
  stepperBtn: {
    minWidth: TOUCH_TARGETS.minSize,
    minHeight: TOUCH_TARGETS.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperQty: {
    color: BRAND_COLORS.pureWhite,
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '800',
    minWidth: 18,
    textAlign: 'center',
  },
  lineTotal: {
    minWidth: 56,
    textAlign: 'right',
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '700',
  },
  billHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND_COLORS.electricGreenSurface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADII.full,
  },
  verifiedText: {
    color: BRAND_COLORS.electricGreen,
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '700',
  },
  billLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billLabel: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
  },
  billValue: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '600',
  },
  totalDivider: {
    height: 1,
  },
  grandLabel: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '700',
  },
  grandValue: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '800',
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1,
    gap: SPACING.md,
  },
  paymentTextWrap: {
    flex: 1,
  },
  paymentTitle: {
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '700',
  },
  upiBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: 'rgba(255,199,3,0.12)',
    borderColor: 'rgba(255,199,3,0.4)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  upiBadgeText: {
    color: BRAND_COLORS.goldenYellow,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  paymentSub: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    marginTop: 2,
  },
  idempotencyCaption: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    textAlign: 'center',
  },
});
