/**
 * Z-Coins Wallet • ZAFF-IT loyalty wallet
 *
 * Stitch source screens: z_coins_rewards_wallet, z_coins_level_tier_status,
 * how_z_coins_work_faq_guide, zaff_vip_benefits_giveaways.
 * Brand palette: Cyber-Gold #FFC703 on charcoal #121316, fresh-green accents.
 *
 * MVP note: coins state is client-side (demo) until a wallet_ledger table
 * ships; earn rules below mirror the Stitch blueprint (1 coin / ₹10 spent,
 * review bonus, referral bonus).
 */
import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale } from '@/components/ui/PremiumKit';
import {
  BRAND_COLORS,
  STATUS_COLORS,
  SURFACE_DARK,
  SURFACE_LIGHT,
} from '@zaff-it/shared/tokens';
import { useAppStore } from '@/store/useAppStore';

type LedgerEntry = {
  id: string;
  kind: 'earn' | 'redeem';
  label: string;
  coins: number;
  when: string;
};

const TIERS = [
  { name: 'Silver', min: 0, icon: 'shield-outline' as const },
  { name: 'Gold', min: 500, icon: 'diamond-outline' as const },
  { name: 'Kohinoor', min: 2000, icon: 'trophy-outline' as const },
];

const REDEMPTIONS = [
  { id: 'r10', label: '₹10 OFF', sub: 'Any order', coins: 100 },
  { id: 'fdel', label: 'FREE Delivery', sub: 'Next 3 orders', coins: 150 },
  { id: 'r50', label: '₹50 OFF', sub: 'Orders ₹299+', coins: 450 },
  { id: 'vip', label: 'VIP Fast Pass', sub: 'Priority runner, 1 day', coins: 800 },
];

const HOW_IT_WORKS = [
  { q: 'Kaise kamayein Z-Coins?', a: 'Har ₹10 ke kharch par 1 coin, order deliver hone ke baad auto-credit. Review + photo proof = bonus coins.' },
  { q: 'Kahan use karein?', a: 'Checkout par Z-Coin discount toggle se turant kaatein — COD orders par bhi valid.' },
  { q: 'Coins expire hote hain?', a: 'Earned coins 12 mahine tak valid. Gold tier (500+) members ke liye 18 mahine.' },
  { q: 'VIP Club kya hai?', a: '2000+ coins = Kohinoor tier: free delivery hamesha, priority runner aur 24/7 concierge hotline.' },
];

const SEED_LEDGER: LedgerEntry[] = [
  { id: 'e1', kind: 'earn', label: 'Order #ZAF-84291 delivered', coins: 42, when: 'Today · 11:20 AM' },
  { id: 'e2', kind: 'earn', label: 'Photo review bonus', coins: 15, when: 'Today · 11:21 AM' },
  { id: 'e3', kind: 'earn', label: 'Order #ZAF-84105 delivered', coins: 68, when: 'Yesterday · 7:45 PM' },
  { id: 'e4', kind: 'earn', label: 'Referral — Suresh joined', coins: 100, when: 'Mon · 9:12 AM' },
  { id: 'e5', kind: 'redeem', label: '₹10 OFF redeemed', coins: -100, when: 'Sun · 6:30 PM' },
];

