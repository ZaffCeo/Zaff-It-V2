import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  BRAND_COLORS,
  GLOW,
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

/**
 * Premium splash & onboarding (Design System v2).
 * Full-bleed brand hero: golden infinity logo, ZAFF-IT wordmark and the
 * Makrana rider mascot over a charcoal-gold cinematic backdrop, followed by
 * language selection and the golden CTA.
 */
export const SplashAndOnboardingScreen: React.FC = () => {
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const t = getTranslation(language);

  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(1.04)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 550,
        useNativeDriver: true,
      }),
      Animated.timing(heroScale, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(160),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [heroOpacity, heroScale, contentOpacity]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Cinematic hero: logo, wordmark & rider rendered in the artwork */}
      <Animated.View
        style={[
          styles.heroWrap,
          { opacity: heroOpacity, transform: [{ scale: heroScale }] },
        ]}
      >
        <Image
          source={require('../../../assets/splash-rider-hero.png')}
          style={styles.heroImage}
          resizeMode="cover"
          accessibilityLabel="ZAFF-IT — Need It? Zaff-It"
        />
        <Animated.View
          style={[styles.heroFadeBottom, { opacity: contentOpacity }]}
          pointerEvents="none"
        />
      </Animated.View>

      <SafeAreaView style={styles.bottomSheet} edges={['bottom', 'left', 'right']}>
        <Animated.View
          style={[styles.bottomContent, { opacity: contentOpacity }]}
        >
          <View style={styles.trustRow}>
            <View style={styles.trustPill}>
              <Ionicons name="flash" size={13} color={BRAND_COLORS.goldenYellow} />
              <Text style={styles.trustText}>{t.dynamicEtaBadge}</Text>
            </View>
            <View style={styles.trustPill}>
              <Ionicons
                name="shield-checkmark"
                size={13}
                color={BRAND_COLORS.goldenYellow}
              />
              <Text style={styles.trustText}>100% Secure</Text>
            </View>
            <View style={styles.trustPill}>
              <Ionicons name="cash-outline" size={13} color={BRAND_COLORS.goldenYellow} />
              <Text style={styles.trustText}>COD Available</Text>
            </View>
          </View>

          <Text style={styles.langHeading}>{t.languageTitle}</Text>
          <View style={styles.langRow}>
            {LANGUAGES.map((code) => {
              const active = language === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setLanguage(code);
                  }}
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
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              completeOnboarding();
            }}
            mode="dark"
            icon="arrow-forward"
            style={styles.ctaBtn}
          />

          <Text style={styles.footerText}>
            Makrana Pilot · ZaffmIND Technology
          </Text>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SURFACE_DARK.canvasLowest,
  },
  heroWrap: {
    flex: 1,
    backgroundColor: SURFACE_DARK.canvasLowest,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
    backgroundColor: 'rgba(11,12,14,0.85)',
  },
  bottomSheet: {
    backgroundColor: SURFACE_DARK.canvasLowest,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
  },
  bottomContent: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    gap: SPACING.md,
  },
  trustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    justifyContent: 'center',
  },
  trustPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SURFACE_DARK.surface2,
    borderColor: SURFACE_DARK.border,
    borderWidth: 1,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.md,
    minHeight: 32,
  },
  trustText: {
    color: SURFACE_DARK.textSecondary,
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '700',
  },
  langHeading: {
    color: SURFACE_DARK.textSecondary,
    fontSize: TYPOGRAPHY.labelMd.fontSize,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: SPACING.xs,
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
    marginTop: SPACING.xs,
    ...GLOW.goldSoft,
  },
  footerText: {
    color: SURFACE_DARK.textMuted,
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
