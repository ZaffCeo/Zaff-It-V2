import React, { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';
import { BRAND_COLORS, RADII, SURFACE_DARK, SURFACE_LIGHT, TYPOGRAPHY } from '@zaff-it/shared/tokens';
import { useAppStore } from '@/store/useAppStore';
import { getTranslation } from '@/i18n/translations';
import { isSupabaseConfigured, supabase, SUPABASE_FUNCTIONS_URL } from '@/services/supabase';
import { openRazorpayCheckout } from '@/services/razorpayCheckout';

interface ProStatus {
  customer_pro_active: boolean;
  expires_at: string | null;
  source: string | null;
  intro_price_used: boolean;
  next_price_paise: number;
}

/**
 * W4b Zaff Pro — customer plan purchase (Razorpay, webhook-verified activation)
 * + Pro benefits already live in pricing engine (free delivery + free handling).
 * Seller/provider plans are shown honestly: purchase happens from their apps.
 */
export const ProScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const colorScheme = useAppStore((s) => s.colorScheme);
  const t = getTranslation(useAppStore((s) => s.language));
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [status, setStatus] = useState<ProStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setErrorMsg('Demo mode — live Pro status load nahi hoga');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('my_pro_status');
      if (error || !data) {
        setErrorMsg(error?.message ?? t.errorGeneric);
      } else {
        setStatus(data as unknown as ProStatus);
        setErrorMsg(null);
      }
    } catch {
      setErrorMsg(t.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [t.errorGeneric]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const pollActivation = useCallback(async () => {
    for (let i = 0; i < 6; i += 1) {
      await new Promise((r) => setTimeout(r, 5000));
      const { data } = await supabase.rpc('my_pro_status');
      const st = data as unknown as ProStatus | null;
      if (st?.customer_pro_active) {
        setStatus(st);
        setNotice('Zaff Pro activate ho gaya! Free delivery + free handling ab live hai.');
        return;
      }
    }
    setNotice(
      'Payment mil gaya — webhook verification ke baad Pro activate hoga (1-2 min). Screen dobara kholo ya refresh karo.',
    );
  }, []);

  const handleBuyCustomerPro = useCallback(async () => {
    if (buying || !isSupabaseConfigured()) return;
    if (Platform.OS !== 'web') {
      setNotice('Native Razorpay checkout EAS build ke baad aayega — filhaal web se purchase karo.');
      return;
    }
    setBuying(true);
    setNotice(null);
    setErrorMsg(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/checkout-create-pro-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: 'customer' }),
      });
      const json = (await res.json()) as {
        razorpay_order_id?: string;
        amount_paise?: number;
        receipt?: string;
        error?: { message?: string };
      };
      if (!res.ok || !json.razorpay_order_id) {
        setErrorMsg(json.error?.message ?? 'Pro order create nahi hua');
        return;
      }

      const result = await openRazorpayCheckout({
        razorpayOrderId: json.razorpay_order_id,
        amountPaise: json.amount_paise ?? 0,
        orderNumber: 'Zaff Pro',
      });

      if (result.outcome === 'success') {
        setNotice('Payment ho gaya — server-side verification ke baad Pro activate hoga…');
        void pollActivation();
      } else if (result.outcome === 'failed') {
        setErrorMsg(result.description ?? 'Payment fail hua');
      } else {
        setNotice('Payment cancel hua — jab chaho dobara try karo.');
      }
    } catch {
      setErrorMsg(t.errorGeneric);
    } finally {
      setBuying(false);
    }
  }, [buying, pollActivation, t.errorGeneric]);

  const plans = [
    {
      id: 'customer' as const,
      icon: 'person' as const,
      title: 'Zaff Pro Customer',
      price:
        status && !status.intro_price_used && !status.customer_pro_active
          ? '₹99 / month'
          : '₹49 pehla month',
      sub: 'Iske baad ₹99/month',
      perks: ['Har order pe FREE delivery', 'Handling fee ₹0', 'Priority support queue'],
      buyable: true,
    },
    {
      id: 'seller' as const,
      icon: 'storefront' as const,
      title: 'Zaff Pro Seller',
      price: '₹199 / month',
      sub: 'Dukan ke liye',
      perks: ['Per-order fee nahi', 'Merchant app se purchase hoga'],
      buyable: false,
    },
    {
      id: 'provider' as const,
      icon: 'construct' as const,
      title: 'Zaff Pro Provider',
      price: '₹199 / month',
      sub: 'Service pros ke liye',
      perks: ['Per-job commission nahi', 'Provider app se purchase hoga'],
      buyable: false,
    },
  ];

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: surface.background }]}
      edges={['top', 'left', 'right']}
    >
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={surface.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>Zaff Pro</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#FFD34D', '#FFC703', '#E0AE00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroBadge}>
            <Ionicons name="shield-checkmark" size={13} color={BRAND_COLORS.charcoalBlack} />
            <Text style={styles.heroBadgeText}>MEMBERSHIP</Text>
          </View>
          <Text style={styles.heroTitle}>
            {status?.customer_pro_active ? 'Aap Zaff Pro member ho! 🎉' : 'Zaff Pro lo — fees bhool jao'}
          </Text>
          <Text style={styles.heroSub}>
            {status?.customer_pro_active
              ? `Valid till ${status.expires_at ? new Date(status.expires_at).toLocaleDateString('en-IN') : '—'} · Free delivery + ₹0 handling har order pe`
              : 'Har order pe free delivery aur free handling — ek monthly plan mein.'}
          </Text>
        </LinearGradient>

        {errorMsg !== null ? (
          <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <Text style={[styles.bodyText, { color: surface.textSecondary }]}>{errorMsg}</Text>
          </View>
        ) : null}

        {notice !== null ? (
          <View
            style={[
              styles.card,
              { backgroundColor: surface.surface1, borderColor: BRAND_COLORS.electricGreen },
            ]}
          >
            <Text style={[styles.bodyText, { color: BRAND_COLORS.electricGreen, fontWeight: '700' }]}>
              {notice}
            </Text>
          </View>
        ) : null}

        {plans.map((plan) => (
          <View
            key={plan.id}
            style={[
              styles.card,
              {
                backgroundColor: surface.surface1,
                borderColor: plan.buyable ? BRAND_COLORS.goldenYellow : surface.border,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={[
                  styles.planIcon,
                  { backgroundColor: plan.buyable ? BRAND_COLORS.goldenYellow : surface.surface2 },
                ]}
              >
                <Ionicons
                  name={plan.icon}
                  size={18}
                  color={plan.buyable ? BRAND_COLORS.charcoalBlack : surface.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.planTitle, { color: surface.textPrimary }]}>{plan.title}</Text>
                <Text style={[styles.bodyText, { color: surface.textMuted }]}>{plan.sub}</Text>
              </View>
              <Text style={[styles.planPrice, { color: surface.textPrimary }]}>{plan.price}</Text>
            </View>

            {plan.perks.map((perk) => (
              <View key={perk} style={styles.perkRow}>
                <Ionicons name="checkmark-circle" size={14} color={BRAND_COLORS.electricGreen} />
                <Text style={[styles.bodyText, { color: surface.textSecondary, marginTop: 0 }]}>
                  {perk}
                </Text>
              </View>
            ))}

            {plan.buyable ? (
              <Pressable
                onPress={handleBuyCustomerPro}
                disabled={buying || loading || status?.customer_pro_active === true}
                style={[
                  styles.buyBtn,
                  {
                    opacity:
                      buying || loading || status?.customer_pro_active === true ? 0.55 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Buy Zaff Pro customer membership"
              >
                <Text style={styles.buyBtnText}>
                  {status?.customer_pro_active
                    ? 'Pro ACTIVE'
                    : buying
                      ? 'Razorpay khul raha hai…'
                      : loading
                        ? '…'
                        : 'Pro lo — Razorpay se pay karo'}
                </Text>
              </Pressable>
            ) : (
              <Text style={[styles.bodyText, { color: surface.textMuted, marginTop: 8 }]}>
                Purchase us role ki app se hota hai — yahan sirf price transparent hai.
              </Text>
            )}
          </View>
        ))}

        <Text style={[styles.bodyText, { color: surface.textMuted, paddingHorizontal: 4 }]}>
          Payment confirmation sirf server-side webhook se hoti hai — popup success signal hai,
          proof nahi. Pro activate hone pe free delivery + ₹0 handling checkout mein auto-apply.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: TYPOGRAPHY.headlineMd.fontSize, fontWeight: '900' },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  hero: { borderRadius: RADII.lg, padding: 18, gap: 8 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  heroBadgeText: { fontSize: 10, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  heroTitle: { fontSize: 24, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  heroSub: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: BRAND_COLORS.charcoalBlack,
    opacity: 0.85,
  },
  card: { borderRadius: RADII.lg, borderWidth: 1, padding: 14 },
  bodyText: { fontSize: TYPOGRAPHY.bodySm.fontSize, marginTop: 2 },
  planIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900' },
  planPrice: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900' },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingLeft: 2 },
  buyBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.charcoalBlack,
    alignItems: 'center',
  },
  buyBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: TYPOGRAPHY.bodySm.fontSize },
});
