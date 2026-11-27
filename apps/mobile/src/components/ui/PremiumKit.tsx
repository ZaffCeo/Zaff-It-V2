/**
 * ZAFF-IT Premium UI Kit (2026 design language)
 *
 * Trend stack (Nov 2026 research-driven):
 *  - Functional micro-interactions: spring press scales + haptics (standard, not decorative)
 *  - Glassmorphism 2.0: surgical — floating/overlay surfaces only
 *  - Bento grid tiles for modular dashboards
 *  - Dark-mode 2.0 surface elevation + soft tactile glow depth
 *  - Kinetic entrance choreography (staggered fade/slide)
 *  - Thumb-friendly: primary actions bottom-anchored, >=44pt targets
 *
 * Dependencies already in the app: react-native-reanimated v4,
 * expo-linear-gradient, expo-haptics.
 */
import React, { useEffect } from 'react';
import {
  Easing,
  Image,
  ImageStyle,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  BRAND_COLORS,
  GLOW,
  RADII,
  SPACING,
} from '@zaff-it/shared/tokens';

/* ------------------------------------------------------------------ */
/* PressableScale — functional micro-interaction (spring press + haptic) */
/* ------------------------------------------------------------------ */

type PressableScaleProps = PressableProps & {
  /** Scale down while pressed (default 0.96). */
  pressScale?: number;
  /** Light haptic on press-in (off for quiet flows). */
  haptic?: boolean;
  containerStyle?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
};

export function PressableScale({
  pressScale = 0.96,
  haptic = true,
  containerStyle,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const wrap: ViewStyle[] = Array.isArray(containerStyle)
    ? containerStyle
    : containerStyle
      ? [containerStyle]
      : [];

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        scale.value = withSpring(pressScale, { damping: 18, stiffness: 320 });
        if (haptic && rest.disabled !== true) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 260 });
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[animatedStyle, ...wrap]}>{children}</Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* GlowButton — primary CTA with gold glow + spring press (thumb zone) */
/* ------------------------------------------------------------------ */

type GlowButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  variant?: 'gold' | 'green' | 'dark';
  style?: ViewStyle | ViewStyle[];
};

export function GlowButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
  variant = 'gold',
  style,
}: GlowButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const palette: readonly [string, string] =
    variant === 'gold'
      ? [BRAND_COLORS.goldenYellow, '#FFD633']
      : variant === 'green'
        ? [BRAND_COLORS.electricGreen, '#0DA626']
        : ['#2A2E33', '#1C1F23'];

  const glowColor =
    variant === 'gold'
      ? GLOW.gold.shadowColor
      : variant === 'green'
        ? 'rgba(12,131,31,0.35)'
        : 'rgba(0,0,0,0.35)';

  const outerStyle = Array.isArray(style) ? style : style ? [style] : [];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 18, stiffness: 340 });
        if (!disabled && !loading) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 260 });
      }}
      style={outerStyle}
    >
      <Animated.View
        style={[
          glowBtnStyles.btn,
          animatedStyle,
          disabled || loading ? { opacity: 0.55 } : null,
          { shadowColor: glowColor },
        ]}
      >
        <LinearGradient
          colors={palette}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={glowBtnStyles.gradient}
        >
          {loading ? (
            <Text style={glowBtnStyles.label}>…</Text>
          ) : (
            <>
              {icon ? (
                <Ionicons
                  name={icon as React.ComponentProps<typeof Ionicons>['name']}
                  size={18}
                  color={BRAND_COLORS.charcoalBlack}
                />
              ) : null}
              <Text style={glowBtnStyles.label}>{label}</Text>
            </>
          )}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const glowBtnStyles = StyleSheet.create({
  btn: {
    borderRadius: RADII.lg,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 6,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    minHeight: 48,
  },
  label: {
    color: BRAND_COLORS.charcoalBlack,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

/* ------------------------------------------------------------------ */
/* ShimmerBox — skeleton shimmer (glass sweep)                         */
/* ------------------------------------------------------------------ */

export function ShimmerBox({
  width,
  height,
  radius = RADII.md,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const sweep = useSharedValue(-1);

  useEffect(() => {
    sweep.value = withDelay(
      120,
      withRepeat(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        -1,
        false,
      ),
    );
  }, [sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweep.value * 320 }],
  }));

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: -120,
            width: 120,
          },
          sweepStyle,
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,199,3,0.13)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* GlassCard — Glassmorphism 2.0 (surgical: overlays/floating only)    */
/* ------------------------------------------------------------------ */

