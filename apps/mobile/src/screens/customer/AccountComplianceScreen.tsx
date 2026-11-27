import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CustomerStackParamList } from '@/navigation/RootNavigator';
import { Ionicons } from '@expo/vector-icons';
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
import { useAppStore, type UserRole } from '@/store/useAppStore';
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

const LANGUAGES: AppLanguage[] = ['en', 'hi', 'hi-Latn'];
const ROLES: { id: UserRole; label: string }[] = [
  { id: 'customer', label: 'Customer' },
  { id: 'merchant', label: 'Merchant' },
  { id: 'rider', label: 'Rider' },
  { id: 'admin', label: 'Admin' },
];

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
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDone, setDeleteDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLanguageChange = async (nextLang: AppLanguage) => {
    setLanguage(nextLang);
    if (isSupabaseConfigured() && userId !== null) {
      await supabase
        .from('profiles')
        .update({ preferred_language: nextLang })
        .eq('id', userId);
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
            {phone ?? 'Makrana Customer'}
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
            onRetry={handleDeleteAccount}
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

        {/* Language Switcher */}
        <View
          style={[
            styles.card,
            { backgroundColor: surface.surface1, borderColor: surface.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
            {t.languageTitle}
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
        </View>

        {/* Workspace Role Switcher */}
        <View
          style={[
            styles.card,
            { backgroundColor: surface.surface1, borderColor: surface.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
            {t.workspaceRoleTitle}
          </Text>
          <View style={styles.roleGrid}>
            {ROLES.map((item) => {
              const active = role === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setRole(item.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.roleChip,
                    {
                      backgroundColor: active
                        ? BRAND_COLORS.electricGreen
                        : surface.surface2,
                      borderColor: active
                        ? BRAND_COLORS.electricGreen
                        : surface.borderStrong,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceChipText,
                      {
                        color: active
                          ? BRAND_COLORS.pureWhite
                          : surface.textPrimary,
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Privacy Policy, Terms & Account Deletion */}
        <View
          style={[
            styles.card,
            { backgroundColor: surface.surface1, borderColor: surface.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: surface.textPrimary }]}>
            {t.legalSectionTitle}
          </Text>

          <Pressable
            onPress={() => navigation.navigate('Pro')}
            accessibilityRole="button"
            style={[styles.legalRow, { borderColor: BRAND_COLORS.goldenYellow }]}
          >
            <Text style={[styles.legalRowText, { color: BRAND_COLORS.goldenYellow, fontWeight: '900' }]}>
              Zaff Pro — Free delivery + ₹0 handling
            </Text>
            <Ionicons
              name="shield-checkmark"
              size={18}
              color={BRAND_COLORS.goldenYellow}
            />
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('Invite')}
            accessibilityRole="button"
            style={[styles.legalRow, { borderColor: BRAND_COLORS.goldenYellow }]}
          >
            <Text style={[styles.legalRowText, { color: BRAND_COLORS.goldenYellow, fontWeight: '900' }]}>
              Invite & Earn — Gift ₹50, Get ₹50
            </Text>
            <Ionicons
              name="gift"
              size={18}
              color={BRAND_COLORS.goldenYellow}
            />
          </Pressable>

          <Pressable
            onPress={() => setLegalModal('privacy')}
            accessibilityRole="button"
            style={[styles.legalRow, { borderColor: surface.border }]}
          >
            <Text style={[styles.legalRowText, { color: surface.textPrimary }]}>
              {t.privacyPolicyTitle}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={surface.textMuted}
            />
          </Pressable>

          <Pressable
            onPress={() => setLegalModal('terms')}
            accessibilityRole="button"
            style={[styles.legalRow, { borderColor: surface.border }]}
          >
            <Text style={[styles.legalRowText, { color: surface.textPrimary }]}>
              {t.termsOfServiceTitle}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={surface.textMuted}
            />
          </Pressable>

          <PrimaryButton
            label={t.deleteAccountTitle}
            variant="danger"
            onPress={() => setDeleteModalOpen(true)}
            mode={colorScheme}
            icon="trash-outline"
          />
        </View>

        <PrimaryButton
          label={t.logoutBtn}
          variant="outline"
          onPress={handleSignOut}
          mode={colorScheme}
          icon="log-out-outline"
        />
      </ScrollView>

      {/* Privacy / Terms Viewer Modal */}
      <Modal
        visible={legalModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setLegalModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
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
            <Text style={[styles.modalBody, { color: surface.textSecondary }]}>
              {legalModal === 'privacy'
                ? 'ZAFF-IT (Zaff Technology, Makrana) collects only your mobile number, delivery coordinates, and order history to fulfill hyperlocal deliveries under the Digital Personal Data Protection (DPDP) Act. You may request permanent deletion at any time.'
                : 'Orders are fulfilled by local Makrana partner merchants with dynamic store-and-road ETAs. Cancellations are permitted prior to rider pickup. Prices are validated on the server in integer paise.'}
            </Text>
            <PrimaryButton
              label={t.confirmBtn}
              onPress={() => setLegalModal(null)}
              mode={colorScheme}
            />
          </View>
        </View>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={deleteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: surface.surface1, borderColor: surface.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: surface.textPrimary }]}>
              {t.deleteAccountTitle}
            </Text>
            <Text style={[styles.modalBody, { color: surface.textMuted }]}>
              {t.deleteAccountWarning}
            </Text>
            <View style={styles.modalActions}>
              <PrimaryButton
                label={t.cancelBtn}
                variant="outline"
                onPress={() => setDeleteModalOpen(false)}
                mode={colorScheme}
                style={styles.modalBtn}
              />
              <PrimaryButton
                label={t.deleteAccountConfirmBtn}
                variant="danger"
                loading={deleting}
                onPress={handleDeleteAccount}
                mode={colorScheme}
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '700',
  },
  phoneSub: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    marginTop: 2,
  },
  themeBtn: {
    width: TOUCH_TARGETS.minSize,
    height: TOUCH_TARGETS.minSize,
    borderRadius: RADII.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: SPACING.screenPadding,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  successBanner: {
    padding: SPACING.md,
    borderRadius: RADII.md,
  },
  successBannerText: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '600',
  },
  card: {
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    borderWidth: 1,
    gap: SPACING.md,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  choiceChip: {
    flex: 1,
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceChipText: {
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '700',
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  roleChip: {
    minWidth: '47%',
    flexGrow: 1,
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderBottomWidth: 1,
  },
  legalRowText: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: SPACING.screenPadding,
  },
  modalCard: {
    borderRadius: RADII.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '700',
  },
  modalBody: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    lineHeight: TYPOGRAPHY.bodyMd.lineHeight,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  modalBtn: {
    flex: 1,
  },
});
