/**
 * Chrome — shared premium UI chrome for Wave-A polish.
 * ScreenHeader / SectionCard / StatTile / LinkRow / ComingSoonCard / StatusChip.
 * Every component is mode-aware (dark/light) and uses the shared token system.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BRAND_COLORS,
  DEPTH,
  RADII,
  SPACING,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';

export type ChromeMode = 'dark' | 'light';

const surfaceFor = (mode: ChromeMode): any =>
  mode === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

const TONE_PALETTE = {
  success: {
    bgDark: 'rgba(12,131,31,0.18)',
    bgLight: '#DCFCE7',
    fgDark: BRAND_COLORS.electricGreenLight,
    fgLight: '#0A6919',
  },
  warning: {
    bgDark: 'rgba(245,158,11,0.18)',
    bgLight: '#FEF3C7',
    fgDark: '#F59E0B',
    fgLight: '#92400E',
  },
  error: {
    bgDark: 'rgba(220,38,38,0.18)',
    bgLight: '#FEE2E2',
    fgDark: '#EF4444',
    fgLight: '#991B1B',
  },
  info: {
    bgDark: 'rgba(37,99,235,0.18)',
    bgLight: '#DBEAFE',
    fgDark: '#60A5FA',
    fgLight: '#1E40AF',
  },
  gold: {
    bgDark: 'rgba(255,199,3,0.16)',
    bgLight: BRAND_COLORS.goldSoft,
    fgDark: BRAND_COLORS.goldenYellow,
    fgLight: '#8A6D00',
  },
} as const;

export type ChipTone = keyof typeof TONE_PALETTE;

// ---------------------------------------------------------------------------
// ScreenHeader — 44dp back, title stack, optional right node
// ---------------------------------------------------------------------------
export const ScreenHeader: React.FC<{
  title: string;
  subtitle?: string;
  mode: ChromeMode;
  onBack?: () => void;
  right?: React.ReactNode;
}> = ({ title, subtitle, mode, onBack, right }) => {
  const surface = surfaceFor(mode);
  return (
    <View style={[styles.header, { borderBottomColor: surface.border }]}>
      {onBack !== undefined ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={[
            styles.backBtn,
            { backgroundColor: surface.surface2, borderColor: surface.border },
          ]}
        >
          <Ionicons name="arrow-back" size={20} color={surface.textPrimary} />
        </Pressable>
      ) : (
        <View style={styles.headerSpacer} />
      )}
      <View style={styles.headerTextWrap}>
        <Text
          numberOfLines={1}
          style={[styles.headerTitle, { color: surface.textPrimary }]}
        >
          {title}
        </Text>
        {subtitle !== undefined ? (
          <Text
            numberOfLines={1}
            style={[styles.headerSub, { color: surface.textMuted }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right !== undefined ? <View>{right}</View> : <View style={styles.headerSpacer} />}
    </View>
  );
};

// ---------------------------------------------------------------------------
// SectionCard — consistent premium card
// ---------------------------------------------------------------------------
export const SectionCard: React.FC<{
  mode: ChromeMode;
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}> = ({ mode, children, style }) => {
  const surface = surfaceFor(mode);
  const extra: any[] = Array.isArray(style)
    ? (style as any[])
    : style !== undefined
      ? [style as any]
      : [];
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: surface.surface1,
          borderColor: surface.border,
        },
        mode === 'dark' ? DEPTH.cardDark : DEPTH.cardLight,
        ...extra,
      ]}
    >
      {children}
    </View>
  );
};

// ---------------------------------------------------------------------------
// StatTile — hero stat (value + label + icon)
// ---------------------------------------------------------------------------
export const StatTile: React.FC<{
  mode: ChromeMode;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  accent?: boolean;
  onPress?: () => void;
}> = ({ mode, icon, value, label, accent = false, onPress }) => {
  const surface = surfaceFor(mode);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[
        styles.statTile,
        {
          backgroundColor: accent
            ? mode === 'dark'
              ? 'rgba(255,199,3,0.10)'
              : BRAND_COLORS.goldSoft
            : surface.surface2,
          borderColor: accent ? BRAND_COLORS.goldBorder : surface.border,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={16}
        color={accent ? BRAND_COLORS.goldenYellow : surface.textMuted}
      />
      <Text
        numberOfLines={1}
        style={[styles.statValue, { color: surface.textPrimary }]}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.statLabel, { color: surface.textMuted }]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// LinkRow — 56dp navigable row with icon, title, subtitle, chevron
// ---------------------------------------------------------------------------
export const LinkRow: React.FC<{
  mode: ChromeMode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  tint?: string;
  badge?: string;
  last?: boolean;
}> = ({ mode, icon, title, subtitle, onPress, tint, badge, last = false }) => {
  const surface = surfaceFor(mode);
  const rowTint = tint ?? surface.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[
        styles.linkRow,
        !last
          ? {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: surface.borderAlt,
            }
          : null,
      ]}
    >
      <View
        style={[
          styles.linkIcon,
          {
            backgroundColor:
              tint !== undefined
                ? mode === 'dark'
                  ? 'rgba(255,199,3,0.12)'
                  : BRAND_COLORS.goldSoft
                : surface.surface2,
          },
        ]}
      >
        <Ionicons name={icon} size={18} color={rowTint} />
      </View>
      <View style={styles.linkTextWrap}>
        <Text
          numberOfLines={1}
          style={[styles.linkTitle, { color: surface.textPrimary }]}
        >
          {title}
          {badge !== undefined ? (
            <Text style={[styles.linkBadge, { color: BRAND_COLORS.goldenYellow }]}>
              {'  '}{badge}
            </Text>
          ) : null}
        </Text>
        {subtitle !== undefined ? (
          <Text
            numberOfLines={1}
            style={[styles.linkSub, { color: surface.textMuted }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={surface.textMuted} />
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// ComingSoonCard — HONEST placeholder for pre-launch verticals.
// Clearly labelled "COMING SOON" — never presented as functional.
// ---------------------------------------------------------------------------
export const ComingSoonCard: React.FC<{
  mode: ChromeMode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  note?: string;
  onPress?: () => void;
  width?: number;
}> = ({ mode, icon, title, subtitle, note, onPress, width = 210 }) => {
  const surface = surfaceFor(mode);
  const chipFg = mode === 'dark' ? BRAND_COLORS.goldenYellow : '#8A6D00';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[
        styles.comingCard,
        {
          width,
          backgroundColor: mode === 'dark' ? 'rgba(255,199,3,0.08)' : BRAND_COLORS.goldSoft,
          borderColor: BRAND_COLORS.goldBorder,
        },
      ]}
    >
      <View style={styles.comingTopRow}>
        <View style={styles.comingIcon}>
          <Ionicons name={icon} size={20} color={BRAND_COLORS.charcoalBlack} />
        </View>
        <View style={styles.comingChip}>
          <Text style={[styles.comingChipText, { color: chipFg }]}>COMING SOON</Text>
        </View>
      </View>
      <Text
        numberOfLines={1}
        style={[styles.comingTitle, { color: surface.textPrimary }]}
      >
        {title}
      </Text>
      <Text
        numberOfLines={2}
        style={[styles.comingSub, { color: surface.textSecondary }]}
      >
        {subtitle}
      </Text>
      {note !== undefined ? (
        <Text
          numberOfLines={1}
          style={[styles.comingNote, { color: surface.textMuted }]}
        >
          {note}
        </Text>
      ) : null}
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// StatusChip — small pill for statuses
// ---------------------------------------------------------------------------
export const StatusChip: React.FC<{
  mode: ChromeMode;
  label: string;
  tone: ChipTone;
}> = ({ mode, label, tone }) => {
  const palette = TONE_PALETTE[tone];
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: mode === 'dark' ? palette.bgDark : palette.bgLight },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: mode === 'dark' ? palette.fgDark : palette.fgLight },
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: RADII.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  headerSpacer: {
    width: 44,
  },
  headerTitle: {
    ...TYPOGRAPHY.headlineMd,
  },
  headerSub: {
    ...TYPOGRAPHY.bodySm,
    marginTop: 1,
  },
  card: {
    borderRadius: RADII.lg,
    borderWidth: 1,
    padding: SPACING.cardPadding,
  },
  statTile: {
    flex: 1,
    borderRadius: RADII.md,
    borderWidth: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    ...TYPOGRAPHY.titleMd,
    fontWeight: '800',
  },
  statLabel: {
    ...TYPOGRAPHY.captionMin,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 56,
    paddingVertical: SPACING.sm,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: RADII.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTextWrap: {
    flex: 1,
  },
  linkTitle: {
    ...TYPOGRAPHY.titleMd,
  },
  linkBadge: {
    ...TYPOGRAPHY.captionMin,
    fontWeight: '900',
  },
  linkSub: {
    ...TYPOGRAPHY.bodySm,
    marginTop: 1,
  },
  comingCard: {
    borderRadius: RADII.lg,
    borderWidth: 1.5,
    padding: SPACING.cardPadding,
    gap: 4,
  },
  comingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  comingIcon: {
    width: 40,
    height: 40,
    borderRadius: RADII.md,
    backgroundColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: BRAND_COLORS.goldBorder,
    backgroundColor: 'rgba(255,199,3,0.14)',
  },
  comingChipText: {
    ...TYPOGRAPHY.captionMin,
    fontSize: 9,
    fontWeight: '900',
  },
  comingTitle: {
    ...TYPOGRAPHY.titleMd,
    fontWeight: '800',
  },
  comingSub: {
    ...TYPOGRAPHY.bodySm,
  },
  comingNote: {
    ...TYPOGRAPHY.captionMin,
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADII.full,
  },
  chipText: {
    ...TYPOGRAPHY.captionMin,
    fontWeight: '800',
  },
});
