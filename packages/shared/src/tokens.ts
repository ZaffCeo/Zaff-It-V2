/**
 * ZAFF-IT Design System Tokens v1.0
 * Unified across Customer, Merchant, Rider, and Admin surfaces.
 * Enforces WCAG AA contrast, 4px spacing grid, >=11px typography floor, and >=44dp touch targets.
 */

export const BRAND_COLORS = {
  charcoalBlack: '#121416',
  goldenYellow: '#FFC703',
  goldenYellowHover: '#FFD633',
  goldenYellowPressed: '#E0AE00',
  goldenYellowGlow: 'rgba(255, 199, 3, 0.16)',
  electricGreen: '#0C831F',
  electricGreenLight: '#10B981',
  electricGreenSurface: 'rgba(12, 131, 31, 0.14)',
  pureWhite: '#FFFFFF',
  softWhite: '#F8F9FA',
} as const;

export const SURFACE_DARK = {
  background: '#121416',
  canvasLowest: '#0B0C0E',
  surface1: '#181A1E',
  surface2: '#202328',
  surface3: '#292D33',
  frostedGlass: 'rgba(24, 26, 30, 0.82)',
  border: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  textPrimary: '#F8F9FA',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8', // >= 4.5:1 on #121416
  onPrimary: '#121416', // Charcoal ink on Golden Yellow (>= 11.4:1 contrast)
  onSuccess: '#FFFFFF', // White ink on Electric Green #0C831F (>= 4.8:1 contrast)
} as const;

export const SURFACE_LIGHT = {
  background: '#F8F9FA',
  canvasLowest: '#FFFFFF',
  surface1: '#FFFFFF',
  surface2: '#F1F3F5',
  surface3: '#E9ECEF',
  frostedGlass: 'rgba(255, 255, 255, 0.88)',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  textPrimary: '#121416',
  textSecondary: '#334155',
  textMuted: '#475569', // >= 7.0:1 on #F8F9FA
  onPrimary: '#121416',
  onSuccess: '#FFFFFF',
} as const;

export const STATUS_COLORS = {
  success: '#0C831F',
  successBright: '#16A34A',
  successBgDark: 'rgba(12, 131, 31, 0.18)',
  successBgLight: '#DCFCE7',
  successTextLight: '#0A6919',

  warning: '#D97706',
  warningBright: '#F59E0B',
  warningBgDark: 'rgba(245, 158, 11, 0.18)',
  warningBgLight: '#FEF3C7',
  warningTextLight: '#92400E',

  error: '#DC2626',
  errorBright: '#EF4444',
  errorBgDark: 'rgba(220, 38, 38, 0.18)',
  errorBgLight: '#FEE2E2',
  errorTextLight: '#991B1B',

  info: '#2563EB',
  infoBgDark: 'rgba(37, 99, 235, 0.18)',
  infoBgLight: '#DBEAFE',
  infoTextLight: '#1E40AF',
} as const;

export const ORDER_STATUS_TOKENS = {
  pending: { color: STATUS_COLORS.warningBright, bgDark: STATUS_COLORS.warningBgDark, bgLight: STATUS_COLORS.warningBgLight },
  accepted: { color: STATUS_COLORS.info, bgDark: STATUS_COLORS.infoBgDark, bgLight: STATUS_COLORS.infoBgLight },
  packing: { color: BRAND_COLORS.goldenYellow, bgDark: BRAND_COLORS.goldenYellowGlow, bgLight: '#FEF9C3' },
  dispatched: { color: BRAND_COLORS.electricGreen, bgDark: STATUS_COLORS.successBgDark, bgLight: STATUS_COLORS.successBgLight },
  delivered: { color: BRAND_COLORS.electricGreen, bgDark: STATUS_COLORS.successBgDark, bgLight: STATUS_COLORS.successBgLight },
  cancelled: { color: STATUS_COLORS.errorBright, bgDark: STATUS_COLORS.errorBgDark, bgLight: STATUS_COLORS.errorBgLight },
} as const;

export const FONT_FAMILIES = {
  display: 'PlusJakartaSans',
  body: 'Inter',
  mono: 'JetBrainsMono',
} as const;

/**
 * Typography scale with strict 11px minimum floor for accessibility.
 */
export const TYPOGRAPHY = {
  displayLg: {
    fontFamily: FONT_FAMILIES.display,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '800' as const,
    letterSpacing: -0.6,
  },
  headlineLg: {
    fontFamily: FONT_FAMILIES.display,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
  },
  headlineMd: {
    fontFamily: FONT_FAMILIES.display,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  titleMd: {
    fontFamily: FONT_FAMILIES.display,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as const,
    letterSpacing: 0,
  },
  bodyLg: {
    fontFamily: FONT_FAMILIES.body,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  bodyMd: {
    fontFamily: FONT_FAMILIES.body,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  bodySm: {
    fontFamily: FONT_FAMILIES.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
    letterSpacing: 0.1,
  },
  labelLg: {
    fontFamily: FONT_FAMILIES.display,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
  labelMd: {
    fontFamily: FONT_FAMILIES.display,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  captionMin: {
    fontFamily: FONT_FAMILIES.display,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.4,
  },
} as const;

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  gutter: 12,
  screenPadding: 16,
  cardPadding: 14,
  sectionGap: 20,
} as const;

export const RADII = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

/**
 * Mandatory 44dp+ touch target constants (fixes 98/190 undersized Stitch targets).
 */
export const TOUCH_TARGETS = {
  minSize: 44,
  recommendedSize: 48,
  primaryCtaHeight: 52,
  riderActionHeight: 56,
  iconButtonSize: 44,
  chipMinHeight: 44,
  tabBarHeight: 64,
  hitSlopDefault: { top: 8, bottom: 8, left: 8, right: 8 },
} as const;

export const ELEVATION = {
  none: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export const Z_INDEX = {
  base: 0,
  stickyHeader: 10,
  floatingCart: 20,
  tabBar: 30,
  modal: 40,
  toast: 50,
  emergencySos: 60,
} as const;

export const THEME = {
  brand: BRAND_COLORS,
  dark: SURFACE_DARK,
  light: SURFACE_LIGHT,
  status: STATUS_COLORS,
  orderStatus: ORDER_STATUS_TOKENS,
  fonts: FONT_FAMILIES,
  typography: TYPOGRAPHY,
  spacing: SPACING,
  radii: RADII,
  touchTargets: TOUCH_TARGETS,
  elevation: ELEVATION,
  zIndex: Z_INDEX,
} as const;

export type ZaffTheme = typeof THEME;
export type ColorSchemeMode = 'dark' | 'light';
