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
import React, { useMemo, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PressableScale } from '@/components/ui/PremiumKit';
import {
  BRAND_COLORS,
  STATUS_COLORS,
  SURFACE_DARK,
  SURFACE_LIGHT,
} from '@zaff-it/shared/tokens';
import { useAppStore } from '@/store/useAppStore';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import type {
  CustomerStackParamList,
  CustomerTabParamList,
} from '@/navigation/RootNavigator';

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

type RewardCat = 'flat' | 'free' | 'vip';

const REDEMPTIONS: {
  id: string;
  label: string;
  sub: string;
  coins: number;
  cat: RewardCat;
  tag: string;
}[] = [
  { id: 'bw', label: 'B&W Xerox ×10', sub: 'Cyber Hub Xerox service', coins: 50, cat: 'free', tag: 'SERVICE' },
  { id: 'r10', label: '₹10 OFF', sub: 'Any order', coins: 100, cat: 'flat', tag: 'FLAT DISCOUNT' },
  { id: 'fdel', label: 'FREE Delivery', sub: 'Next 3 orders', coins: 150, cat: 'free', tag: 'FREE ITEM' },
  { id: 'gday', label: 'Free Britannia Good Day', sub: 'Al-Madina Store pickup', coins: 150, cat: 'free', tag: 'FREE ITEM' },
  { id: 'r50', label: '₹50 OFF', sub: 'Orders ₹299+', coins: 450, cat: 'flat', tag: 'FLAT DISCOUNT' },
  { id: 'vip', label: 'VIP Fast Pass', sub: 'Priority runner, 1 day', coins: 800, cat: 'vip', tag: 'ZAFF VIP' },
];

