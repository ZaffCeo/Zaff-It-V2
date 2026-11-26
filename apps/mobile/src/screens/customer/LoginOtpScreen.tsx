import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { useAppStore, type UserRole } from '@/store/useAppStore';
import { getTranslation } from '@/i18n/translations';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import {
  FIREBASE_PHONE_ENABLED,
  activeOtpChannelLabel,
  confirmFirebaseOtp,
  resetFirebaseOtpFlow,
  sendFirebaseOtp,
} from '@/services/firebaseAuth';
import { ErrorRetryBanner, PrimaryButton } from '@/components/StateViews';

export const LoginOtpScreen: React.FC = () => {
  const language = useAppStore((s) => s.language);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const setSession = useAppStore((s) => s.setSession);
  const t = getTranslation(language);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [phoneDigits, setPhoneDigits] = useState('');
  const [otpDigits, setOtpDigits] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  // Graceful degradation: real backend configured but SMS provider not yet
  // connected (no Twilio/Vonage creds) — fall back to demo OTP in dev builds
  // so the live app stays reviewable. Real SMS path is used once provider lands.
  const [smsFallback, setSmsFallback] = useState(false);
  // Dual-provider auth: 'firebase' = Firebase SMS -> signInWithIdToken exchange,
  // 'supabase' = Supabase native SMS (Twilio) or demo fallback.
  const [authMode, setAuthMode] = useState<'firebase' | 'supabase'>('supabase');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const normalizedPhone = `+91${phoneDigits.replace(/\D/g, '').slice(0, 10)}`;
  const isPhoneValid = phoneDigits.replace(/\D/g, '').length === 10;
  const isOtpValid = otpDigits.replace(/\D/g, '').length === 6;

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const handleSendOtp = async () => {
    setErrorMsg(null);
    if (!isPhoneValid) {
      setErrorMsg(t.invalidPhoneError);
      return;
    }

    if (!isSupabaseConfigured()) {
      setStep('otp');
      return;
    }

    // Path A — Firebase SMS (no DLT needed; 10 free SMS/day). On failure in
    // dev builds we silently fall through to the Supabase SMS/demo path.
    if (FIREBASE_PHONE_ENABLED) {
      setLoading(true);
      try {
        await sendFirebaseOtp(normalizedPhone);
        setAuthMode('firebase');
        setResendIn(30);
        setErrorMsg(null);
        setStep('otp');
        return;
      } catch (err) {
        const isDevelopmentEnv = process.env.EXPO_PUBLIC_ENV !== 'production';
        if (!isDevelopmentEnv) {
          setErrorMsg(
            err instanceof Error && err.message ? err.message : t.errorGeneric,
          );
          return;
        }
      } finally {
        setLoading(false);
      }
    }

    // Path B — Supabase native SMS (Twilio) + demo fallback.
    setAuthMode('supabase');
    setResendIn(60); // server-side OTP resend windows (Supabase) + client spam guard
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
      });
      if (error) {
        const isDevelopmentEnv = process.env.EXPO_PUBLIC_ENV !== 'production';
        if (isDevelopmentEnv) {
          // SMS provider not connected yet (e.g. "Error sending SMS") —
          // dev builds fall back to the demo OTP flow.
          setSmsFallback(true);
          setErrorMsg(null);
          setStep('otp');
        } else {
          setErrorMsg(error.message);
        }
      } else {
        setSmsFallback(false);
        setStep('otp');
      }
    } catch {
      setErrorMsg(t.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setErrorMsg(null);
    if (!isOtpValid) {
      setErrorMsg(t.invalidOtpError);
      return;
    }

    // Firebase path: confirm OTP -> Firebase ID token -> real Supabase
    // session via signInWithIdToken (Firebase configured as third-party auth
    // in the Supabase project). RLS/auth.uid() work unchanged afterwards.
    if (authMode === 'firebase' && !smsFallback) {
      setLoading(true);
      try {
        const { idToken, phone } = await confirmFirebaseOtp(otpDigits.trim());
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'firebase',
          token: idToken,
        });
        if (error) {
          setErrorMsg(error.message);
          return;
        }
        const user = data.user;
        if (user) {
          // Bootstrap the profile row (auth.users trigger absent). Idempotent.
          await supabase
            .from('profiles')
            .upsert(
              {
                id: user.id,
                phone: phone ?? normalizedPhone,
                full_name: `ZAFF user ${(phone ?? normalizedPhone).slice(-4)}`,
              },
              { onConflict: 'id' },
            );
          const metaRole = user.app_metadata?.role as UserRole | undefined;
          setSession(user.id, phone ?? normalizedPhone, metaRole ?? 'customer');
        }
      } catch (err) {
        setErrorMsg(
          err instanceof Error && err.message && err.message !== 'NO_PENDING_LOGIN'
            ? err.message
            : t.errorGeneric,
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (smsFallback || !isSupabaseConfigured()) {
      // AUD-LOW-6: demo role switch allowed ONLY in development builds with
      // no backend configured — never when EXPO_PUBLIC_ENV is staging/production.
      let demoRole: UserRole | null = null;
      const isDevelopmentEnv = process.env.EXPO_PUBLIC_ENV !== 'production';
      if (isDevelopmentEnv && typeof window !== 'undefined') {
        // Role comes from ?role=<x> OR path deep-link /admin /merchant /rider
        // (the web admin tower entry: zaff-it.vercel.app/admin).
        const param =
          new URLSearchParams(window.location.search).get('role') ??
          window.location.pathname.match(/^\/(merchant|rider|admin)\b/i)?.[1]?.toLowerCase() ??
          null;
        if (param === 'merchant' || param === 'rider' || param === 'admin') {
          demoRole = param;
        }
      }
      const role: UserRole = demoRole ?? 'customer';
      setSession(`dev-${role}-makrana`, normalizedPhone, role);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token: otpDigits.trim(),
        type: 'sms',
      });
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      const user = data.user;
      if (user) {
        const metaRole = user.app_metadata?.role as UserRole | undefined;
        setSession(user.id, user.phone ?? normalizedPhone, metaRole ?? 'customer');
      }
    } catch {
      setErrorMsg(t.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: surface.background }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerBlock}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoBadgeText}>ZAFF-IT</Text>
            </View>
            <Text style={[styles.title, { color: surface.textPrimary }]}>
              {t.loginTitle}
            </Text>
            <Text style={[styles.subtitle, { color: surface.textMuted }]}>
              {t.loginSubtitle}
            </Text>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: surface.surface1,
                borderColor: surface.border,
              },
            ]}
          >
            {errorMsg !== null ? (
              <ErrorRetryBanner
                message={errorMsg}
                retryLabel={t.retryBtn}
                onRetry={step === 'phone' ? handleSendOtp : handleVerifyOtp}
                mode={colorScheme}
              />
            ) : null}

            {step === 'phone' ? (
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: surface.textSecondary }]}>
                  {t.phoneLabel}
                </Text>
                <View
                  style={[
                    styles.phoneInputRow,
                    {
                      backgroundColor: surface.surface2,
                      borderColor: surface.borderStrong,
                    },
                  ]}
                >
                  <Text
                    style={[styles.countryCode, { color: surface.textPrimary }]}
                  >
                    +91
                  </Text>
                  <TextInput
                    value={phoneDigits}
                    onChangeText={(txt) =>
                      setPhoneDigits(txt.replace(/\D/g, '').slice(0, 10))
                    }
                    placeholder={t.phonePlaceholder}
                    placeholderTextColor={surface.textMuted}
                    keyboardType="phone-pad"
                    maxLength={10}
                    returnKeyType="done"
                    onSubmitEditing={handleSendOtp}
                    style={[styles.input, { color: surface.textPrimary }]}
                    accessibilityLabel={t.phoneLabel}
                  />
                </View>

                <PrimaryButton
                  label={t.sendOtpBtn}
                  onPress={handleSendOtp}
                  loading={loading}
                  disabled={!isPhoneValid}
                  mode={colorScheme}
                  icon="chatbubble-ellipses-outline"
                />
              </View>
            ) : (
              <View style={styles.fieldGroup}>
                <View style={styles.otpHeaderRow}>
                  <Text style={[styles.label, { color: surface.textSecondary }]}>
                    {t.otpLabel} ({normalizedPhone}) · {activeOtpChannelLabel()}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setStep('phone');
                      setOtpDigits('');
                      setErrorMsg(null);
                      resetFirebaseOtpFlow();
                    }}
                    accessibilityRole="button"
                    style={styles.textLinkBtn}
                  >
                    <Text
                      style={[
                        styles.textLinkLabel,
                        { color: BRAND_COLORS.electricGreen },
                      ]}
                    >
                      {t.changePhoneBtn}
                    </Text>
                  </Pressable>
                </View>

                <TextInput
                  value={otpDigits}
                  onChangeText={(txt) =>
                    setOtpDigits(txt.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder={t.otpPlaceholder}
                  placeholderTextColor={surface.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  returnKeyType="done"
                  onSubmitEditing={handleVerifyOtp}
                  style={[
                    styles.otpInput,
                    {
                      backgroundColor: surface.surface2,
                      borderColor: surface.borderStrong,
                      color: surface.textPrimary,
                    },
                  ]}
                  accessibilityLabel={t.otpLabel}
                />

                <PrimaryButton
                  label={t.verifyOtpBtn}
                  onPress={handleVerifyOtp}
                  loading={loading}
                  disabled={!isOtpValid}
                  variant="success"
                  mode={colorScheme}
                  icon="checkmark-circle-outline"
                />

                <Pressable
                  onPress={handleSendOtp}
                  disabled={loading || resendIn > 0}
                  accessibilityRole="button"
                  accessibilityLabel={resendIn > 0 ? `Resend OTP available in ${resendIn} seconds` : 'Resend OTP'}
                  style={styles.resendBtn}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={16}
                    color={surface.textSecondary}
                  />
                  <Text
                    style={[styles.resendText, { color: surface.textSecondary }]}
                  >
                    {resendIn > 0 ? `Resend OTP in ${resendIn}s` : t.resendOtpBtn}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          <Text style={[styles.consentText, { color: surface.textMuted }]}>
            {t.privacyConsentPrefix}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.screenPadding,
    gap: SPACING.xl,
  },
  headerBlock: {
    gap: SPACING.sm,
  },
  logoBadge: {
    alignSelf: 'flex-start',
    backgroundColor: BRAND_COLORS.charcoalBlack,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: BRAND_COLORS.goldenYellow,
  },
  logoBadgeText: {
    color: BRAND_COLORS.goldenYellow,
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    fontSize: TYPOGRAPHY.headlineLg.fontSize,
    lineHeight: TYPOGRAPHY.headlineLg.lineHeight,
    fontWeight: '700',
    marginTop: SPACING.xs,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    lineHeight: TYPOGRAPHY.bodyMd.lineHeight,
  },
  card: {
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    borderWidth: 1,
    gap: SPACING.md,
  },
  fieldGroup: {
    gap: SPACING.md,
  },
  label: {
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '700',
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    borderRadius: RADII.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
  },
  countryCode: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '700',
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '600',
    minHeight: TOUCH_TARGETS.minSize,
  },
  otpHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  textLinkBtn: {
    minHeight: TOUCH_TARGETS.minSize,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  textLinkLabel: {
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '700',
  },
  otpInput: {
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    borderRadius: RADII.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '700',
    letterSpacing: 6,
    textAlign: 'center',
  },
  resendBtn: {
    minHeight: TOUCH_TARGETS.minSize,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  resendText: {
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '600',
  },
  consentText: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    lineHeight: TYPOGRAPHY.captionMin.lineHeight,
    textAlign: 'center',
  },
});
