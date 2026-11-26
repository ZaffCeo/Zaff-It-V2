import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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
  type ColorSchemeMode,
} from '@zaff-it/shared/tokens';

interface ThemeProps {
  mode?: ColorSchemeMode;
}

function getSurface(mode: ColorSchemeMode) {
  return mode === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;
}

/**
 * Primary 48dp+ accessible button enforcing ZAFF-IT brand contrast.
 */
export interface PrimaryButtonProps extends ThemeProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'success' | 'outline' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  mode = 'light',
  style,
  accessibilityLabel,
}) => {
  const surface = getSurface(mode);
  const isDisabled = disabled || loading;

  let backgroundColor: string = BRAND_COLORS.goldenYellow;
  let textColor: string = BRAND_COLORS.charcoalBlack;
  let borderColor: string = 'transparent';

  if (variant === 'success') {
    backgroundColor = BRAND_COLORS.electricGreen;
    textColor = BRAND_COLORS.pureWhite;
  } else if (variant === 'danger') {
    backgroundColor = STATUS_COLORS.error;
    textColor = BRAND_COLORS.pureWhite;
  } else if (variant === 'outline') {
    backgroundColor = surface.surface1;
    textColor = surface.textPrimary;
    borderColor = surface.borderStrong;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.buttonBase,
        {
          backgroundColor,
          borderColor,
          borderWidth: variant === 'outline' ? 1 : 0,
          opacity: isDisabled ? 0.55 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <View style={styles.buttonContent}>
          {icon !== undefined ? (
            <Ionicons
              name={icon}
              size={18}
              color={textColor}
              style={styles.buttonIcon}
            />
          ) : null}
          <Text style={[styles.buttonLabel, { color: textColor }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
};

/**
 * Animated loading skeleton cards for data-fetching screens.
 */
export interface LoadingSkeletonProps extends ThemeProps {
  rows?: number;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  rows = 3,
  mode = 'light',
}) => {
  const surface = getSurface(mode);
  const pulseAnim = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.9,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.45,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.skeletonContainer} accessibilityLabel="Loading content">
      {Array.from({ length: rows }).map((_, idx) => (
        <Animated.View
          key={`skeleton-row-${idx}`}
          style={[
            styles.skeletonCard,
            {
              backgroundColor: surface.surface2,
              borderColor: surface.border,
              opacity: pulseAnim,
            },
          ]}
        >
          <View
            style={[styles.skeletonAvatar, { backgroundColor: surface.surface3 }]}
          />
          <View style={styles.skeletonLines}>
            <View
              style={[
                styles.skeletonLineWide,
                { backgroundColor: surface.surface3 },
              ]}
            />
            <View
              style={[
                styles.skeletonLineShort,
                { backgroundColor: surface.surface3 },
              ]}
            />
          </View>
        </Animated.View>
      ))}
    </View>
  );
};

/**
 * Empty state with optional 48dp+ CTA.
 */
export interface EmptyStateProps extends ThemeProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'basket-outline',
  title,
  subtitle,
  ctaLabel,
  onCtaPress,
  mode = 'light',
}) => {
  const surface = getSurface(mode);

  return (
    <View
      style={[
        styles.emptyContainer,
        {
          backgroundColor: surface.surface1,
          borderColor: surface.border,
        },
      ]}
    >
      <View
        style={[
          styles.emptyIconCircle,
          { backgroundColor: BRAND_COLORS.goldenYellowGlow },
        ]}
      >
        <Ionicons name={icon} size={32} color={BRAND_COLORS.charcoalBlack} />
      </View>
      <Text style={[styles.emptyTitle, { color: surface.textPrimary }]}>
        {title}
      </Text>
      <Text style={[styles.emptySubtitle, { color: surface.textMuted }]}>
        {subtitle}
      </Text>
      {ctaLabel !== undefined && onCtaPress !== undefined ? (
        <PrimaryButton
          label={ctaLabel}
          onPress={onCtaPress}
          mode={mode}
          style={styles.emptyCta}
        />
      ) : null}
    </View>
  );
};

/**
 * Error & Retry banner with >=48dp retry button.
 */
export interface ErrorRetryBannerProps extends ThemeProps {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

export const ErrorRetryBanner: React.FC<ErrorRetryBannerProps> = ({
  message,
  retryLabel,
  onRetry,
  mode = 'light',
}) => {
  const isDark = mode === 'dark';
  const bg = isDark ? STATUS_COLORS.errorBgDark : STATUS_COLORS.errorBgLight;
  const fg = isDark ? STATUS_COLORS.errorBright : STATUS_COLORS.errorTextLight;

  return (
    <View
      style={[
        styles.errorBanner,
        { backgroundColor: bg, borderColor: STATUS_COLORS.error },
      ]}
      accessibilityRole="alert"
    >
      <View style={styles.errorHeaderRow}>
        <Ionicons name="alert-circle" size={20} color={fg} />
        <Text style={[styles.errorMessage, { color: fg }]}>{message}</Text>
      </View>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={retryLabel}
        style={({ pressed }) => [
          styles.retryButton,
          {
            backgroundColor: STATUS_COLORS.error,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Ionicons name="refresh" size={16} color={BRAND_COLORS.pureWhite} />
        <Text style={styles.retryButtonText}>{retryLabel}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  buttonBase: {
    minHeight: TOUCH_TARGETS.primaryCtaHeight,
    minWidth: TOUCH_TARGETS.minSize,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: SPACING.sm,
  },
  buttonLabel: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  skeletonContainer: {
    gap: SPACING.md,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.cardPadding,
    borderRadius: RADII.md,
    borderWidth: 1,
  },
  skeletonAvatar: {
    width: 48,
    height: 48,
    borderRadius: RADII.sm,
  },
  skeletonLines: {
    flex: 1,
    marginLeft: SPACING.md,
    gap: SPACING.sm,
  },
  skeletonLineWide: {
    height: 14,
    width: '78%',
    borderRadius: RADII.xs,
  },
  skeletonLineShort: {
    height: 12,
    width: '48%',
    borderRadius: RADII.xs,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: SPACING.xl,
    borderRadius: RADII.lg,
    borderWidth: 1,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: RADII.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.headlineMd.fontSize,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    lineHeight: TYPOGRAPHY.bodyMd.lineHeight,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  emptyCta: {
    minWidth: 180,
  },
  errorBanner: {
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  errorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  errorMessage: {
    flex: 1,
    fontSize: TYPOGRAPHY.bodyMd.fontSize,
    fontWeight: '600',
  },
  retryButton: {
    minHeight: TOUCH_TARGETS.recommendedSize,
    borderRadius: RADII.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  retryButtonText: {
    color: BRAND_COLORS.pureWhite,
    fontSize: TYPOGRAPHY.labelLg.fontSize,
    fontWeight: '700',
  },
});