export const WalletScreen: React.FC = () => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const dark = colorScheme === 'dark';
  const surface = dark ? SURFACE_DARK : SURFACE_LIGHT;

  const [balance, setBalance] = useState(425);
  const [ledger, setLedger] = useState<LedgerEntry[]>(SEED_LEDGER);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [toast, setToast] = useState<string | null>(null);

  const tier = useMemo(() => {
    let current = TIERS[0];
    for (const t of TIERS) if (balance >= t.min) current = t;
    const next = TIERS[TIERS.indexOf(current) + 1] ?? null;
    const progress = next
      ? Math.min(1, (balance - current.min) / (next.min - current.min))
      : 1;
    return { current, next, progress };
  }, [balance]);

  const redeem = (r: (typeof REDEMPTIONS)[number]) => {
    if (balance < r.coins) {
      setToast(`Sirf ${r.coins - balance} coins aur chahiye ${r.label} ke liye`);
      return;
    }
    setBalance((b) => b - r.coins);
    setLedger((l) => [
      { id: `rd${Date.now()}`, kind: 'redeem', label: `${r.label} redeemed`, coins: -r.coins, when: 'Just now' },
      ...l,
    ]);
    setToast(`${r.label} applied! Checkout par auto-use hoga.`);
  };

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: surface.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>
          Z-Coins Wallet
        </Text>
        <View style={styles.headerChip}>
          <Ionicons name="help-circle-outline" size={14} color={BRAND_COLORS.charcoalBlack} />
          <Text style={styles.headerChipText}>1 coin = ₹1 value</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero coin card — charcoal base, cyber-gold glow */}
        <LinearGradient
          colors={['#121316', '#2A2110', '#4A3A08']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.coinRing}>
            <Image
              source={require('../../../assets/zaffcoin.png')}
              style={styles.coinFaceImage}
              resizeMode="contain"
              accessibilityLabel="ZaffCoin"
            />
          </View>
          <View style={styles.heroRight}>
            <Text style={styles.heroLabel}>Z-COIN BALANCE</Text>
            <Text style={styles.heroBalance}>{balance}</Text>
            <Text style={styles.heroSub}>+1 coin per ₹10 · auto-credit on delivery</Text>
          </View>
        </LinearGradient>

        {/* Tier progress */}
        <View style={[styles.card, { backgroundColor: surface.surface1 }]}>
          <View style={styles.tierRow}>
            <Ionicons name={tier.current.icon} size={18} color={BRAND_COLORS.goldenYellowPressed} />
            <Text style={[styles.tierTitle, { color: surface.textPrimary }]}>
              {tier.current.name} Tier
            </Text>
            {tier.next && (
              <Text style={[styles.tierNext, { color: surface.textMuted }]}>
                {(tier.next.min - balance).toLocaleString('en-IN')} coins → {tier.next.name}
              </Text>
            )}
          </View>
          <View style={[styles.tierTrack, { backgroundColor: surface.surface3 }]}>
            <View
              style={[
                styles.tierFill,
                {
                  width: `${Math.max(6, Math.round(tier.progress * 100))}%`,
                  backgroundColor: BRAND_COLORS.goldenYellow,
                },
              ]}
            />
          </View>
          <View style={styles.tierLegend}>
            {TIERS.map((t) => (
              <Text
                key={t.name}
                style={[
                  styles.tierLegendText,
                  { color: balance >= t.min ? BRAND_COLORS.goldenYellowPressed : surface.textMuted },
                ]}
              >
                {t.name} {t.min > 0 ? `• ${t.min}+` : ''}
              </Text>
            ))}
          </View>
        </View>

        {/* Rewards redemption grid */}
        <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
          Redeem Rewards
        </Text>
        <View style={styles.rewardsGrid}>
          {REDEMPTIONS.map((r) => {
            const affordable = balance >= r.coins;
            return (
              <PressableScale
                key={r.id}
                onPress={() => redeem(r)}
                style={[
                  styles.rewardCard,
                  {
                    backgroundColor: surface.surface1,
                    borderColor: affordable ? BRAND_COLORS.goldenYellow : surface.border,
                  },
                ]}
              >
                <Text style={[styles.rewardLabel, { color: surface.textPrimary }]}>{r.label}</Text>
                <Text style={[styles.rewardSub, { color: surface.textMuted }]}>{r.sub}</Text>
                <View
                  style={[
                    styles.rewardCoinTag,
                    { backgroundColor: affordable ? BRAND_COLORS.goldenYellow : surface.surface3 },
                  ]}
                >
                  <View style={styles.rewardCoinInner}>
                    <Image
                      source={require('../../../assets/zaffcoin.png')}
                      style={styles.miniCoinIcon}
                      resizeMode="contain"
                    />
                    <Text
                      style={[
                        styles.rewardCoinText,
                        { color: affordable ? BRAND_COLORS.charcoalBlack : surface.textMuted },
                      ]}
                    >
                      {r.coins}
                    </Text>
                  </View>
                </View>
              </PressableScale>
            );
          })}
        </View>

        {/* Passbook */}
        <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
          Passbook — Live Statement
        </Text>
        <View style={[styles.card, { backgroundColor: surface.surface1 }]}>
          {ledger.slice(0, 8).map((e, i) => (
            <View
              key={e.id}
              style={[
                styles.ledgerRow,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: surface.border },
              ]}
            >
              <Ionicons
                name={e.kind === 'earn' ? 'add-circle' : 'remove-circle'}
                size={22}
                color={e.kind === 'earn' ? STATUS_COLORS.successBright : BRAND_COLORS.goldenYellowPressed}
              />
              <View style={styles.ledgerMid}>
                <Text style={[styles.ledgerLabel, { color: surface.textPrimary }]} numberOfLines={1}>
                  {e.label}
                </Text>
                <Text style={[styles.ledgerWhen, { color: surface.textMuted }]}>{e.when}</Text>
              </View>
              <Text
                style={[
                  styles.ledgerCoins,
                  { color: e.kind === 'earn' ? STATUS_COLORS.successTextLight : BRAND_COLORS.goldenYellowPressed },
                ]}
              >
                {e.coins > 0 ? '+' : ''}
                {e.coins}
              </Text>
            </View>
          ))}
        </View>

        {/* How Z-Coins work FAQ */}
        <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
          How Z-Coins Work
        </Text>
        <View style={[styles.card, { backgroundColor: surface.surface1 }]}>
          {HOW_IT_WORKS.map((f, i) => (
            <View key={f.q} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: surface.border } : null}>
              <PressableScale onPress={() => setOpenFaq(openFaq === i ? null : i)} haptic={false}>
                <View style={styles.faqRow}>
                  <Text style={[styles.faqQ, { color: surface.textPrimary }]}>{f.q}</Text>
                  <Ionicons
                    name={openFaq === i ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={surface.textMuted}
                  />
                </View>
                {openFaq === i && (
                  <Text style={[styles.faqA, { color: surface.textSecondary }]}>{f.a}</Text>
                )}
              </PressableScale>
            </View>
          ))}
        </View>

        <Text style={[styles.footNote, { color: surface.textMuted }]}>
          Z-Coins ledger DB table Phase-2 me aayega — filhal demo balance hai.
        </Text>
      </ScrollView>

      {/* Toast */}
      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: 0.2 },
  headerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND_COLORS.goldenYellow,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  headerChipText: { fontSize: 11, fontWeight: '700', color: BRAND_COLORS.charcoalBlack },
  scroll: { paddingBottom: 96 },
  hero: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: BRAND_COLORS.goldenYellow,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  coinRing: {
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,199,3,0.25)',
  },
  coinFaceImage: {
    width: 84,
    height: 84,
  },
  rewardCoinInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCoinIcon: {
    width: 14,
    height: 14,
    marginRight: 4,
  },
  heroRight: { flex: 1 },
  heroLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: '#FFDF94' },
  heroBalance: { fontSize: 44, fontWeight: '900', color: '#FFFFFF', lineHeight: 52 },
  heroSub: { fontSize: 12, color: '#D2C5AB', marginTop: 2 },
  card: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 18,
    padding: 14,
  },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tierTitle: { fontSize: 15, fontWeight: '800' },
  tierNext: { fontSize: 12, marginLeft: 'auto' },
  tierTrack: {
    height: 10,
    borderRadius: 999,
    marginTop: 12,
    overflow: 'hidden',
  },
  tierFill: { height: '100%', borderRadius: 999 },
  tierLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  tierLegendText: { fontSize: 11, fontWeight: '700' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  rewardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
  },
  rewardCard: {
    flexGrow: 1,
    flexBasis: '47%',
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
    gap: 4,
  },
  rewardLabel: { fontSize: 15, fontWeight: '800' },
  rewardSub: { fontSize: 11 },
  rewardCoinTag: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  rewardCoinText: { fontSize: 12, fontWeight: '800' },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  ledgerMid: { flex: 1 },
  ledgerLabel: { fontSize: 13.5, fontWeight: '600' },
  ledgerWhen: { fontSize: 11, marginTop: 2 },
  ledgerCoins: { fontSize: 15, fontWeight: '900' },
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  faqQ: { fontSize: 13.5, fontWeight: '700', flex: 1, paddingRight: 8 },
  faqA: { fontSize: 12.5, lineHeight: 18, paddingBottom: 12 },
  footNote: { fontSize: 11, textAlign: 'center', marginTop: 16, paddingHorizontal: 24 },
  toast: {
    position: 'absolute',
    bottom: 28,
    left: 20,
    right: 20,
    backgroundColor: BRAND_COLORS.charcoalBlack,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastText: { color: BRAND_COLORS.goldenYellow, fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