const BAZAAR_FILTERS: { id: 'all' | RewardCat; label: string }[] = [
  { id: 'all', label: 'All Perks' },
  { id: 'free', label: 'Free Items' },
  { id: 'flat', label: 'Flat Discounts' },
  { id: 'vip', label: 'VIP Passes' },
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
  const navigation =
    useNavigation<
      BottomTabNavigationProp<CustomerTabParamList> &
        NativeStackNavigationProp<CustomerStackParamList>
    >();
  const colorScheme = useAppStore((s) => s.colorScheme);
  const dark = colorScheme === 'dark';
  const surface = dark ? SURFACE_DARK : SURFACE_LIGHT;
  const setParchiRequestTick = useAppStore((s) => s.setParchiRequestTick);

  const [balance, setBalance] = useState(425);
  const [ledger, setLedger] = useState<LedgerEntry[]>(SEED_LEDGER);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [toast, setToast] = useState<string | null>(null);
  // Stitch additions: live ledger, streak, missions, bazaar filters, auto-apply.
  const [isLive, setIsLive] = useState(false);
  const [streakDays, setStreakDays] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const [dukanCount, setDukanCount] = useState(0);
  const [passbookFilter, setPassbookFilter] = useState<'all' | 'earn' | 'spent'>('all');
  const [bazaarFilter, setBazaarFilter] = useState<'all' | 'flat' | 'free' | 'vip'>('all');
  const [autoApply, setAutoApply] = useState(true);
  const [first500Claiming, setFirst500Claiming] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const bazaarYRef = useRef(0);
  const faqYRef = useRef(0);

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

  // W6: First 500 users Rs100 bonus (1000 coins, 90-day expiry) — server-counter-guarded.
  const claimFirst500 = async () => {
    if (!isSupabaseConfigured() || first500Claiming) return;
    setFirst500Claiming(true);
    try {
      const { data, error } = await supabase.rpc('claim_first500_bonus');
      if (error) {
        if (error.message.includes('already claimed')) {
          setToast('Bonus pehle hi claim ho chuka hai');
        } else if (error.message.includes('fully claimed')) {
          setToast('First 500 slots poore ho gaye hain');
        } else {
          setToast(error.message);
        }
      } else {
        const credited = (data as { credited_coins?: number } | null)?.credited_coins ?? 0;
        setBalance((b) => b + credited);
        setToast(`First 500 bonus mile — ${credited} coins!`);
      }
    } catch {
      setToast('Claim nahi ho paya — thodi der baad try karo');
    } finally {
      setFirst500Claiming(false);
    }
  };

  // Live wallet_ledger + streak + dukans (real session only; demo data stays otherwise).
  React.useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;
        if (!uid) return;
        const { data: rows } = await supabase
          .from('wallet_ledger')
          .select('id, entry_type, coins, reason, balance_after, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(14);
        if (rows && rows.length > 0) {
          setIsLive(true);
          setBalance(rows[0].balance_after ?? 0);
          setLedger(
            rows.map((r, i) => ({
              id: String(r.id ?? `${r.created_at}-${i}`),
              kind: (r.coins ?? 0) >= 0 ? ('earn' as const) : ('redeem' as const),
              label: r.reason ?? 'Z-Coins activity',
              coins: r.coins ?? 0,
              when: new Date(r.created_at).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
              }),
            })),
          );
          const days = new Set(
            rows
              .filter((r) => (r.coins ?? 0) > 0)
              .map((r) => new Date(r.created_at).toDateString()),
          );
          const marks: boolean[] = [];
          for (let i = 6; i >= 0; i -= 1) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            marks.push(days.has(d.toDateString()));
          }
          setStreakDays(marks);
        }
        const { data: ordRows } = await supabase
          .from('orders')
          .select('store_id')
          .eq('customer_id', uid);
        if (ordRows) {
          setDukanCount(new Set(ordRows.map((o) => o.store_id).filter(Boolean)).size);
        }
      } catch {
        // keep demo data on failure
      }
    })();
  }, []);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: surface.background }]}>
      {/* Header — back + stacked title + live coin chip (Stitch) */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={surface.textPrimary} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerKicker, { color: surface.textMuted }]}>
            ZAFF-IT WALLET
          </Text>
          <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>
            Z Coins & Rewards • Wallet
          </Text>
        </View>
        <View style={styles.headerChip}>
          <Ionicons name="help-circle-outline" size={13} color={BRAND_COLORS.charcoalBlack} />
          <Image
            source={require('../../../assets/zaffcoin.png')}
            style={styles.headerCoinIcon}
            resizeMode="contain"
          />
          <Text style={styles.headerChipText}>{balance}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* W6: First 500 users Rs100 bonus claim */}
        {isLive ? (
          <Pressable
            onPress={claimFirst500}
            disabled={first500Claiming}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginBottom: 12,
              padding: 12,
              borderRadius: 14,
              backgroundColor: surface.surface1,
              borderWidth: 1,
              borderColor: BRAND_COLORS.goldenYellow,
              opacity: first500Claiming ? 0.6 : 1,
            }}
            accessibilityRole="button"
            accessibilityLabel="Claim first 500 users bonus"
          >
            <Ionicons name="gift" size={22} color={BRAND_COLORS.goldenYellow} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: surface.textPrimary }}>
                First 500 users — ₹100 bonus
              </Text>
              <Text style={{ fontSize: 12, color: surface.textMuted, marginTop: 1 }}>
                1000 coins (90 din valid) — ek baar claim karo
              </Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '900', color: BRAND_COLORS.goldenYellow }}>
              {first500Claiming ? '…' : 'CLAIM'}
            </Text>
          </Pressable>
        ) : null}

        {/* Hero stash card — Stitch gold gradient */}
        <LinearGradient
          colors={['#FFD34D', '#FFC703', '#E0AE00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>TOTAL Z-COINS STASH</Text>
              <Text style={styles.heroBalance}>
                {balance} <Text style={styles.heroBalanceUnit}>Coins</Text>
              </Text>
              <Text style={styles.heroSub}>
                = ₹{Math.floor(balance / 10)}.00 Instant Checkout Cash
              </Text>
            </View>
            <Image
              source={require('../../../assets/zaffcoin.png')}
              style={styles.coinFaceImage}
              resizeMode="contain"
              accessibilityLabel="ZaffCoin"
            />
          </View>

          <View style={styles.heroRateChip}>
            <Ionicons name="swap-horizontal" size={13} color="#4A3A08" />
            <Text style={styles.heroRateText}>10 Z-Coins = ₹1 Direct Cash Discount</Text>
          </View>

          {/* Auto-apply at checkout */}
          <View style={styles.autoApplyRow}>
            <View style={styles.autoApplyTextWrap}>
              <Text style={styles.autoApplyTitle}>Auto-Apply at Checkout</Text>
              <Text style={styles.autoApplySub}>Saves maximum ₹ on every order</Text>
            </View>
            <Switch
              value={autoApply}
              onValueChange={(v) => {
                setAutoApply(v);
                setToast(v ? 'Auto-apply ON — checkout par max discount apne aap lagega' : 'Auto-apply OFF');
              }}
              trackColor={{ false: 'rgba(74,58,8,0.35)', true: '#16A34A' }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="rgba(74,58,8,0.35)"
            />
          </View>

          <View style={styles.heroBtnRow}>
            <Pressable
              onPress={() =>
                scrollRef.current?.scrollTo({ y: bazaarYRef.current, animated: true })
              }
              accessibilityRole="button"
              accessibilityLabel="Redeem coins"
              style={({ pressed }) => [styles.heroBtnDark, { opacity: pressed ? 0.9 : 1 }]}
            >
              <Ionicons name="bag-handle" size={15} color={BRAND_COLORS.goldenYellow} />
              <Text style={styles.heroBtnDarkText}>Redeem (₹{Math.floor(balance / 10)})</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setOpenFaq(0);
                scrollRef.current?.scrollTo({ y: faqYRef.current, animated: true });
              }}
              accessibilityRole="button"
              accessibilityLabel="How to earn coins"
              style={({ pressed }) => [styles.heroBtnLight, { opacity: pressed ? 0.9 : 1 }]}
            >
              <Ionicons name="bulb-outline" size={15} color={BRAND_COLORS.charcoalBlack} />
              <Text style={styles.heroBtnLightText}>How to Earn</Text>
            </Pressable>
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

        {/* Daily Streak Tracker — real earn-days from wallet_ledger */}
        <View style={[styles.card, { backgroundColor: surface.surface1 }]}>
          <View style={styles.streakHead}>
            <View style={styles.streakTitleWrap}>
              <Ionicons name="flame" size={18} color="#EA580C" />
              <Text style={[styles.streakTitle, { color: surface.textPrimary }]}>
                Daily Streak Tracker
              </Text>
            </View>
            <View style={styles.hotChip}>
              <Text style={styles.hotChipText}>
                {streakDays.filter(Boolean).length} Days Hot!
              </Text>
            </View>
          </View>
          <Text style={[styles.streakSub, { color: surface.textMuted }]}>
            {isLive
              ? 'Pichle 7 din me earn wale din — order deliver hota hai to streak badhta hai'
              : 'Live session me streak real wallet_ledger se dikhega'}
          </Text>
          <View style={styles.streakRow}>
            {streakDays.map((done, i) => {
              const isToday = i === 6;
              return (
                <View key={i} style={styles.streakDayWrap}>
                  <View
                    style={[
                      styles.streakCircle,
                      {
                        backgroundColor: done ? '#16A34A' : surface.surface3,
                      },
                    ]}
                  >
                    <Ionicons
                      name={done ? 'checkmark' : isToday ? 'flame-outline' : 'close'}
                      size={14}
                      color={done || isToday ? '#FFFFFF' : surface.textMuted}
                    />
                  </View>
                  <Text
                    style={[
                      styles.streakDayLabel,
                      { color: isToday ? BRAND_COLORS.goldenYellowPressed : surface.textMuted },
                    ]}
                  >
                    {isToday ? 'Today' : `D${i + 1}`}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={[styles.streakRewardBanner, { backgroundColor: surface.surface2 }]}>
            <Ionicons name="gift-outline" size={15} color={BRAND_COLORS.goldenYellowPressed} />
            <Text style={[styles.streakRewardText, { color: surface.textSecondary }]}>
              Day 7 Mega Reward: 50 Z-Coins + 100% Free Express Delivery coupon
            </Text>
          </View>
        </View>

        {/* Earn Z-Coins Booster Missions — real actions */}
        <View style={styles.sectionHeadRow}>
          <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
            Earn Z-Coins Booster Missions
          </Text>
          <View style={styles.missionHintChip}>
            <Text style={styles.missionHintText}>Tap to complete</Text>
          </View>
        </View>

        {/* 1) Rate order */}
        <View style={[styles.missionCard, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
          <View style={[styles.missionIcon, { backgroundColor: 'rgba(37,99,235,0.14)' }]}>
            <Ionicons name="star-outline" size={18} color="#2563EB" />
          </View>
          <View style={styles.missionMid}>
            <Text style={[styles.missionTitle, { color: surface.textPrimary }]}>
              Rate Order — photo review bonus
            </Text>
            <Text style={[styles.missionSub, { color: surface.textMuted }]}>
              Rating + photo proof par +15 Z-Coins
            </Text>
          </View>
          <Pressable
            onPress={() => {
              navigation.navigate('AccountTab');
              setToast('Orders kholein → order rate karein — coins deliver par credit hote hain');
            }}
            accessibilityRole="button"
            style={styles.missionBtn}
          >
            <Text style={styles.missionBtnText}>Rate Now</Text>
          </Pressable>
        </View>

        {/* 2) Refer */}
        <View style={[styles.missionCard, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
          <View style={[styles.missionIcon, { backgroundColor: 'rgba(22,163,74,0.14)' }]}>
            <Ionicons name="people-outline" size={18} color="#16A34A" />
          </View>
          <View style={styles.missionMid}>
            <Text style={[styles.missionTitle, { color: surface.textPrimary }]}>
              Refer Makrana Friend
            </Text>
            <Text style={[styles.missionSub, { color: surface.textMuted }]}>
              WhatsApp share — dost ke pehle order par +100 Z-Coins
            </Text>
          </View>
          <Pressable
            onPress={() => {
              void Linking.openURL(
                `https://wa.me/?text=${encodeURIComponent(
                  'Zaff-It try karo — Makrana ka apna quick-commerce! 15-30 min delivery, mandi pricing: https://zaff-it.vercel.app',
                )}`,
              );
              setToast('WhatsApp khul gaya — link share karo, +100 coins pehle order par');
            }}
            accessibilityRole="button"
            style={[styles.missionBtn, { backgroundColor: '#121416' }]}
          >
            <Ionicons name="logo-whatsapp" size={13} color="#25D366" />
            <Text style={[styles.missionBtnText, { color: '#FFFFFF' }]}>Invite</Text>
          </Pressable>
        </View>

        {/* 3) Order from 3 dukans — real progress */}
        <View style={[styles.missionCard, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
          <View style={[styles.missionIcon, { backgroundColor: 'rgba(255,199,3,0.16)' }]}>
            <Ionicons name="storefront-outline" size={18} color={BRAND_COLORS.goldenYellowPressed} />
          </View>
          <View style={styles.missionMid}>
            <Text style={[styles.missionTitle, { color: surface.textPrimary }]}>
              Order from 3 Different Dukans
            </Text>
            <Text style={[styles.missionSub, { color: surface.textMuted }]}>
              {Math.min(dukanCount, 3)} of 3 completed
              {dukanCount < 3 ? ' · Need more' : ' — done!'}
            </Text>
            <View style={[styles.missionTrack, { backgroundColor: surface.surface3 }]}>
              <View
                style={[
                  styles.missionFill,
                  {
                    width: `${Math.min(100, Math.round((dukanCount / 3) * 100))}%`,
                    backgroundColor: BRAND_COLORS.goldenYellow,
                  },
                ]}
              />
            </View>
          </View>
          <Pressable
            onPress={() => navigation.navigate('HomeTab')}
            accessibilityRole="button"
            style={styles.missionBtn}
          >
            <Text style={styles.missionBtnText}>Shop</Text>
          </Pressable>
        </View>

        {/* 4) Upload parchi — jumps to Home Parchi modal */}
        <View style={[styles.missionCard, { backgroundColor: surface.surface1, borderColor: surface.border }]}>
          <View style={[styles.missionIcon, { backgroundColor: 'rgba(22,163,74,0.14)' }]}>
            <Ionicons name="receipt-outline" size={18} color="#16A34A" />
          </View>
          <View style={styles.missionMid}>
            <Text style={[styles.missionTitle, { color: surface.textPrimary }]}>
              Upload Grocery Parchi List
            </Text>
            <Text style={[styles.missionSub, { color: surface.textMuted }]}>
              Parchi se order banao — +20 Z-Coins bonus
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setParchiRequestTick(Date.now());
              navigation.navigate('HomeTab');
            }}
            accessibilityRole="button"
            style={styles.missionBtn}
          >
            <Text style={styles.missionBtnText}>Upload</Text>
          </Pressable>
        </View>

        {/* Z-Coins Rewards Bazaar — Stitch filter chips */}
        <View
          onLayout={(e) => {
            bazaarYRef.current = e.nativeEvent.layout.y;
          }}
        >
          <View style={styles.sectionHeadRow}>
            <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
              Z-Coins Rewards Bazaar
            </Text>
            <Text style={[styles.sectionSeeAll, { color: surface.textMuted }]}>
              Exclusive Makrana dukan perks
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bazaarChips}
          >
            {BAZAAR_FILTERS.map((f) => {
              const active = bazaarFilter === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setBazaarFilter(f.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.bazaarChip,
                    {
                      backgroundColor: active ? BRAND_COLORS.charcoalBlack : surface.surface2,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.bazaarChipText,
                      { color: active ? BRAND_COLORS.goldenYellow : surface.textSecondary },
                    ]}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <View style={styles.rewardsGrid}>
          {REDEMPTIONS.filter((r) => bazaarFilter === 'all' || r.cat === bazaarFilter).map((r) => {
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
                <View style={styles.rewardTagRow}>
                  <Text
                    style={[
                      styles.rewardTagText,
                      { color: r.cat === 'vip' ? BRAND_COLORS.goldenYellowPressed : surface.textMuted },
                    ]}
                  >
                    {r.tag}
                  </Text>
                </View>
                <Text style={[styles.rewardLabel, { color: surface.textPrimary }]} numberOfLines={1}>
                  {r.label}
                </Text>
                <Text style={[styles.rewardSub, { color: surface.textMuted }]} numberOfLines={1}>
                  {r.sub}
                </Text>
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

        {/* Coins Passbook — real-time statement + filters */}
        <View style={styles.sectionHeadRow}>
          <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
            Coins Passbook
          </Text>
          <Text style={[styles.sectionSeeAll, { color: surface.textMuted }]}>
            {isLive ? 'Real-time ledger' : 'Demo statement'}
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bazaarChips}
        >
          {([
            { id: 'all' as const, label: 'All' },
            { id: 'earn' as const, label: 'Earned' },
            { id: 'spent' as const, label: 'Spent' },
          ]).map((f) => {
            const active = passbookFilter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setPassbookFilter(f.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.bazaarChip,
                  { backgroundColor: active ? BRAND_COLORS.charcoalBlack : surface.surface2 },
                ]}
              >
                <Text
                  style={[
                    styles.bazaarChipText,
                    { color: active ? BRAND_COLORS.goldenYellow : surface.textSecondary },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={[styles.card, { backgroundColor: surface.surface1 }]}>
          {ledger
            .filter((e) =>
              passbookFilter === 'all'
                ? true
                : passbookFilter === 'earn'
                  ? e.kind === 'earn'
                  : e.kind === 'redeem',
            )
            .slice(0, 8)
            .map((e, i) => (
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
        <View
          onLayout={(e) => {
            faqYRef.current = e.nativeEvent.layout.y;
          }}
        >
          <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
            How Z-Coins Work
          </Text>
        </View>
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
          {isLive
            ? 'Z-Coins Never Expire for active ZAFF users. 100% guaranteed doorstep savings across all neighbourhoods.'
            : 'Demo balance — login ke baad wallet_ledger se live statement dikhega. Earn: delivery par 1 coin / ₹10.'}
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
  // ---- Stitch wallet: header ----
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  headerTitleWrap: { flex: 1 },
  headerKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  headerCoinIcon: { width: 15, height: 15 },
  // ---- Stitch wallet: gold hero ----
  heroTopRow: { flexDirection: 'row', alignItems: 'center' },
  heroBalanceUnit: { fontSize: 16, fontWeight: '800', color: '#4A3A08' },
  heroRateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 10,
  },
  heroRateText: { fontSize: 11, fontWeight: '800', color: '#4A3A08' },
  autoApplyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  autoApplyTextWrap: { flex: 1, paddingRight: 8 },
  autoApplyTitle: { fontSize: 13, fontWeight: '900', color: '#121416' },
  autoApplySub: { fontSize: 10.5, color: '#4A3A08', marginTop: 1 },
  heroBtnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  heroBtnDark: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#121416',
    borderRadius: 12,
    paddingVertical: 11,
  },
  heroBtnDarkText: { fontSize: 13, fontWeight: '900', color: BRAND_COLORS.goldenYellow },
  heroBtnLight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
    paddingVertical: 11,
  },
  heroBtnLightText: { fontSize: 13, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  // ---- Streak ----
  streakHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  streakTitle: { fontSize: 15, fontWeight: '900' },
  hotChip: {
    backgroundColor: 'rgba(234,88,12,0.14)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hotChipText: { fontSize: 10, fontWeight: '900', color: '#EA580C' },
  streakSub: { fontSize: 11, marginTop: 4 },
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 2,
  },
  streakDayWrap: { alignItems: 'center', gap: 4 },
  streakCircle: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakDayLabel: { fontSize: 9.5, fontWeight: '800' },
  streakRewardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 12,
  },
  streakRewardText: { flex: 1, fontSize: 11, fontWeight: '700' },
  // ---- Missions ----
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 8,
  },
  sectionSeeAll: { fontSize: 11, fontWeight: '600' },
  missionHintChip: {
    backgroundColor: 'rgba(255,199,3,0.18)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  missionHintText: { fontSize: 10, fontWeight: '800', color: BRAND_COLORS.goldenYellowPressed },
  missionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  missionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionMid: { flex: 1 },
  missionTitle: { fontSize: 13, fontWeight: '800' },
  missionSub: { fontSize: 11, marginTop: 2 },
  missionTrack: {
    height: 5,
    borderRadius: 999,
    marginTop: 6,
    overflow: 'hidden',
  },
  missionFill: { height: '100%', borderRadius: 999 },
  missionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  missionBtnText: { fontSize: 12, fontWeight: '900', color: BRAND_COLORS.charcoalBlack },
  // ---- Bazaar ----
  bazaarChips: { gap: 8, paddingBottom: 8, paddingRight: 16 },
  bazaarChip: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  bazaarChipText: { fontSize: 12, fontWeight: '800' },
  rewardTagRow: { marginBottom: 3 },
  rewardTagText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
});
