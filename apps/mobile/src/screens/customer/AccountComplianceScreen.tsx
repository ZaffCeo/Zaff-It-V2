/**
 * AccountComplianceScreen — Profile 2.0 (Wave-A)
 * Hero identity (editable name, avatar initials), live stats (Wallet/ZaffID/Pro),
 * grouped link grid, honest "coming soon" vertical placeholders,
 * preferences, legal & DPDP account deletion.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';
import { Ionicons } from '@expo/vector-icons';
import {
  BRAND_COLORS,
  BRAND_GRADIENTS,
  RADII,
  SPACING,
  STATUS_COLORS,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '@/store/useAppStore';
import {
  getTranslation,
  LANGUAGE_LABELS,
  type AppLanguage,
} from '@/i18n/translations';
import {
  isSupabaseConfigured,
  supabase,
  SUPABASE_FUNCTIONS_URL,
} from '@/services/supabase';
import { ErrorRetryBanner, PrimaryButton } from '@/components/StateViews';
import {
  ComingSoonCard,
  LinkRow,
  SectionCard,
  StatTile,
  type ChromeMode,
} from '@/components/Chrome';

const LANGUAGES: AppLanguage[] = ['en', 'hi', 'hi-Latn'];
type ProfileData = {
  fullName: string | null;
  avatarUrl: string | null;
  phone: string | null;
};

export const AccountComplianceScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const language = useAppStore((s) => s.language);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const phone = useAppStore((s) => s.phone);
  const userId = useAppStore((s) => s.userId);
  const role = useAppStore((s) => s.role);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setRole = useAppStore((s) => s.setRole);
  const setColorScheme = useAppStore((s) => s.setColorScheme);
  const signOutReset = useAppStore((s) => s.signOutReset);
  const t = getTranslation(language);
  const mode: ChromeMode = colorScheme;
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDone, setDeleteDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Persona workspace — earned roles only (037: my_roles + register_as_merchant)
  const [myRoles, setMyRoles] = useState<string[]>([]);
  const [myMerchantName, setMyMerchantName] = useState<string | null>(null);
  const [myStore, setMyStore] = useState<{
    name: string;
    isOpen: boolean;
    opensAt: string;
    closesAt: string;
  } | null>(null);

  // Profile 2.0 live data
  const [profile, setProfile] = useState<ProfileData>({
    fullName: null,
    avatarUrl: null,
    phone: null,
  });
  const [walletCoins, setWalletCoins] = useState<number | null>(null);
  const [zaffPublicId, setZaffPublicId] = useState<string | null>(null);
  const [proPlan, setProPlan] = useState<string | null>(null);
  const [proExpiry, setProExpiry] = useState<string | null>(null);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [comingSoonNote, setComingSoonNote] = useState<string | null>(null);

  const initials = (profile.fullName ?? phone ?? 'Z')
    .replace(/[^a-zA-Z ]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || 'Z';

  const loadProfileData = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) return;

      void (async () => {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, avatar_url, phone')
          .eq('id', uid)
          .maybeSingle();
        if (data) {
          setProfile({
            fullName: data.full_name ?? null,
            avatarUrl: data.avatar_url ?? null,
            phone: data.phone ?? null,
          });
        }
      })();

      void (async () => {
        const { data } = await supabase
          .from('wallet_ledger')
          .select('balance_after')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          setWalletCoins(Number(data[0].balance_after ?? 0));
        }
      })();

      void (async () => {
        const { data, error } = await supabase.rpc('my_zaffid');
        if (!error && data && typeof data === 'object') {
          const pub = (data as Record<string, unknown>).public_id;
          if (typeof pub === 'string') setZaffPublicId(pub);
        }
      })();

      void (async () => {
        const { data } = await supabase
          .from('pro_memberships')
          .select('plan, status, expires_at')
          .eq('user_id', uid)
          .eq('status', 'active')
          .order('expires_at', { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          setProPlan(String(data[0].plan ?? 'pro'));
          setProExpiry(data[0].expires_at ?? null);
        }
      })();
    } catch {
      // keep placeholder state on failure
    }
  }, []);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  // Persona workspace: earned roles + merchant persona (037 RPCs)
  useEffect(() => {
    if (!isSupabaseConfigured() || userId === null) return;
    void (async () => {
      const { data: rolesData } = await supabase.rpc('my_roles');
      if (Array.isArray(rolesData)) {
        setMyRoles(rolesData.map((r) => String((r as Record<string, unknown>).role ?? '')));
      }
      const { data: mRows } = await supabase
        .from('merchants')
        .select('id, business_name')
        .eq('owner_user_id', userId)
        .eq('is_active', true)
        .limit(1);
      if (mRows && mRows.length > 0) {
        setMyMerchantName(String(mRows[0].business_name ?? 'Merchant'));
        const { data: sRows } = await supabase
          .from('stores')
          .select('name, is_open, opens_at, closes_at')
          .eq('merchant_id', mRows[0].id)
          .eq('is_active', true)
          .limit(1);
        if (sRows && sRows.length > 0) {
          setMyStore({
            name: String(sRows[0].name ?? ''),
            isOpen: Boolean(sRows[0].is_open),
            opensAt: String(sRows[0].opens_at ?? '').slice(0, 5),
            closesAt: String(sRows[0].closes_at ?? '').slice(0, 5),
          });
        }
      }
    })();
  }, [userId]);

  const handleLanguageChange = async (nextLang: AppLanguage) => {
    setLanguage(nextLang);
    if (isSupabaseConfigured() && userId !== null) {
      await supabase
        .from('profiles')
        .update({ preferred_language: nextLang })
        .eq('id', userId);
    }
  };

  const handleSaveName = async () => {
    const trimmed = nameDraft.trim();
    if (trimmed.length < 2 || trimmed.length > 60) return;
    setSavingName(true);
    setErrorMsg(null);
    try {
      if (isSupabaseConfigured() && userId !== null) {
        const { error } = await supabase
          .from('profiles')
          .update({ full_name: trimmed })
          .eq('id', userId);
        if (error) {
          setErrorMsg(t.errorGeneric);
        } else {
          setProfile((p) => ({ ...p, fullName: trimmed }));
          setNameModalOpen(false);
        }
      } else {
        setProfile((p) => ({ ...p, fullName: trimmed }));
        setNameModalOpen(false);
      }
    } catch {
      setErrorMsg(t.errorGeneric);
    } finally {
      setSavingName(false);
    }
  };

  const handleDeleteAccount = async () => {
    setErrorMsg(null);
    if (!isSupabaseConfigured()) {
      setDeleteDone(true);
      setDeleteModalOpen(false);
      return;
    }

    setDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';
      const response = await fetch(
        `${SUPABASE_FUNCTIONS_URL}/auth-delete-account`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        setErrorMsg(t.errorGeneric);
        return;
      }
      setDeleteDone(true);
      setDeleteModalOpen(false);
    } catch {
      setErrorMsg(t.errorGeneric);
    } finally {
      setDeleting(false);
    }
  };

  const handleSignOut = async () => {
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
    signOutReset();
  };

  const walletRupees =
    walletCoins === null ? '—' : `₹${(walletCoins / 10).toFixed(2)}`;

  const showComingSoon = (label: string) => {
    setComingSoonNote(`${label} — launch jaldi ho raha hai! Backend live hai, UI aane wala hai.`);
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: surface.background }]}
      edges={['top', 'left', 'right']}
    >
      <View style={[styles.header, { borderBottomColor: surface.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: surface.textPrimary }]}>
            {t.accountTitle}
          </Text>
          <Text style={[styles.phoneSub, { color: surface.textMuted }]}>
            {profile.phone ?? phone ?? 'Makrana Customer'}
          </Text>
        </View>
        <Pressable
          onPress={() =>
            setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')
          }
          accessibilityRole="button"
          accessibilityLabel="Toggle dark or light mode"
          style={[
            styles.themeBtn,
            { backgroundColor: surface.surface2, borderColor: surface.border },
          ]}
        >
          <Ionicons
            name={colorScheme === 'dark' ? 'sunny-outline' : 'moon-outline'}
            size={20}
            color={surface.textPrimary}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {errorMsg !== null ? (
          <ErrorRetryBanner
            message={errorMsg}
            retryLabel={t.retryBtn}
            onRetry={() => {
              setErrorMsg(null);
              void loadProfileData();
            }}
            mode={colorScheme}
          />
        ) : null}

        {deleteDone ? (
          <View
            style={[
              styles.successBanner,
              { backgroundColor: STATUS_COLORS.successBgLight },
            ]}
          >
            <Text
              style={[
                styles.successBannerText,
                { color: STATUS_COLORS.successTextLight },
              ]}
            >
              {t.deleteAccountSuccess}
            </Text>
          </View>
        ) : null}

        {/* ── Hero identity ─────────────────────────────────────────── */}
        <SectionCard mode={mode} style={styles.heroCard}>
          <View style={styles.heroRow}>
            {profile.avatarUrl !== null && profile.avatarUrl !== '' ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor:
                      colorScheme === 'dark'
                        ? BRAND_COLORS.goldenYellow
                        : BRAND_COLORS.charcoalBlack,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.avatarText,
                    {
                      color:
                        colorScheme === 'dark'
                          ? BRAND_COLORS.charcoalBlack
                          : BRAND_COLORS.goldenYellow,
                    },
                  ]}
                >
                  {initials}
                </Text>
              </View>
            )}
            <View style={styles.heroTextWrap}>
              <View style={styles.heroNameRow}>
                <Text
                  numberOfLines={1}
                  style={[styles.heroName, { color: surface.textPrimary }]}
                >
                  {profile.fullName ?? 'Naam set karein'}
                </Text>
                <Pressable
                  onPress={() => {
                    setNameDraft(profile.fullName ?? '');
                    setNameModalOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Edit name"
                  style={[
                    styles.nameEditBtn,
                    { backgroundColor: surface.surface2, borderColor: surface.border },
                  ]}
                >
                  <Ionicons
                    name="pencil"
                    size={14}
                    color={surface.textSecondary}
                  />
                </Pressable>
              </View>
              <Text style={[styles.heroPhone, { color: surface.textMuted }]}>
                {profile.phone ?? phone ?? '—'}
              </Text>
              <View style={styles.heroChips}>
                <View style={[styles.heroChip, { backgroundColor: BRAND_COLORS.goldSoft }]}>
                  <Ionicons name="id-card" size={11} color="#8A6D00" />
                  <Text style={[styles.heroChipText, { color: '#8A6D00' }]}>
                    {zaffPublicId ?? 'ZaffID banao'}
                  </Text>
                </View>
                {proPlan !== null ? (
                  <View
                    style={[
                      styles.heroChip,
                      {
                        backgroundColor:
                          colorScheme === 'dark'
                            ? 'rgba(12,131,31,0.2)'
                            : STATUS_COLORS.successBgLight,
                      },
                    ]}
                  >
                    <Ionicons name="shield-checkmark" size={11} color={BRAND_COLORS.electricGreen} />
                    <Text style={[styles.heroChipText, { color: BRAND_COLORS.electricGreen }]}>
                      PRO
                    </Text>
                  </View>
                ) : null}
                <View
                  style={[
                    styles.heroChip,
                    { backgroundColor: surface.surface2 },
                  ]}
                >
                  <Text style={[styles.heroChipText, { color: surface.textSecondary }]}>
                    {role.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </SectionCard>

        {/* ── Live stats ────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <StatTile
            mode={mode}
            icon="wallet-outline"
            value={walletRupees}
            label="Z-Coins Wallet"
            accent
          />
          <StatTile
            mode={mode}
            icon="id-card-outline"
            value={zaffPublicId ?? '—'}
            label="ZaffID"
          />
          <StatTile
            mode={mode}
            icon="shield-checkmark-outline"
            value={proPlan !== null ? 'ACTIVE' : 'JOIN'}
            label={
              proPlan !== null && proExpiry !== null
                ? `till ${new Date(proExpiry).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })}`
                : 'Zaff Pro'
            }
            accent={proPlan !== null}
          />
        </View>

        {/* ── Shopping & activity ──────────────────────────────────── */}
        <SectionCard mode={mode} style={styles.groupCard}>
          <Text style={[styles.groupTitle, { color: surface.textMuted }]}>
            SHOPPING & ACTIVITY
          </Text>
          <LinkRow
            mode={mode}
            icon="receipt-outline"
            title="Orders & Support"
            subtitle="Invoices, cancellations, help desk"
            tint={BRAND_COLORS.goldenYellow}
            onPress={() =>
              navigation.dispatch(CommonActions.navigate({ name: 'TrackingTab' }))
            }
          />
          <LinkRow
            mode={mode}
            icon="notifications-outline"
            title="Notifications"
            subtitle="Order updates & offers"
            tint={BRAND_COLORS.goldenYellow}
            onPress={() => navigation.navigate('NotificationCenter')}
          />
          <LinkRow
            mode={mode}
            icon="chatbubble-ellipses-outline"
            title="Zaffy AI Help"
            subtitle="24×7 Makrana assistant"
            tint={BRAND_COLORS.goldenYellow}
            onPress={() => navigation.navigate('ZaffyChat')}
            last
          />
        </SectionCard>

        {/* ── Money & rewards ──────────────────────────────────────── */}
        <SectionCard mode={mode} style={styles.groupCard}>
          <Text style={[styles.groupTitle, { color: surface.textMuted }]}>
            MONEY & REWARDS
          </Text>
          <LinkRow
            mode={mode}
            icon="wallet-outline"
            title="Z-Coins Wallet"
            subtitle={
              walletCoins === null
                ? 'Balance dekhein'
                : `${walletCoins} coins = ₹${(walletCoins / 10).toFixed(2)}`
            }
            tint={BRAND_COLORS.goldenYellow}
            onPress={() => navigation.navigate('Wallet')}
          />
          <LinkRow
            mode={mode}
            icon="gift-outline"
            title="Invite & Earn"
            subtitle="Gift ₹50, Get ₹50"
            tint={BRAND_COLORS.goldenYellow}
            onPress={() => navigation.navigate('Invite')}
          />
          <LinkRow
            mode={mode}
            icon="shield-checkmark-outline"
            title="Zaff Pro"
            subtitle={
              proPlan !== null
                ? 'Membership active — free delivery'
                : 'Free delivery + ₹0 handling'
            }
            tint={BRAND_COLORS.goldenYellow}
            onPress={() => navigation.navigate('Pro')}
            last
          />
        </SectionCard>

        {/* ── Account & essentials ─────────────────────────────────── */}
        <SectionCard mode={mode} style={styles.groupCard}>
          <Text style={[styles.groupTitle, { color: surface.textMuted }]}>
            ACCOUNT & ESSENTIALS
          </Text>
          <LinkRow
            mode={mode}
            icon="location-outline"
            title="Address Book"
            subtitle="Delivery addresses & pins"
            tint={BRAND_COLORS.goldenYellow}
            onPress={() => navigation.navigate('AddressBook')}
          />
          <LinkRow
            mode={mode}
            icon="id-card-outline"
            title="ZaffID — One ID. Every Zaff."
            subtitle={
              zaffPublicId !== null
                ? `Aapki ID: ${zaffPublicId}`
                : 'Apni ZaffID generate karein'
            }
            tint={BRAND_COLORS.goldenYellow}
            onPress={() => navigation.navigate('ZaffId')}
            last
          />
        </SectionCard>

        {/* ── Coming soon (honest placeholders) ────────────────────── */}
        <View style={styles.comingSection}>
          <Text style={[styles.groupTitle, { color: surface.textMuted }]}>
            JALDI AA RAHA HAI
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.comingScroll}
          >
            <ComingSoonCard
              mode={mode}
              icon="medkit-outline"
              title="Medicine Delivery"
              subtitle="₹69 din · ₹99 raat (10PM–6AM)"
              note="Checkout v5 ke saath"
              onPress={() => showComingSoon('Medicine')}
            />
            <ComingSoonCard
              mode={mode}
              icon="shirt-outline"
              title="Laundry Pickup"
              subtitle="₹40 jodi · ₹20 single · ₹10 press"
              note="Wash + Press included · free pickup"
              onPress={() => navigation.navigate('Laundry')}
            />
            <ComingSoonCard
              mode={mode}
              icon="build-outline"
              title="Home Services"
              subtitle="Verified pros se quotes"
              note="Repair · Cleaning · Appliance"
              onPress={() => showComingSoon('Home Services')}
            />
          </ScrollView>
          {comingSoonNote !== null ? (
            <View
              style={[
                styles.comingNoteBanner,
                {
                  backgroundColor: surface.surface2,
                  borderColor: BRAND_COLORS.goldBorder,
                },
              ]}
            >
              <Ionicons
                name="information-circle"
                size={16}
                color={BRAND_COLORS.goldenYellow}
              />
              <Text style={[styles.comingNoteText, { color: surface.textSecondary }]}>
                {comingSoonNote}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Preferences ──────────────────────────────────────────── */}
        <SectionCard mode={mode} style={styles.groupCard}>
          <Text style={[styles.groupTitle, { color: surface.textMuted }]}>
            {t.languageTitle.toUpperCase()}
          </Text>
          <View style={styles.chipRow}>
            {LANGUAGES.map((code) => {
              const active = language === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => handleLanguageChange(code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.choiceChip,
                    {
                      backgroundColor: active
                        ? BRAND_COLORS.goldenYellow
                        : surface.surface2,
                      borderColor: active
                        ? BRAND_COLORS.goldenYellow
                        : surface.borderStrong,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceChipText,
                      {
                        color: active
                          ? BRAND_COLORS.charcoalBlack
                          : surface.textPrimary,
                      },
                    ]}
                  >
                    {LANGUAGE_LABELS[code].native}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>

        {/* ── Persona workspace (earned roles only) ────────────────── */}
        <SectionCard mode={mode} style={styles.groupCard}>
          <Text style={[styles.groupTitle, { color: surface.textMuted }]}>
            PERSONA WORKSPACE
          </Text>

          {/* Customer persona — always present */}
          <View
            style={[
              styles.personaCard,
              {
                backgroundColor:
                  role === 'customer' ? BRAND_COLORS.electricGreenSurface : surface.surface2,
                borderColor: role === 'customer' ? BRAND_COLORS.electricGreen : surface.borderStrong,
              },
            ]}
          >
            <View style={styles.personaTopRow}>
              <View style={[styles.personaIconWrap, { backgroundColor: surface.surface3 }]}>
                <Ionicons name="home-outline" size={18} color={surface.textPrimary} />
              </View>
              <View style={styles.personaTitleCol}>
                <Text style={[styles.personaTitle, { color: surface.textPrimary }]}>
                  Customer / Personal Mode
                </Text>
                {role === 'customer' && (
                  <View style={[styles.activePill, { backgroundColor: BRAND_COLORS.electricGreen }]}>
                    <Ionicons name="checkmark" size={11} color={BRAND_COLORS.pureWhite} />
                    <Text style={styles.activePillText}>CURRENT ACTIVE</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={[styles.personaDesc, { color: surface.textSecondary }]}>
              Ghar, daily groceries &amp; errands — Makrana ke local stores se 10-minute
              instant delivery, doorstep riders aur Request-It errands.
            </Text>
          </View>

          {/* Merchant persona — only if earned via registration */}
          {myRoles.includes('merchant') && (
            <View
              style={[
                styles.personaCard,
                {
                  backgroundColor:
                    role === 'merchant' ? BRAND_COLORS.goldSoft : surface.surface2,
                  borderColor: role === 'merchant' ? BRAND_COLORS.goldBorder : surface.borderStrong,
                },
              ]}
            >
              <View style={styles.personaTopRow}>
                <View style={[styles.personaIconWrap, { backgroundColor: surface.surface3 }]}>
                  <Ionicons name="storefront-outline" size={18} color={BRAND_COLORS.goldenYellow} />
                </View>
                <View style={styles.personaTitleCol}>
                  <Text style={[styles.personaTitle, { color: surface.textPrimary }]}>
                    Business &amp; Dukan Partner
                  </Text>
                  {role === 'merchant' ? (
                    <View style={[styles.activePill, { backgroundColor: BRAND_COLORS.goldenYellow }]}>
                      <Ionicons name="checkmark" size={11} color={BRAND_COLORS.charcoalBlack} />
                      <Text style={[styles.activePillText, { color: BRAND_COLORS.charcoalBlack }]}>
                        CURRENT ACTIVE
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.personaSub, { color: surface.textSecondary }]}>
                      {myMerchantName ?? 'Verified'}
                    </Text>
                  )}
                </View>
              </View>
              {myStore ? (
                <Text style={[styles.personaDesc, { color: surface.textSecondary }]}>
                  {myStore.name} · {myStore.isOpen ? 'OPEN' : 'CLOSED'}
                  {myStore.opensAt && myStore.closesAt
                    ? ` · ${myStore.opensAt}–${myStore.closesAt}`
                    : ''}
                </Text>
              ) : (
                <Text style={[styles.personaDesc, { color: surface.textSecondary }]}>
                  Store setup pending — Store tab me jake details bharo.
                </Text>
              )}
              {role !== 'merchant' && (
                <Pressable
                  onPress={() => setRole('merchant')}
                  accessibilityRole="button"
                  style={[styles.personaSwitchBtn, { backgroundColor: BRAND_COLORS.goldenYellow }]}
                >
                  <Ionicons name="swap-horizontal" size={15} color={BRAND_COLORS.charcoalBlack} />
                  <Text style={[styles.personaSwitchText, { color: BRAND_COLORS.charcoalBlack }]}>
                    Merchant App me Switch karo
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Rider persona — only if granted */}
          {myRoles.includes('rider') && (
            <View
              style={[
                styles.personaCard,
                {
                  backgroundColor: role === 'rider' ? BRAND_COLORS.electricGreenSurface : surface.surface2,
                  borderColor: role === 'rider' ? BRAND_COLORS.electricGreen : surface.borderStrong,
                },
              ]}
            >
              <View style={styles.personaTopRow}>
                <View style={[styles.personaIconWrap, { backgroundColor: surface.surface3 }]}>
                  <Ionicons name="bicycle-outline" size={18} color={surface.textPrimary} />
                </View>
                <View style={styles.personaTitleCol}>
                  <Text style={[styles.personaTitle, { color: surface.textPrimary }]}>
                    Delivery Partner / Rider
                  </Text>
                  {role === 'rider' && (
                    <View style={[styles.activePill, { backgroundColor: BRAND_COLORS.electricGreen }]}>
                      <Ionicons name="checkmark" size={11} color={BRAND_COLORS.pureWhite} />
                      <Text style={styles.activePillText}>CURRENT ACTIVE</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={[styles.personaDesc, { color: surface.textSecondary }]}>
                Order trip dispatches, per-drop incentives aur COD vault reconcile.
              </Text>
              {role !== 'rider' && (
                <Pressable
                  onPress={() => setRole('rider')}
                  accessibilityRole="button"
                  style={[styles.personaSwitchBtn, { backgroundColor: BRAND_COLORS.electricGreen }]}
                >
                  <Ionicons name="swap-horizontal" size={15} color={BRAND_COLORS.pureWhite} />
                  <Text style={[styles.personaSwitchText, { color: BRAND_COLORS.pureWhite }]}>
                    Rider Mode me Switch karo
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Admin persona — only if granted (never shown to normal users) */}
          {myRoles.includes('admin') && (
            <View
              style={[
                styles.personaCard,
                {
                  backgroundColor: role === 'admin' ? BRAND_COLORS.electricGreenSurface : surface.surface2,
                  borderColor: role === 'admin' ? BRAND_COLORS.electricGreen : surface.borderStrong,
                },
              ]}
            >
              <View style={styles.personaTopRow}>
                <View style={[styles.personaIconWrap, { backgroundColor: surface.surface3 }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={surface.textPrimary} />
                </View>
                <View style={styles.personaTitleCol}>
                  <Text style={[styles.personaTitle, { color: surface.textPrimary }]}>
                    Admin Control Tower
                  </Text>
                  {role === 'admin' && (
                    <View style={[styles.activePill, { backgroundColor: BRAND_COLORS.electricGreen }]}>
                      <Ionicons name="checkmark" size={11} color={BRAND_COLORS.pureWhite} />
                      <Text style={styles.activePillText}>CURRENT ACTIVE</Text>
                    </View>
                  )}
                </View>
              </View>
              {role !== 'admin' && (
                <Pressable
                  onPress={() => setRole('admin')}
                  accessibilityRole="button"
                  style={[styles.personaSwitchBtn, { backgroundColor: BRAND_COLORS.charcoalBlack }]}
                >
                  <Ionicons name="swap-horizontal" size={15} color={BRAND_COLORS.goldenYellow} />
                  <Text style={[styles.personaSwitchText, { color: BRAND_COLORS.goldenYellow }]}>
                    Admin Console kholo
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </SectionCard>

        {/* ── Business banner (no merchant persona yet) ─────────────── */}
        {!myRoles.includes('merchant') && (
          <LinearGradient
            colors={[...BRAND_GRADIENTS.goldWarm]}
            style={styles.bizBanner}
          >
            <View style={styles.bizTopRow}>
              <Ionicons name="business-outline" size={22} color={BRAND_COLORS.charcoalBlack} />
              <Text style={styles.bizTitle}>Dukaan ya Service hai aapke paas?</Text>
            </View>
            <Text style={styles.bizSub}>
              Zaff-It se connect karo — live orders lo, apni dukaan 10-minute delivery
              network pe pahunchao aur earning aaj se shuru karo.
            </Text>
            <Pressable
              onPress={() => navigation.navigate('MerchantRegister')}
              accessibilityRole="button"
              style={styles.bizCta}
            >
              <Ionicons name="rocket-outline" size={16} color={BRAND_COLORS.goldenYellow} />
              <Text style={styles.bizCtaText}>Merchant/Seller bano — Register karo</Text>
              <Ionicons name="arrow-forward" size={15} color={BRAND_COLORS.goldenYellow} />
            </Pressable>
          </LinearGradient>
        )}

        {/* ── Legal & safety ───────────────────────────────────────── */}
        <SectionCard mode={mode} style={styles.groupCard}>
          <Text style={[styles.groupTitle, { color: surface.textMuted }]}>
            LEGAL & SAFETY
          </Text>
          <LinkRow
            mode={mode}
            icon="document-text-outline"
            title={t.privacyPolicyTitle}
            onPress={() => setLegalModal('privacy')}
          />
          <LinkRow
            mode={mode}
            icon="newspaper-outline"
            title={t.termsOfServiceTitle}
            onPress={() => setLegalModal('terms')}
          />
          <View style={styles.deleteWrap}>
            <PrimaryButton
              label={t.deleteAccountTitle}
              variant="danger"
              onPress={() => setDeleteModalOpen(true)}
              mode={colorScheme}
              icon="trash-outline"
            />
          </View>
        </SectionCard>

        <PrimaryButton
          label={t.logoutBtn}
          variant="outline"
          onPress={handleSignOut}
          mode={colorScheme}
          icon="log-out-outline"
        />
      </ScrollView>

      {/* ── Name edit modal ────────────────────────────────────────── */}
      <Modal
        visible={nameModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNameModalOpen(false)}
      >
        <Pressable
          style={[styles.modalScrim, { backgroundColor: surface.overlayScrim }]}
          onPress={() => setNameModalOpen(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: surface.surface1, borderColor: surface.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: surface.textPrimary }]}>
              Apna naam update karein
            </Text>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Poora naam"
              placeholderTextColor={surface.textMuted}
              maxLength={60}
              style={[
                styles.nameInput,
                {
                  backgroundColor: surface.surface2,
                  borderColor: surface.borderStrong,
                  color: surface.textPrimary,
                },
              ]}
            />
            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setNameModalOpen(false)}
                style={[styles.modalCancel, { borderColor: surface.borderStrong }]}
              >
                <Text style={[styles.modalCancelText, { color: surface.textSecondary }]}>
                  {t.cancelBtn}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSaveName}
                disabled={savingName || nameDraft.trim().length < 2}
                style={[
                  styles.modalSave,
                  {
                    backgroundColor: BRAND_COLORS.goldenYellow,
                    opacity: savingName || nameDraft.trim().length < 2 ? 0.5 : 1,
                  },
                ]}
              >
                <Text style={[styles.modalSaveText, { color: BRAND_COLORS.charcoalBlack }]}>
                  {savingName ? 'Saving…' : t.confirmBtn}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Legal modals ───────────────────────────────────────────── */}
      <Modal
        visible={legalModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLegalModal(null)}
      >
        <Pressable
          style={[styles.modalScrim, { backgroundColor: surface.overlayScrim }]}
          onPress={() => setLegalModal(null)}
        >
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: surface.surface1, borderColor: surface.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: surface.textPrimary }]}>
              {legalModal === 'privacy'
                ? t.privacyPolicyTitle
                : t.termsOfServiceTitle}
            </Text>
            <ScrollView style={styles.legalBody}>
              {legalModal === 'privacy' ? (
                <>
                  <Text style={[styles.legalText, { color: surface.textSecondary }]}>
                    Zaff-It aapka data aapke saath rakhta hai: naam, phone, delivery
                    addresses aur order history sirf service dene ke liye use hoti hai.
                  </Text>
                  <Text style={[styles.legalText, { color: surface.textSecondary }]}>
                    Hum individual-level profiling nahi karte. Wallet balance, ZaffID
                    aur referrals aapke account se linked hain aur account deletion
                    (DPDP Act 2023) me 7 din ke grace ke baad permanently erase hoti hai.
                  </Text>
                  <Text style={[styles.legalText, { color: surface.textSecondary }]}>
                    Payments Razorpay ke through process hote hain — card details kabhi
                    humare servers par store nahi hoti.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.legalText, { color: surface.textSecondary }]}>
                    Zaff-It ek hyperlocal marketplace hai — Makrana ke stores apne
                    products list karte hain; quality/fulfilment ki zimmedari store ki hai.
                  </Text>
                  <Text style={[styles.legalText, { color: surface.textSecondary }]}>
                    Orders accept hone ke baad delivery window 15–30 min (zone ke hisaab
                    se) hai. Cancellation policy order status page par available hai.
                    COD orders ke liye rider cash deposit verification zaroori hai.
                  </Text>
                  <Text style={[styles.legalText, { color: surface.textSecondary }]}>
                    Z-Coins 10 coins = ₹1 me redeem hote hain (order ke 10% tak, fees
                    chhod kar). Coins expire ho sakte hain — Wallet screen par dekhein.
                  </Text>
                </>
              )}
            </ScrollView>
            <PrimaryButton
              label={t.confirmBtn}
              onPress={() => setLegalModal(null)}
              mode={colorScheme}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Delete confirm modal ───────────────────────────────────── */}
      <Modal
        visible={deleteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalOpen(false)}
      >
        <Pressable
          style={[styles.modalScrim, { backgroundColor: surface.overlayScrim }]}
          onPress={() => setDeleteModalOpen(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: surface.surface1, borderColor: surface.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: surface.textPrimary }]}>
              {t.deleteAccountTitle}
            </Text>
            <Text style={[styles.legalText, { color: surface.textSecondary }]}>
              Aapka account, orders history, wallet aur ZaffID — sab 7 din ke grace ke
              baad permanently delete ho jayega (DPDP Act 2023). Kya aap sure hain?
            </Text>
            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setDeleteModalOpen(false)}
                style={[styles.modalCancel, { borderColor: surface.borderStrong }]}
              >
                <Text style={[styles.modalCancelText, { color: surface.textSecondary }]}>
                  {t.cancelBtn}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDeleteAccount}
                disabled={deleting}
                style={[
                  styles.modalDelete,
                  { backgroundColor: STATUS_COLORS.error, opacity: deleting ? 0.5 : 1 },
                ]}
              >
                <Text style={[styles.modalSaveText, { color: '#FFFFFF' }]}>
                  {deleting ? 'Deleting…' : t.deleteAccountConfirmBtn}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...TYPOGRAPHY.headlineMd,
  },
  phoneSub: {
    ...TYPOGRAPHY.bodySm,
    marginTop: 1,
  },
  themeBtn: {
    width: TOUCH_TARGETS.iconButtonSize,
    height: TOUCH_TARGETS.iconButtonSize,
    borderRadius: RADII.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: SPACING.screenPadding,
    gap: SPACING.md,
    paddingBottom: SPACING.xxxl,
  },
  successBanner: {
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  successBannerText: {
    ...TYPOGRAPHY.bodyMd,
    fontWeight: '600',
  },
  heroCard: {
    padding: SPACING.lg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: RADII.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 72,
    height: 72,
    borderRadius: RADII.full,
  },
  avatarText: {
    ...TYPOGRAPHY.displayLg,
    fontWeight: '900',
  },
  heroTextWrap: {
    flex: 1,
    gap: 3,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  heroName: {
    ...TYPOGRAPHY.headlineMd,
    flexShrink: 1,
  },
  nameEditBtn: {
    width: 28,
    height: 28,
    borderRadius: RADII.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPhone: {
    ...TYPOGRAPHY.bodySm,
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: 3,
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADII.full,
  },
  heroChipText: {
    ...TYPOGRAPHY.captionMin,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  groupCard: {
    gap: SPACING.xs,
    paddingTop: SPACING.cardPadding,
  },
  groupTitle: {
    ...TYPOGRAPHY.captionMin,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  comingSection: {
    gap: SPACING.xs,
  },
  comingScroll: {
    gap: SPACING.md,
    paddingRight: SPACING.screenPadding,
  },
  comingNoteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    padding: SPACING.md,
    marginTop: SPACING.xs,
  },
  comingNoteText: {
    ...TYPOGRAPHY.bodySm,
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  choiceChip: {
    minHeight: TOUCH_TARGETS.minSize - 8,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceChipText: {
    ...TYPOGRAPHY.labelMd,
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  roleChip: {
    minHeight: TOUCH_TARGETS.minSize - 8,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteWrap: {
    marginTop: SPACING.sm,
  },
  modalScrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: RADII.xl,
    borderWidth: 1,
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  modalTitle: {
    ...TYPOGRAPHY.headlineMd,
  },
  nameInput: {
    minHeight: 48,
    borderRadius: RADII.md,
    borderWidth: 1.5,
    paddingHorizontal: SPACING.md,
    ...TYPOGRAPHY.bodyLg,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'flex-end',
  },
  modalCancel: {
    minHeight: TOUCH_TARGETS.minSize,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    ...TYPOGRAPHY.labelMd,
  },
  modalSave: {
    minHeight: TOUCH_TARGETS.minSize,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDelete: {
    minHeight: TOUCH_TARGETS.minSize,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: {
    ...TYPOGRAPHY.labelMd,
  },
  legalBody: {
    maxHeight: 260,
  },
  legalText: {
    ...TYPOGRAPHY.bodyMd,
    marginBottom: SPACING.sm,
    lineHeight: 20,
  },
  personaCard: {
    borderWidth: 1,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  personaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  personaIconWrap: {
    width: 38,
    height: 38,
    borderRadius: RADII.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personaTitleCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  personaTitle: {
    ...TYPOGRAPHY.labelLg,
  },
  personaSub: {
    ...TYPOGRAPHY.captionMin,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  activePillText: {
    ...TYPOGRAPHY.captionMin,
    color: BRAND_COLORS.pureWhite,
  },
  personaDesc: {
    ...TYPOGRAPHY.bodySm,
    lineHeight: 19,
  },
  personaSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  personaSwitchText: {
    ...TYPOGRAPHY.labelMd,
  },
  bizBanner: {
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  bizTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  bizTitle: {
    ...TYPOGRAPHY.titleMd,
    color: BRAND_COLORS.charcoalBlack,
    flex: 1,
  },
  bizSub: {
    ...TYPOGRAPHY.bodySm,
    color: BRAND_COLORS.charcoalBlack,
    opacity: 0.8,
    lineHeight: 19,
  },
  bizCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    backgroundColor: BRAND_COLORS.charcoalBlack,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  bizCtaText: {
    ...TYPOGRAPHY.labelMd,
    color: BRAND_COLORS.goldenYellow,
  },
});
