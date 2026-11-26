import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  SURFACE_DARK,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { useAppStore } from '@/store/useAppStore';
import {
  getTranslation,
  LANGUAGE_LABELS,
  type AppLanguage,
} from '@/i18n/translations';
import { PrimaryButton } from '@/components/StateViews';

const LANGUAGES: AppLanguage[] = ['en', 'hi', 'hi-Latn'];

export const SplashAndOnboardingScreen: React.FC = () => {
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const t = getTranslation(language);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: SURFACE_DARK.background }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <View style={styles.etaBadge}>
            <Ionicons
              name="flash"
              size={14}
              color={BRAND_COLORS.pureWhite}
            />
            <Text style={styles.etaBadgeText}>{t.dynamicEtaBadge}</Text>
          </View>
        </View>

        <View style={styles.heroCenter}>
          <View style={styles.logoCard}>
            <Image
              source={require('../../../assets/zaff-it-logo.jpg')}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel="ZAFF-IT Infinity-Z Logo"
            />
          </View>
          <Text style={styles.brandWordmark}>ZAFF-IT</Text>
          <Text style={styles.cityPill}>MAKRANA PILOT</Text>

          <Text style={styles.tagline}>{t.onboardingTagline}</Text>
          <Text style={styles.subtext}>{t.onboardingSubtext}</Text>
        </View>

        <View style={styles.bottomSection}>
          <Text style={styles.langHeading}>{t.languageTitle}</Text>
          <View style={styles.langRow}>
            {LANGUAGES.map((code) => {
              const active = language === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => setLanguage(code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.langChip,
                    {
                      backgroundColor: active
                        ? BRAND_COLORS.goldenYellow
                        : SURFACE_DARK.surface2,
                      borderColor: active
                        ? BRAND_COLORS.goldenYellow
                        : SURFACE_DARK.borderStrong,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.langChipText,
                      {
                        color: active
                          ? BRAND_COLORS.charcoalBlack
                          : SURFACE_DARK.textPrimary,
                      },
                    ]}
                  >
                    {LANGUAGE_LABELS[code].native}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <PrimaryButton
            label={t.onboardingCta}
            onPress={completeOnboarding}
            mode="dark"
            icon="arrow-forward"
            style={styles.ctaBtn}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    padding: SPACING.screenPadding,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: SPACING.sm,
  },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: BRAND_COLORS.electricGreen,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.full,
    minHeight: 32,
  },
  etaBadgeText: {
    color: BRAND_COLORS.pureWhite,
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '700',
  },
  heroCenter: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  logoCard: {
    width: 148,
    height: 100,
    borderRadius: RADII.xl,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: SURFACE_DARK.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  logoImage: {
    width: 132,
    height: 88,
  },
  brandWordmark: {
    color: BRAND_COLORS.goldenYellow,
    fontSize: TYPOGRAPHY.displayLg.fontSize,
    lineHeight: TYPOGRAPHY.displayLg.lineHeight,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  cityPill: {
    marginTop: SPACING.xs,
    color: SURFACE_DARK.textSecondary,
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  tagline: {
    marginTop: SPACING.xl,
    color: SURFACE_DARK.textPrimary,
    fontSize: TYPOGRAPHY.headlineLg.fontSize,
    lineHeight: TYPOGRAPHY.headlineLg.lineHeight,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtext: {
    marginTop: SPACING.md,
    color: SURFACE_DARK.textMuted,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    lineHeight: TYPOGRAPHY.bodyMd.lineHeight,
    textAlign: 'center',
    maxWidth: 340,
  },
  bottomSection: {
    gap: SPACING.md,
    paddingBottom: SPACING.md,
  },
  langHeading: {
    color: SURFACE_DARK.textSecondary,
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '700',
    textAlign: 'center',
  },
  langRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'center',
  },
  langChip: {
    flex: 1,
    minHeight: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  langChipText: {
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '700',
  },
  ctaBtn: {
    marginTop: SPACING.sm,
  },
});
