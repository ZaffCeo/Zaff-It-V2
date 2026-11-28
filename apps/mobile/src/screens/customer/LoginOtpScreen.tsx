import React, { useEffect, useState } from 'react';
import {
  Image,
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
import { LinearGradient } from 'expo-linear-gradient';
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
  // Premium focus states (integrated fields — no boxed look)
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [otpFocused, setOtpFocused] = useState(false);

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

  const handleOtpChange = (txt: string) => {
    const digits = txt.replace(/\D/g, '').slice(0, 6);
    setOtpDigits(digits);
    // Auto-verify the moment all six digits land (paste & SMS autofill too).
    if (digits.length === 6 && !loading) {
      handleVerifyOtp(digits);
    }
  };

  const handleVerifyOtp = async (overrideOtp?: unknown) => {
    setErrorMsg(null);
    const code = (typeof overrideOtp === 'string' ? overrideOtp : otpDigits).trim();
    if (code.length !== 6) {
      setErrorMsg(t.invalidOtpError);
      return;
    }

    // Firebase path: confirm OTP -> Firebase ID token -> real Supabase
    // session via signInWithIdToken (Firebase configured as third-party auth
    // in the Supabase project). RLS/auth.uid() work unchanged afterwards.
    if (authMode === 'firebase' && !smsFallback) {
      setLoading(true);
      try {
        const { idToken, phone } = await confirmFirebaseOtp(code);
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

    if (isSupabaseConfigured() && smsFallback) {
      // Backend configured + SMS gateway down: NEVER mint a fake dev id here —
      // it would flow into uuid-filtered PostgREST queries
      // ("invalid input syntax for type uuid"). Fail loudly instead.
      setErrorMsg('SMS gateway down — thodi der me dobara try karo.');
      return;
    }

    if (!isSupabaseConfigured()) {
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
      setSession(`dev-${role}-makrana`, normalizedPhone, role, { allowNonUuid: true });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token: code,
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
      style={[styles.safe, { backgroundColor: BRAND_COLORS.charcoalBlack }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      {/* Brand glow — visual continuity with the splash screen */}
      <LinearGradient
        colors={['rgba(255,199,3,0.16)', 'rgba(255,199,3,0.04)', 'transparent']}
        style={styles.topGlow}
        pointerEvents="none"
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerBlock}>
            <Image
              source={require('../../../assets/zaff-it-logo-wide.png')}
              style={styles.masterLogo}
              resizeMode="contain"
              accessibilityLabel="Zaff-It logo"
            />
            <View style={styles.brandRow}>
              <Text style={styles.brandName}>ZAFF-IT</Text>
              <View style={styles.brandDot} />
              <Text style={styles.brandTag}>Need-It? Zaff-It</Text>
            </View>
            <Text style={[styles.title, { color: '#F8F9FA' }]}>
              {t.loginTitle}
            </Text>
            <Text style={[styles.subtitle, { color: '#CBD5E1' }]}>
              {t.loginSubtitle}
            </Text>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: surface.surface1,
                borderColor: 'rgba(255,199,3,0.28)',
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
                      borderColor:
                        errorMsg !== null
                          ? '#EF4444'
                          : phoneFocused
                            ? BRAND_COLORS.goldenYellow
                            : 'transparent',
                      borderWidth: phoneFocused || errorMsg !== null ? 1.5 : 0,
                      shadowColor: BRAND_COLORS.goldenYellow,
                      shadowOpacity: phoneFocused ? 0.14 : 0,
                      shadowRadius: 16,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: phoneFocused ? 4 : 0,
                    },
                  ]}
                >
                  <Text
                    style={[styles.countryCode, { color: surface.textPrimary }]}
                  >
                    +91
                  </Text>
                  <View style={[styles.countryDivider, { backgroundColor: surface.border }]} />
                  <TextInput
                    value={phoneDigits}
                    onChangeText={(txt) =>
                      setPhoneDigits(txt.replace(/\D/g, '').slice(0, 10))
                    }
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                    placeholder={t.phonePlaceholder}
                    placeholderTextColor={surface.textMuted}
                    keyboardType="phone-pad"
                    maxLength={10}
                    returnKeyType="done"
                    onSubmitEditing={handleSendOtp}
                    style={[styles.input, { color: surface.textPrimary }]}
                    accessibilityLabel={t.phoneLabel}
                  />
                  {phoneDigits.length === 10 && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={BRAND_COLORS.electricGreenLight}
                    />
                  )}
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

                <Pressable
                  onPress={() => setOtpFocused(true)}
                  style={styles.otpBoxesWrap}
                >
                  <View
                    style={[
                      styles.otpBoxesRow,
                      errorMsg !== null && styles.otpBoxesError,
                    ]}
                    pointerEvents="none"
                  >
                    {Array.from({ length: 6 }).map((_, i) => {
                      const digit = otpDigits[i];
                      const isActive = otpFocused && otpDigits.length === i;
                      return (
                        <View
                          key={i}
                          style={[
                            styles.otpBox,
                            {
                              backgroundColor: surface.surface2,
                              borderColor:
                                isActive
                                  ? BRAND_COLORS.goldenYellow
                                  : digit
                                    ? surface.borderStrong
                                    : surface.border,
                              borderWidth: isActive ? 1.5 : 1,
                            },
                          ]}
                        >
                          {digit ? (
                            <Text
                              style={[
                                styles.otpBoxText,
                                { color: surface.textPrimary },
                              ]}
                            >
                              {digit}
                            </Text>
                          ) : isActive ? (
                            <View style={[styles.otpCursor, { backgroundColor: BRAND_COLORS.goldenYellow }]} />
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                  {/* Hidden single input keeps SMS autofill, paste and keyboard
                      behavior intact; the boxes above are purely visual. */}
                  <TextInput
                    value={otpDigits}
                    onChangeText={handleOtpChange}
                    keyboardType="number-pad"
                    maxLength={6}
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    returnKeyType="done"
                    onFocus={() => setOtpFocused(true)}
                    onBlur={() => setOtpFocused(false)}
                    style={styles.otpHiddenInput}
                    accessibilityLabel={t.otpLabel}
                  />
                </Pressable>

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

          <View style={styles.trustRow}>
            <View style={styles.trustChip}>
              <Ionicons name="shield-checkmark" size={13} color={BRAND_COLORS.goldenYellow} />
              <Text style={styles.trustChipText}>100% Secure</Text>
            </View>
            <View style={styles.trustChip}>
              <Ionicons name="flash" size={13} color={BRAND_COLORS.goldenYellow} />
              <Text style={styles.trustChipText}>Live ETA</Text>
            </View>
            <View style={styles.trustChip}>
              <Ionicons name="cash-outline" size={13} color={BRAND_COLORS.goldenYellow} />
              <Text style={styles.trustChipText}>COD Available</Text>
            </View>
          </View>

          <Text style={[styles.consentText, { color: '#94A3B8' }]}>
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
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
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
  masterLogo: {
    width: 210,
    height: 78,
    alignSelf: 'flex-start',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACING.xs,
  },
  brandName: {
    color: BRAND_COLORS.goldenYellow,
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  brandDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(248,249,250,0.5)',
  },
  brandTag: {
    color: '#94A3B8',
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '600',
    letterSpacing: 0.3,
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
    borderRadius: RADII.xl,
    borderWidth: 1,
    gap: SPACING.md,
    shadowColor: BRAND_COLORS.goldenYellow,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  trustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  trustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,199,3,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,199,3,0.30)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: 999,
  },
  trustChipText: {
    color: BRAND_COLORS.goldenYellow,
    fontSize: 12,
    fontWeight: '700',
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
    borderRadius: RADII.lg,
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
  otpBoxesWrap: {
    position: 'relative',
    minHeight: 58,
    justifyContent: 'center',
  },
  otpBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.xs,
  },
  otpBoxesError: { opacity: 0.75 },
  otpBox: {
    flex: 1,
    height: 58,
    borderRadius: RADII.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxText: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '800',
  },
  otpCursor: {
    width: 2,
    height: 24,
    borderRadius: 1,
    opacity: 0.9,
  },
  otpHiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 58,
    opacity: 0,
    fontSize: 16,
  },
  countryDivider: {
    width: 1,
    height: 22,
    marginHorizontal: SPACING.sm,
  },
  phoneCheck: { marginRight: SPACING.sm },
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