export function GlassCard({
  children,
  style,
  tint = 'rgba(255,255,255,0.07)',
  border = 'rgba(255,255,255,0.14)',
}: {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  tint?: string;
  border?: string;
}) {
  const wrap = Array.isArray(style) ? style : style ? [style] : [];
  return (
    <View
      style={[
        {
          backgroundColor: tint,
          borderColor: border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: RADII.xl,
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        },
        ...wrap,
      ]}
    >
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* GradientBanner — premium promo banner with entrance choreography    */
/* ------------------------------------------------------------------ */

export type BannerSlide = {
  headline: string;
  sub: string;
  cta: string;
  icon?: string;
  palette?: [string, string, string];
  /** Small badge shown above the headline. Defaults to 'Offer' — only pass
   * 'Sponsored' when the slide genuinely is a paid placement. */
  badge?: string;
};

export function GradientBanner({
  slide,
  index = 0,
  totalSlides = 1,
  onPressCta,
  image,
}: {
  slide: BannerSlide;
  index?: number;
  totalSlides?: number;
  onPressCta?: () => void;
  image?: number;
}) {
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = 0;
    enter.value = withDelay(
      30,
      withSpring(1, { damping: 20, stiffness: 200 }),
    );
  }, [slide.headline, enter]);

  const entrance = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: (1 - enter.value) * 14 },
      { scale: 0.985 + enter.value * 0.015 },
    ],
  }));

  const palette = slide.palette ?? [
    '#1C1F23',
    '#121416',
    BRAND_COLORS.goldenYellow,
  ];

  return (
    <Animated.View style={[bannerStyles.wrap, entrance]}>
      <LinearGradient
        colors={palette}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={bannerStyles.gradient}
      >
        <View style={bannerStyles.left}>
          <View style={bannerStyles.sponsoredPill}>
            <Text style={bannerStyles.sponsoredText}>
              {slide.badge ?? 'Offer'}
            </Text>
          </View>
          <Text style={bannerStyles.headline} numberOfLines={2}>
            {slide.headline}
          </Text>
          <Text style={bannerStyles.sub} numberOfLines={1}>
            {slide.sub}
          </Text>
          <PressableScale
            onPress={onPressCta}
            containerStyle={bannerStyles.ctaWrap}
            accessibilityRole="button"
            accessibilityLabel={slide.cta}
          >
            <View style={bannerStyles.cta}>
              <Text style={bannerStyles.ctaText}>{slide.cta}</Text>
              <Ionicons
                name="arrow-forward"
                size={14}
                color={BRAND_COLORS.charcoalBlack}
              />
            </View>
          </PressableScale>
        </View>

        {image !== undefined ? (
          <Animated.View style={[bannerStyles.art, bannerStyles.artClip, entrance]}>
            <Image
              source={image}
              style={bannerStyles.artImage as ImageStyle}
              resizeMode="cover"
              accessibilityLabel={slide.headline}
            />
            {/* Readability scrim — blends the art into the gradient surface */}
            <LinearGradient
              colors={[palette[1], 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 0.55, y: 0.5 }}
              style={bannerStyles.artScrim}
              pointerEvents="none"
            />
          </Animated.View>
        ) : (
          <Animated.View style={[bannerStyles.art, bannerStyles.artFallback, entrance]}>
            <Ionicons
              name={(slide.icon ?? 'sparkles') as React.ComponentProps<typeof Ionicons>['name']}
              color={BRAND_COLORS.goldenYellow}
              size={44}
            />
          </Animated.View>
        )}

        {totalSlides > 1 ? (
          <View style={bannerStyles.dotsRow} pointerEvents="none">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <View
                key={i}
                style={[
                  bannerStyles.dot,
                  i === index ? bannerStyles.dotActive : null,
                ]}
              />
            ))}
          </View>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}

