import React, { useCallback, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';
import { BRAND_COLORS, RADII, SURFACE_DARK, SURFACE_LIGHT, TYPOGRAPHY } from '@zaff-it/shared/tokens';
import { useAppStore } from '@/store/useAppStore';
import { getTranslation } from '@/i18n/translations';
import { isSupabaseConfigured, supabase } from '@/services/supabase';

interface ReferralSummary {
  code: string;
  completed: number;
  pending: number;
  earned_coins: number;
  next_milestone: string;
  tiers: { l2: boolean; l3: boolean; l4: boolean };
}

interface RewardRow {
  id: string;
  status: string;
  reward_referrer_coins: number;
  created_at: string;
}

/**
 * W4a Invite & Earn — Stitch whatsapp_referral_invite_modal design.
 * Doc-honest values: 50/50 first-order (Rs50 = 500 coins each), ladder
 * L2 5 invites -> 1 month Pro, L3 10 -> +Rs100 + Pro, L4 25 -> Zaff Star.
 * No lucky-draw tickets (not in the master doc — no fake promises).
 */
export const InviteScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const colorScheme = useAppStore((s) => s.colorScheme);
  const t = getTranslation(useAppStore((s) => s.language));
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setErrorMsg('Demo mode — live data load nahi hoga');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc('my_referral_summary');
      if (error || !data) {
        setErrorMsg(error?.message ?? t.errorGeneric);
      } else {
        setSummary(data as unknown as ReferralSummary);
      }

      const { data: rows } = await supabase
        .from('referrals')
        .select('id, status, reward_referrer_coins, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      setRewards((rows ?? []) as unknown as RewardRow[]);
    } catch {
      setErrorMsg(t.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [t.errorGeneric]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const shareMessage = summary
    ? `Zaff-IT se order karo — mere code ${summary.code} use karke pehle order par ₹50 wallet coins pao. Main bhi ₹50 paaunga! 🎁`
    : '';

  const handleCopy = useCallback(async () => {
    if (!summary) return;
    try {
      await Share.share({ message: `Mera Zaff-IT referral code: ${summary.code}` });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // share sheet dismissed
    }
  }, [summary]);

  const handleWhatsApp = useCallback(() => {
    if (!summary) return;
    const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    void Linking.openURL(url);
  }, [summary, shareMessage]);

  const handleSms = useCallback(() => {
    if (!summary) return;
    const url = `sms:?body=${encodeURIComponent(shareMessage)}`;
    void Linking.openURL(url);
  }, [summary, shareMessage]);

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: surface.background }]}
      edges={['top', 'left', 'right']}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={surface.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>
          Invite & Earn
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {errorMsg !== null ? (
          <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <Text style={[styles.bodyText, { color: surface.textSecondary }]}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Gold hero — Gift 50, Get 50 */}
        <LinearGradient
          colors={['#FFD34D', '#FFC703', '#E0AE00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroBadge}>
            <Ionicons name="gift" size={13} color={BRAND_COLORS.charcoalBlack} />
            <Text style={styles.heroBadgeText}>DOSTO KE SAATH BADHO</Text>
          </View>
          <Text style={styles.heroTitle}>Gift ₹50, Get ₹50</Text>
          <Text style={styles.heroSub}>
            Dost ka pehla order deliver hone par dono ko ₹50 wallet coins —
            aur invites poore karo to Pro + rewards tak!
          </Text>

          {summary !== null ? (
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{summary.completed}</Text>
                <Text style={styles.heroStatLabel}>Joined</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>
                  ₹{Math.floor(summary.earned_coins / 10)}
                </Text>
                <Text style={styles.heroStatLabel}>Coins Earned</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Ionicons
                  name={summary.tiers.l4 ? 'ribbon' : 'trophy'}
                  size={18}
                  color={BRAND_COLORS.charcoalBlack}
                />
                <Text style={[styles.heroStatLabel, { marginTop: 3 }]}>
                  {summary.tiers.l4 ? 'Zaff Star' : summary.tiers.l3 ? 'L3 ✓' : summary.tiers.l2 ? 'Pro ✓' : 'Ladder'}
                </Text>
              </View>
            </View>
          ) : null}
        </LinearGradient>

        {/* Personal code */}
        <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
              Aapka Personalized Code
            </Text>
            <View style={styles.verifiedChip}>
              <Ionicons name="checkmark-circle" size={12} color={BRAND_COLORS.electricGreen} />
              <Text style={styles.verifiedChipText}>Verified</Text>
            </View>
          </View>
          <Text style={[styles.codeText, { color: surface.textPrimary }]}>
            {loading ? '…' : (summary?.code ?? '—')}
          </Text>
          <Text style={[styles.bodyText, { color: surface.textMuted }]}>
            {summary?.next_milestone ?? ''}
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <Pressable
              onPress={handleCopy}
              style={[styles.actionBtnSolid, { opacity: summary ? 1 : 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel="Share referral code"
            >
              <Ionicons
                name={copied ? 'checkmark' : 'copy'}
                size={16}
                color={BRAND_COLORS.charcoalBlack}
              />
              <Text style={styles.actionBtnSolidText}>
                {copied ? 'Shared' : 'Share Code'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Share channels */}
        <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
          <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
            Bhejo apne dosto ko
          </Text>
          <Pressable
            onPress={handleWhatsApp}
            disabled={!summary}
            style={[styles.waBtn, { opacity: summary ? 1 : 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="Share on WhatsApp"
          >
            <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
            <Text style={styles.waBtnText}>Share on WhatsApp</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable
              onPress={handleSms}
              disabled={!summary}
              style={[styles.chipBtn, { borderColor: surface.border, opacity: summary ? 1 : 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel="Share via SMS"
            >
              <Ionicons name="chatbubble-ellipses" size={16} color={surface.textPrimary} />
              <Text style={[styles.chipBtnText, { color: surface.textPrimary }]}>SMS</Text>
            </Pressable>
            <Pressable
              onPress={handleCopy}
              disabled={!summary}
              style={[styles.chipBtn, { borderColor: surface.border, opacity: summary ? 1 : 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel="Copy code"
            >
              <Ionicons name="copy" size={16} color={surface.textPrimary} />
              <Text style={[styles.chipBtnText, { color: surface.textPrimary }]}>Copy</Text>
            </Pressable>
          </View>
        </View>

        {/* How it works */}
        <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
          <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
            How It Works — 3 Steps
          </Text>
          {[
            { n: '1', t: 'Code share karo', d: 'WhatsApp/SMS se apna code dosto ko bhejo.' },
            { n: '2', t: 'Woh order karte hain', d: 'Dost signup ke baad apply kare aur pehla order deliver ho.' },
            { n: '3', t: 'Dono ko ₹50', d: 'Wallet coins auto-credit (90 din valid) + ladder rewards.' },
          ].map((step) => (
            <View key={step.n} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{step.n}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepTitle, { color: surface.textPrimary }]}>{step.t}</Text>
                <Text style={[styles.bodyText, { color: surface.textMuted }]}>{step.d}</Text>
              </View>
            </View>
          ))}
          <Text style={[styles.bodyText, { color: surface.textMuted, marginTop: 8 }]}>
            Ladder: 5 invites = 1 month Pro · 10 = +₹100 & Pro · 25 = Zaff Star badge.
            Ek device se sirf ek referral.
          </Text>
        </View>

        {/* Recent rewards */}
        {rewards.length > 0 ? (
          <View style={[styles.card, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
            <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
              Aapka Recent Reward Record
            </Text>
            {rewards.map((r) => (
              <View key={r.id} style={styles.rewardRow}>
                <View style={[styles.rewardAvatar, { backgroundColor: surface.surface2 }]}>
                  <Ionicons name="person" size={14} color={surface.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rewardTitle, { color: surface.textPrimary }]}>
                    {r.status === 'rewarded' ? 'First order delivered' : 'Code applied — pehla order pending'}
                  </Text>
                  <Text style={[styles.bodyText, { color: surface.textMuted }]}>
                    {new Date(r.created_at).toLocaleDateString('en-IN')}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.rewardCoins,
                    { color: r.reward_referrer_coins > 0 ? BRAND_COLORS.electricGreen : surface.textMuted },
                  ]}
                >
                  {r.reward_referrer_coins > 0 ? `+${r.reward_referrer_coins}` : '+₹50 soon'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
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
  hero: {
    borderRadius: RADII.lg,
    padding: 18,
    gap: 8,
  },
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
  heroTitle: { fontSize: 26, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  heroSub: { fontSize: TYPOGRAPHY.bodySm.fontSize, color: BRAND_COLORS.charcoalBlack, opacity: 0.85 },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: RADII.md,
    paddingVertical: 10,
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(0,0,0,0.15)' },
  heroStatValue: { fontSize: TYPOGRAPHY.headlineMd.fontSize, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  heroStatLabel: { fontSize: 10, fontWeight: '700', color: BRAND_COLORS.charcoalBlack, marginTop: 2 },
  card: { borderRadius: RADII.lg, borderWidth: 1, padding: 14 },
  sectionTitle: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900' },
  bodyText: { fontSize: TYPOGRAPHY.bodySm.fontSize, marginTop: 2 },
  verifiedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(30,215,96,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  verifiedChipText: { fontSize: 10, fontWeight: '800', color: BRAND_COLORS.electricGreen },
  codeText: { fontSize: 28, fontWeight: '900', letterSpacing: 2, marginTop: 8 },
  actionBtnSolid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: BRAND_COLORS.goldenYellow,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: RADII.md,
    flex: 1,
  },
  actionBtnSolidText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    paddingVertical: 12,
    borderRadius: RADII.md,
  },
  waBtnText: { fontSize: TYPOGRAPHY.bodyMd.fontSize, fontWeight: '900', color: '#FFFFFF' },
  chipBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADII.md,
    borderWidth: 1,
  },
  chipBtnText: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '800' },
  stepRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: 12, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  stepTitle: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '800' },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  rewardAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rewardTitle: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '800' },
  rewardCoins: { fontSize: TYPOGRAPHY.bodySm.fontSize, fontWeight: '900' },
});
