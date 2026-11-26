import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
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

export type HandoverLoadState = 'ready' | 'loading' | 'empty' | 'error';

export interface HandoverOrderContext {
  orderId: string;
  orderCode: string;
  customerLocality: string;
  paymentMode: 'UPI' | 'COD';
  codAmountPaise: number;
  baseFeePaise: number;
  distanceBonusPaise: number;
  tipPaise: number;
  shiftCodCashInHandPaise: number;
  shiftTotalEarningsPaise: number;
}

export interface RiderDeliveryOtpScreenProps {
  initialState?: HandoverLoadState;
  order?: HandoverOrderContext | null;
  onVerifyOtp?: (orderId: string, otp: string, codConfirmed: boolean) => Promise<boolean> | boolean;
  onFinishHandover?: () => void;
  onRetryLoad?: () => Promise<void> | void;
}

const DEFAULT_ORDER: HandoverOrderContext = {
  orderId: 'ord_1042',
  orderCode: 'MKR-1042',
  customerLocality: 'Jain Nagar, Ward 14, Makrana',
  paymentMode: 'COD',
  codAmountPaise: 34200,
  baseFeePaise: 3000,
  distanceBonusPaise: 1200,
  tipPaise: 1000,
  shiftCodCashInHandPaise: 89500,
  shiftTotalEarningsPaise: 24600,
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

export const RiderDeliveryOtpScreen: React.FC<RiderDeliveryOtpScreenProps> = ({
  initialState = 'ready',
  order = DEFAULT_ORDER,
  onVerifyOtp,
  onFinishHandover,
  onRetryLoad,
}) => {
  const [loadState, setLoadState] = useState<HandoverLoadState>(initialState);
  const [otpValue, setOtpValue] = useState('');
  const [codConfirmed, setCodConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const handleOtpChange = useCallback((text: string) => {
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 4);
    setOtpValue(digitsOnly);
    setValidationError(null);
  }, []);

  const handleCompleteDelivery = useCallback(async () => {
    if (!order) return;
    if (otpValue.length !== 4) {
      setValidationError('Enter the 4-digit handover OTP from the customer.');
      return;
    }
    if (order.paymentMode === 'COD' && !codConfirmed) {
      setValidationError(
        `Confirm cash collection of ${formatPaiseToINR(order.codAmountPaise)} before completing.`
      );
      return;
    }

    setSubmitting(true);
    setValidationError(null);
    try {
      if (onVerifyOtp) {
        const ok = await onVerifyOtp(order.orderId, otpValue, codConfirmed);
        if (!ok) {
          setValidationError('Invalid 4-digit OTP. Ask the customer to check their order screen.');
          return;
        }
      }
      setCompleted(true);
    } catch {
      setLoadState('error');
    } finally {
      setSubmitting(false);
    }
  }, [codConfirmed, onVerifyOtp, order, otpValue]);

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
          <Text style={styles.stateTitle}>Handover Verification Failed</Text>
          <Text style={styles.stateBody}>
            Network error while verifying customer OTP. Please retry.
          </Text>
          <TouchableOpacity
            style={styles.ctaPrimary56}
            onPress={() => {
              setLoadState('ready');
              if (onRetryLoad) void onRetryLoad();
            }}
            accessibilityRole="button"
          >
            <Text style={styles.ctaPrimary56Text}>Retry Handover</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'empty' || !order) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.stateContainer}>
          <Text style={styles.stateTitle}>No Active Delivery for Handover</Text>
          <Text style={styles.stateBody}>
            Accept and pick up an order from your Tasks tab before entering a handover OTP.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const orderEarningPaise = order.baseFeePaise + order.distanceBonusPaise + order.tipPaise;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerCard}>
          <Text style={styles.eyebrow}>CUSTOMER HANDOVER</Text>
          <Text style={styles.orderCode}>Order #{order.orderCode}</Text>
          <Text style={styles.localityText}>{order.customerLocality}</Text>
        </View>

        {/* COD Cash Collection Gate or UPI Badge */}
        {order.paymentMode === 'COD' ? (
          <View style={styles.codCard}>
            <Text style={styles.codEyebrow}>CASH ON DELIVERY (COD)</Text>
            <Text style={styles.codAmount}>{formatPaiseToINR(order.codAmountPaise)}</Text>
            <TouchableOpacity
              style={[styles.codCheckBtn, codConfirmed && styles.codCheckBtnConfirmed]}
              onPress={() => {
                setCodConfirmed((prev) => !prev);
                setValidationError(null);
              }}
              disabled={completed}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: codConfirmed }}
            >
              <View style={[styles.checkboxSquare, codConfirmed && styles.checkboxSquareChecked]}>
                {codConfirmed ? <Text style={styles.checkboxTick}>✓</Text> : null}
              </View>
              <Text style={styles.codCheckLabel}>
                I have collected {formatPaiseToINR(order.codAmountPaise)} cash
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.upiBanner}>
            <Text style={styles.upiBannerText}>PREPAID VIA UPI · DO NOT COLLECT CASH</Text>
          </View>
        )}

        {/* 4-Digit OTP Verification */}
        {!completed ? (
          <View style={styles.otpCard}>
            <Text style={styles.sectionTitle}>Enter 4-Digit Customer OTP</Text>
            <Text style={styles.otpHint}>
              Ask the customer for the 4-digit PIN shown on their live tracking screen.
            </Text>

            <View style={styles.otpBoxesRow}>
              {[0, 1, 2, 3].map((idx) => (
                <View
                  key={idx}
                  style={[styles.otpDigitBox, otpValue[idx] ? styles.otpDigitBoxFilled : null]}
                >
                  <Text style={styles.otpDigitText}>{otpValue[idx] ?? '•'}</Text>
                </View>
              ))}
            </View>

            <TextInput
              style={styles.otpInput}
              value={otpValue}
              onChangeText={handleOtpChange}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="Type 4-digit OTP"
              placeholderTextColor={SURFACE_DARK.textMuted}
              accessibilityLabel="4-digit customer handover OTP"
            />

            {validationError ? <Text style={styles.errorText}>{validationError}</Text> : null}

            <TouchableOpacity
              style={styles.ctaGreen56}
              onPress={handleCompleteDelivery}
              disabled={submitting}
              accessibilityRole="button"
            >
              {submitting ? (
                <ActivityIndicator color={SURFACE_DARK.onSuccess} />
              ) : (
                <Text style={styles.ctaGreen56Text}>Verify OTP & Complete Delivery</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.successBanner}>
            <Text style={styles.successTitle}>Delivery Completed</Text>
            <Text style={styles.successSub}>
              Handover OTP verified. Earnings credited to your shift ledger.
            </Text>
          </View>
        )}

        {/* Earnings Summary */}
        <View style={styles.earningsCard}>
          <Text style={styles.sectionTitle}>Order & Shift Earnings Summary</Text>
          <View style={styles.lineRow}>
            <Text style={styles.lineLabel}>Base Delivery Fee</Text>
            <Text style={styles.lineValue}>{formatPaiseToINR(order.baseFeePaise)}</Text>
          </View>
          <View style={styles.lineRow}>
            <Text style={styles.lineLabel}>Distance / Peak Bonus</Text>
            <Text style={styles.lineValue}>{formatPaiseToINR(order.distanceBonusPaise)}</Text>
          </View>
          <View style={styles.lineRow}>
            <Text style={styles.lineLabel}>Customer Tip</Text>
            <Text style={styles.lineValue}>{formatPaiseToINR(order.tipPaise)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.lineRow}>
            <Text style={styles.totalLabel}>This Order Payout</Text>
            <Text style={styles.totalValue}>{formatPaiseToINR(orderEarningPaise)}</Text>
          </View>
          <View style={styles.lineRow}>
            <Text style={styles.lineLabel}>Shift Earnings (Incl. this order)</Text>
            <Text style={styles.lineValue}>
              {formatPaiseToINR(order.shiftTotalEarningsPaise + (completed ? orderEarningPaise : 0))}
            </Text>
          </View>
          <View style={styles.lineRow}>
            <Text style={styles.lineLabel}>COD Cash in Hand</Text>
            <Text style={styles.codCashValue}>
              {formatPaiseToINR(
                order.shiftCodCashInHandPaise +
                  (completed && order.paymentMode === 'COD' ? order.codAmountPaise : 0)
              )}
            </Text>
          </View>
        </View>

        {completed && (
          <TouchableOpacity
            style={styles.ctaPrimary56}
            onPress={onFinishHandover}
            accessibilityRole="button"
          >
            <Text style={styles.ctaPrimary56Text}>Back to Dispatch Radar</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: SURFACE_DARK.background },
  container: { padding: SPACING.screenPadding, gap: SPACING.lg, paddingBottom: SPACING.xxl },
  headerCard: {
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    gap: SPACING.xs,
  },
  eyebrow: { ...TYPOGRAPHY.captionMin, color: BRAND_COLORS.goldenYellow },
  orderCode: {
    ...TYPOGRAPHY.headlineLg,
    color: SURFACE_DARK.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  localityText: { ...TYPOGRAPHY.bodyMd, color: SURFACE_DARK.textSecondary },
  codCard: {
    backgroundColor: STATUS_COLORS.warningBgDark,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: STATUS_COLORS.warningBright,
    gap: SPACING.md,
  },
  codEyebrow: { ...TYPOGRAPHY.labelMd, color: STATUS_COLORS.warningBright },
  codAmount: {
    ...TYPOGRAPHY.displayLg,
    color: SURFACE_DARK.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  codCheckBtn: {
    minHeight: TOUCH_TARGETS.riderActionHeight,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface2,
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  codCheckBtnConfirmed: {
    borderColor: BRAND_COLORS.electricGreen,
    backgroundColor: STATUS_COLORS.successBgDark,
  },
  checkboxSquare: {
    width: 24,
    height: 24,
    borderRadius: RADII.xs,
    borderWidth: 2,
    borderColor: SURFACE_DARK.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSquareChecked: {
    backgroundColor: BRAND_COLORS.electricGreen,
    borderColor: BRAND_COLORS.electricGreen,
  },
  checkboxTick: { ...TYPOGRAPHY.labelMd, color: BRAND_COLORS.pureWhite },
  codCheckLabel: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.textPrimary, flex: 1 },
  upiBanner: {
    backgroundColor: STATUS_COLORS.successBgDark,
    borderRadius: RADII.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: BRAND_COLORS.electricGreen,
    alignItems: 'center',
  },
  upiBannerText: { ...TYPOGRAPHY.labelMd, color: BRAND_COLORS.electricGreenLight },
  otpCard: {
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    gap: SPACING.md,
  },
  sectionTitle: { ...TYPOGRAPHY.titleMd, color: SURFACE_DARK.textPrimary },
  otpHint: { ...TYPOGRAPHY.bodySm, color: SURFACE_DARK.textMuted },
  otpBoxesRow: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
  otpDigitBox: {
    flex: 1,
    height: TOUCH_TARGETS.riderActionHeight,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface2,
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigitBoxFilled: { borderColor: BRAND_COLORS.goldenYellow },
  otpDigitText: {
    ...TYPOGRAPHY.headlineLg,
    color: SURFACE_DARK.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  otpInput: {
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.md,
    backgroundColor: SURFACE_DARK.surface2,
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
    paddingHorizontal: SPACING.md,
    color: SURFACE_DARK.textPrimary,
    ...TYPOGRAPHY.titleMd,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  errorText: { ...TYPOGRAPHY.bodySm, color: STATUS_COLORS.errorBright },
  ctaGreen56: {
    minHeight: TOUCH_TARGETS.riderActionHeight,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.electricGreen,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  ctaGreen56Text: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.onSuccess },
  ctaPrimary56: {
    minHeight: TOUCH_TARGETS.riderActionHeight,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  ctaPrimary56Text: { ...TYPOGRAPHY.labelLg, color: SURFACE_DARK.onPrimary },
  successBanner: {
    backgroundColor: STATUS_COLORS.successBgDark,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: BRAND_COLORS.electricGreen,
    gap: SPACING.xs,
  },
  successTitle: { ...TYPOGRAPHY.headlineMd, color: BRAND_COLORS.electricGreenLight },
  successSub: { ...TYPOGRAPHY.bodyMd, color: SURFACE_DARK.textPrimary },
  earningsCard: {
    backgroundColor: SURFACE_DARK.surface1,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: SURFACE_DARK.border,
    gap: SPACING.sm,
  },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineLabel: { ...TYPOGRAPHY.bodyMd, color: SURFACE_DARK.textSecondary },
  lineValue: {
    ...TYPOGRAPHY.bodyMd,
    color: SURFACE_DARK.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  divider: { height: 1, backgroundColor: SURFACE_DARK.border, marginVertical: SPACING.xs },
  totalLabel: { ...TYPOGRAPHY.titleMd, color: SURFACE_DARK.textPrimary },
  totalValue: {
    ...TYPOGRAPHY.titleMd,
    color: BRAND_COLORS.goldenYellow,
    fontVariant: ['tabular-nums'],
  },
  codCashValue: {
    ...TYPOGRAPHY.labelLg,
    color: STATUS_COLORS.warningBright,
    fontVariant: ['tabular-nums'],
  },
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
  skeletonCard: { height: 160, borderRadius: RADII.lg, backgroundColor: SURFACE_DARK.surface2 },
});

export default RiderDeliveryOtpScreen;
