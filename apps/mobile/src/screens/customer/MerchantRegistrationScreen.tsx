/**
 * Merchant Registration — self-service onboarding (Stitch: merchant_setup_dukan_kyc_gst
 * pattern + role_detail_workspace_switch_merchant_mode). Reached from the customer
 * profile business banner. Creates merchant + store (037 register_as_merchant RPC,
 * server sets owner = auth.uid()) and grants the merchant persona — the user then
 * lands in the Merchant workspace via the root role switch. Same login, no new account.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { LinearGradient } from 'expo-linear-gradient';
import {
  BRAND_COLORS,
  BRAND_GRADIENTS,
  RADII,
  SPACING,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { useAppStore } from '@/store/useAppStore';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';

interface MerchantRegistrationScreenProps {
  navigation: NativeStackNavigationProp<CustomerStackParamList, 'MerchantRegister'>;
}

type Zone = { id: string; name: string; city: string };

export const MerchantRegistrationScreen: React.FC<MerchantRegistrationScreenProps> = ({
  navigation,
}) => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const userId = useAppStore((s) => s.userId);
  const phone = useAppStore((s) => s.phone);
  const setRole = useAppStore((s) => s.setRole);
  const dark = colorScheme === 'dark';
  const surface = dark ? SURFACE_DARK : SURFACE_LIGHT;

  const [businessName, setBusinessName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [phoneText, setPhoneText] = useState(phone ?? '');
  const [addressText, setAddressText] = useState('');
  const [pincode, setPincode] = useState('');
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void (async () => {
      const { data } = await supabase
        .from('service_zones')
        .select('id, name, city')
        .eq('is_active', true)
        .order('name');
      if (data && data.length > 0) {
        setZones(data as Zone[]);
        setZoneId((data[0] as Zone).id);
      }
    })();
  }, []);

  const canSubmit = useMemo(
    () =>
      !submitting &&
      !done &&
      businessName.trim().length >= 3 &&
      storeName.trim().length >= 3 &&
      phoneText.trim().length >= 10 &&
      addressText.trim().length >= 5 &&
      /^[0-9]{6}$/.test(pincode.trim()) &&
      zoneId !== null,
    [submitting, done, businessName, storeName, phoneText, addressText, pincode, zoneId],
  );

  const submit = async () => {
    if (!canSubmit || !userId || !isSupabaseConfigured()) return;
    setSubmitting(true);
    setErrorText(null);
    try {
      const { data, error } = await supabase.rpc('register_as_merchant', {
        p_business_name: businessName.trim(),
        p_store_name: storeName.trim(),
        p_phone: phoneText.trim(),
        p_zone_id: zoneId,
        p_address_line1: addressText.trim(),
        p_pincode: pincode.trim(),
      });
      if (error) {
        setErrorText(error.message);
        return;
      }
      const res = (data ?? {}) as { ok?: boolean; existing?: boolean };
      if (!res.ok) {
        setErrorText('Registration nahi ho payi — dobara try karo.');
        return;
      }
      // Auto-queue seller verification (043 pipeline) — office review sets
      // merchants.kyc_status='verified' on approval. Fire-and-forget: a failed
      // queue must not block the persona switch (admin can also see merchants).
      try {
        await supabase.rpc('submit_verification_request', {
          p_kind: 'seller',
          p_display_name: businessName.trim(),
          p_phone: phoneText.trim(),
          p_payload: {
            business_name: businessName.trim(),
            city: 'Makrana',
          },
          p_note: `Store: ${storeName.trim()} · ${addressText.trim()}`,
        });
      } catch {
        // duplicate-pending is fine (re-register case) — ignore
      }
      setDone(true);
      // Persona granted server-side → flip workspace root (same login, same account)
      setRole('merchant');
    } finally {
      setSubmitting(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    opts?: { keyboardType?: 'default' | 'numeric' | 'phone-pad'; multiline?: boolean },
  ) => (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: surface.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={surface.textMuted}
        keyboardType={opts?.keyboardType ?? 'default'}
        multiline={opts?.multiline}
        style={[
          styles.fieldInput,
          { backgroundColor: surface.surface1, color: surface.textPrimary, borderColor: surface.border },
        ]}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: surface.canvasLowest }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Header */}
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={surface.textPrimary} />
            <Text style={[styles.backText, { color: surface.textPrimary }]}>Wapas</Text>
          </Pressable>

          {/* Hero */}
          <LinearGradient colors={[...BRAND_GRADIENTS.goldWarm]} style={styles.hero}>
            <Ionicons name="storefront-outline" size={30} color={BRAND_COLORS.charcoalBlack} />
            <Text style={styles.heroTitle}>Merchant / Seller Registration</Text>
            <Text style={styles.heroSub}>
              Apni dukaan ya service Zaff-It se connect karo — same account, ek tap me
              Customer ↔ Business switch
            </Text>
          </LinearGradient>

          {done ? (
            <View style={[styles.doneCard, { backgroundColor: surface.surface1 }]}>
              <Ionicons name="checkmark-done-circle-outline" size={40} color={BRAND_COLORS.electricGreen} />
              <Text style={[styles.doneTitle, { color: surface.textPrimary }]}>
                Welcome, Business Partner! 🎉
              </Text>
              <Text style={[styles.doneSub, { color: surface.textSecondary }]}>
                Aapka merchant account ban gaya. Ab Merchant workspace khul raha hai —
                Store tab me jaake apni dukaan details complete karo aur "OPEN" karo.
              </Text>
              <Text style={[styles.doneNote, { color: surface.textMuted }]}>
                KYC verification baad me admin karega — tab tak aap apna store manage kar
                sakte ho.
              </Text>
            </View>
          ) : (
            <>
              {/* Form */}
              {field('Business ka naam *', businessName, setBusinessName, 'Jaise: Aslam Kirana & General Store')}
              {field('Store ka naam (app me dikhega) *', storeName, setStoreName, 'Jaise: Makrana 10M Express')}
              {field('Business phone *', phoneText, setPhoneText, '+91 98290 12345', { keyboardType: 'phone-pad' })}
              {field('Store address *', addressText, setAddressText, 'Shop 14, Al-Madina Market, Station Road', { multiline: true })}

              <View style={styles.fieldWrap}>
                <Text style={[styles.fieldLabel, { color: surface.textMuted }]}>Area / Zone *</Text>
                <View style={styles.zoneRow}>
                  {zones.length === 0 && (
                    <Text style={[styles.zoneEmpty, { color: surface.textMuted }]}>Zones load ho rahe hain…</Text>
                  )}
                  {zones.map((z) => {
                    const active = zoneId === z.id;
                    return (
                      <Pressable
                        key={z.id}
                        onPress={() => setZoneId(z.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={[
                          styles.zoneChip,
                          {
                            backgroundColor: active ? BRAND_COLORS.charcoalBlack : surface.surface1,
                            borderColor: active ? BRAND_COLORS.charcoalBlack : surface.border,
                          },
                        ]}
                      >
                        <Ionicons
                          name="location-outline"
                          size={13}
                          color={active ? BRAND_COLORS.goldenYellow : surface.textMuted}
                        />
                        <Text
                          style={[
                            styles.zoneText,
                            { color: active ? BRAND_COLORS.goldenYellow : surface.textPrimary },
                          ]}
                        >
                          {z.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {field('Pincode *', pincode, setPincode, '341501', { keyboardType: 'numeric' })}

              {errorText && (
                <View style={[styles.errorCard, { backgroundColor: surface.surface1 }]}>
                  <Ionicons name="alert-circle-outline" size={16} color={BRAND_COLORS.goldenYellow} />
                  <Text style={[styles.errorText, { color: surface.textSecondary }]}>{errorText}</Text>
                </View>
              )}

              {/* CTA */}
              <Pressable
                onPress={() => void submit()}
                disabled={!canSubmit}
                style={[styles.ctaBtn, { opacity: canSubmit ? 1 : 0.5 }]}
              >
                {submitting ? (
                  <ActivityIndicator color={BRAND_COLORS.charcoalBlack} />
                ) : (
                  <>
                    <Ionicons name="business-outline" size={18} color={BRAND_COLORS.charcoalBlack} />
                    <Text style={styles.ctaText}>Register karo &amp; Merchant bano</Text>
                  </>
                )}
              </Pressable>
              <Text style={[styles.footNote, { color: surface.textMuted }]}>
                Registration FREE hai · Store "CLOSED" se start hota hai — details bhar ke
                jab chahe OPEN karo · KYC admin verify karega
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: SPACING.xxl },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginHorizontal: SPACING.screenPadding,
    marginTop: SPACING.md,
    alignSelf: 'flex-start',
  },
  backText: { ...TYPOGRAPHY.labelLg },
  hero: {
    marginHorizontal: SPACING.screenPadding,
    marginTop: SPACING.md,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    gap: SPACING.xs,
  },
  heroTitle: { ...TYPOGRAPHY.headlineMd, color: BRAND_COLORS.charcoalBlack },
  heroSub: {
    ...TYPOGRAPHY.bodySm,
    color: BRAND_COLORS.charcoalBlack,
    opacity: 0.8,
    lineHeight: 19,
  },
  fieldWrap: { marginTop: SPACING.lg, marginHorizontal: SPACING.screenPadding },
  fieldLabel: { ...TYPOGRAPHY.labelMd, marginBottom: SPACING.xs },
  fieldInput: {
    borderRadius: RADII.md,
    borderWidth: 1,
    padding: SPACING.md,
    ...TYPOGRAPHY.bodyMd,
  },
  zoneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  zoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADII.full,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  zoneText: { ...TYPOGRAPHY.labelMd },
  zoneEmpty: { ...TYPOGRAPHY.bodySm },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginHorizontal: SPACING.screenPadding,
    marginTop: SPACING.md,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  errorText: { ...TYPOGRAPHY.bodySm, flex: 1 },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: BRAND_COLORS.goldenYellow,
    marginHorizontal: SPACING.screenPadding,
    marginTop: SPACING.xl,
    borderRadius: RADII.full,
    paddingVertical: SPACING.lg,
  },
  ctaText: { ...TYPOGRAPHY.labelLg, color: BRAND_COLORS.charcoalBlack },
  footNote: {
    ...TYPOGRAPHY.bodySm,
    marginHorizontal: SPACING.screenPadding,
    marginTop: SPACING.md,
    lineHeight: 18,
    textAlign: 'center',
  },
  doneCard: {
    marginHorizontal: SPACING.screenPadding,
    marginTop: SPACING.lg,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  doneTitle: { ...TYPOGRAPHY.titleMd },
  doneSub: { ...TYPOGRAPHY.bodySm, lineHeight: 19, textAlign: 'center' },
  doneNote: { ...TYPOGRAPHY.bodySm, textAlign: 'center' },
});

export default MerchantRegistrationScreen;