const bannerStyles = StyleSheet.create({
  artScrim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  wrap: { borderRadius: RADII.xl, overflow: 'hidden' },
  gradient: {
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    minHeight: 148,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  left: { flex: 1, maxWidth: '62%', gap: 4 },
  sponsoredPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  sponsoredText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  headline: {
    color: BRAND_COLORS.pureWhite,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.1,
  },
  sub: {
    color: BRAND_COLORS.goldenYellow,
    fontSize: 13,
    fontWeight: '700',
  },
  ctaWrap: { alignSelf: 'flex-start', marginTop: SPACING.sm },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: GLOW.gold.shadowColor,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  ctaText: {
    color: BRAND_COLORS.charcoalBlack,
    fontWeight: '800',
    fontSize: 13,
  },
  art: {
    width: 118,
    height: 118,
    borderRadius: RADII.lg,
    alignSelf: 'center',
  },
  artClip: { overflow: 'hidden' },
  artImage: {
    width: '100%' as unknown as number,
    height: '100%' as unknown as number,
  } as ImageStyle,
  artFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,199,3,0.35)',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  dotActive: {
    backgroundColor: BRAND_COLORS.goldenYellow,
    width: 14,
  },
});

/* ------------------------------------------------------------------ */
/* BentoTile — bento grid stat tile (dashboards)                       */
/* ------------------------------------------------------------------ */

export function BentoTile({
  label,
  value,
  icon,
  accent = BRAND_COLORS.goldenYellow,
  onPress,
}: {
  label: string;
  value: string;
  icon?: string;
  accent?: string;
  onPress?: () => void;
}) {
  const content = (
    <View
      style={[
        bentoStyles.tile,
        { borderColor: `${accent}33` },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon as React.ComponentProps<typeof Ionicons>['name']}
          color={accent}
          size={18}
        />
      ) : null}
      <Text style={bentoStyles.value}>{value}</Text>
      <Text style={bentoStyles.label}>{label}</Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <PressableScale onPress={onPress}>{content}</PressableScale>
  );
}

const bentoStyles = StyleSheet.create({
  tile: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: RADII.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md,
    gap: 2,
    minHeight: 76,
  },
  value: {
    color: BRAND_COLORS.pureWhite,
    fontSize: 18,
    fontWeight: '900',
  },
  label: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

/* ------------------------------------------------------------------ */
/* FreeDeliveryProgressBar — smart nudge ("₹X aur → FREE delivery")    */
/* ------------------------------------------------------------------ */

export function FreeDeliveryProgressBar({
  currentPaise,
  thresholdPaise,
}: {
  currentPaise: number;
  thresholdPaise: number;
}) {
  const pct = Math.max(0, Math.min(1, currentPaise / Math.max(1, thresholdPaise)));
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(pct, { duration: 650, easing: Easing.out(Easing.quad) });
  }, [pct, progress]);

  const barStyle = useAnimatedStyle(() => ({ flex: progress.value }));
  const remaining = Math.max(0, thresholdPaise - currentPaise);
  const unlocked = remaining <= 0;

  return (
    <View style={freeDelStyles.wrap}>
      <View style={freeDelStyles.track}>
        <Animated.View style={[freeDelStyles.fill, barStyle]} />
      </View>
      <Text style={freeDelStyles.label}>
        {unlocked
          ? 'FREE delivery unlocked!'
          : `Add ${formatINRShort(remaining)} more → FREE delivery`}
      </Text>
    </View>
  );
}

function formatINRShort(paise: number): string {
  const rupees = Math.ceil(paise / 100);
  return `₹${rupees}`;
}

const freeDelStyles = StyleSheet.create({
  wrap: { gap: 6, paddingVertical: 4 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  fill: {
    backgroundColor: BRAND_COLORS.goldenYellow,
    borderRadius: 4,
    shadowColor: GLOW.gold.shadowColor,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  label: {
    color: BRAND_COLORS.goldenYellow,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

/* ------------------------------------------------------------------ */
/* SavingsChip — "You saved ₹X" proof strip                            */
/* ------------------------------------------------------------------ */

export function SavingsChip({ savedPaise }: { savedPaise: number }) {
  if (savedPaise <= 0) return null;
  return (
    <View style={saveStyles.chip}>
      <Ionicons name="pricetag" color={BRAND_COLORS.electricGreen} size={14} />
      <Text style={saveStyles.text}>
        You saved {formatINRShort(savedPaise)} on this order
      </Text>
    </View>
  );
}

const saveStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(12,131,31,0.14)',
    borderColor: 'rgba(12,131,31,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  text: {
    color: BRAND_COLORS.electricGreen,
    fontSize: 12,
    fontWeight: '800',
  },
});

/* ------------------------------------------------------------------ */
/* AssuranceStrip — trust row (secure · COD · live ETA · easy refund)  */
/* ------------------------------------------------------------------ */

export function AssuranceStrip({
  items,
  mode = 'dark',
}: {
  items: { icon: string; label: string }[];
  /** Surface mode — chips must stay visible on light AND dark themes. */
  mode?: 'dark' | 'light';
}) {
  const dark = mode === 'dark';
  return (
    <View style={assureStyles.row}>
      {items.map((it) => (
        <View
          key={it.label}
          style={[
            assureStyles.item,
            dark
              ? null
              : {
                  backgroundColor: 'rgba(18,20,22,0.92)',
                  borderColor: 'rgba(18,20,22,0.92)',
                },
          ]}
        >
          <Ionicons
            name={it.icon as React.ComponentProps<typeof Ionicons>['name']}
            color={BRAND_COLORS.goldenYellow}
            size={13}
          />
          <Text style={[assureStyles.label, !dark && { color: '#FFFFFF' }]}>
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const assureStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  label: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

/* ------------------------------------------------------------------ */
/* StaggerIn — entrance choreography wrapper (kinetic lists)           */
/* ------------------------------------------------------------------ */

export function StaggerIn({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withDelay(
      Math.min(index, 10) * 55,
      withSpring(1, { damping: 22, stiffness: 220 }),
    );
  }, [enter, index]);
  const a = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 18 }],
  }));
  const wrap = Array.isArray(style) ? style : style ? [style] : [];
  return (
    <Animated.View style={[a, ...wrap]}>{children}</Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* PulsingDot — live/active indicator (tracking, dashboards)           */
/* ------------------------------------------------------------------ */

export function PulsingDot({
  color = BRAND_COLORS.electricGreen,
}: {
  color?: string;
}) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSpring(1.35, { damping: 8, stiffness: 180 }),
      -1,
      true,
    );
  }, [pulse]);
  const a = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 2 - pulse.value * 0.8,
  }));
  return (
    <View
      style={{
        width: 10,
        height: 10,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={[
          { width: 8, height: 8, borderRadius: 4, backgroundColor: color },
          a,
        ]}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* SectionHeading — consistent premium section headers                 */
/* ------------------------------------------------------------------ */

export function SectionHeading({
  title,
  actionLabel,
  onAction,
  style,
  titleStyle,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
  titleStyle?: TextStyle;
}) {
  return (
    <View style={[secStyles.row, style]}>
      <Text style={[secStyles.title, titleStyle]}>{title}</Text>
      {actionLabel && onAction ? (
        <PressableScale onPress={onAction} pressScale={0.94}>
          <Text style={secStyles.action}>{actionLabel}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const secStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: BRAND_COLORS.pureWhite,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  action: {
    color: BRAND_COLORS.goldenYellow,
    fontSize: 13,
    fontWeight: '800',
  },
});
