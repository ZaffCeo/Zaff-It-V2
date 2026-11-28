import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import {
  BRAND_COLORS,
  ELEVATION,
  GLOW,
  RADII,
  SPACING,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';

interface TabVisual {
  icon?: keyof typeof Ionicons.glyphMap;
  iconActive?: keyof typeof Ionicons.glyphMap;
  label?: string;
  isLogo?: boolean;
}

const TAB_VISUALS: Record<string, TabVisual> = {
  // Customer
  HomeTab: { icon: 'home-outline', iconActive: 'home', label: 'Home' },
  ExploreTab: { icon: 'grid-outline', iconActive: 'grid', label: 'Explore' },
  TrackingTab: { icon: 'clipboard-outline', iconActive: 'clipboard', label: 'Orders' },
  CartTab: { icon: 'cart-outline', iconActive: 'cart', label: 'Basket' },
  AccountTab: { isLogo: true, label: 'ZAFF' },
  // Merchant
  MerchantOrders: { icon: 'receipt-outline', iconActive: 'receipt', label: 'Orders' },
  MerchantCatalog: { icon: 'cube-outline', iconActive: 'cube', label: 'Inventory' },
  MerchantKhata: { icon: 'wallet-outline', iconActive: 'wallet', label: 'Khata' },
  MerchantStore: { icon: 'storefront-outline', iconActive: 'storefront', label: 'Store' },
  MerchantAds: { icon: 'megaphone-outline', iconActive: 'megaphone', label: 'Ads' },
  // Rider
  RiderDuty: { icon: 'bicycle-outline', iconActive: 'bicycle', label: 'Duty' },
  RiderEarnings: { icon: 'cash-outline', iconActive: 'cash', label: 'Earnings' },
  RiderProfile: { icon: 'shield-checkmark-outline', iconActive: 'shield-checkmark', label: 'KYC' },
  // Admin
  AdminApprovals: { icon: 'shield-checkmark-outline', iconActive: 'shield-checkmark', label: 'Approvals' },
  AdminCatalog: { icon: 'checkmark-done-outline', iconActive: 'checkmark-done', label: 'Catalog' },
  AdminRadar: { icon: 'pulse-outline', iconActive: 'pulse', label: 'Radar' },
  AdminMerchants: { icon: 'business-outline', iconActive: 'business', label: 'Merchants' },
  AdminVault: { icon: 'lock-closed-outline', iconActive: 'lock-closed', label: 'COD Vault' },
  AdminGeofence: { icon: 'map-outline', iconActive: 'map', label: 'Geofence' },
};

const FALLBACK_VISUAL: TabVisual = { icon: 'ellipse-outline', label: '' };

/**
 * Premium shared bottom tab bar (Design System v2).
 * - Active route: brand-gold underline indicator + bold label
 * - ZAFF route: black infinity-logo pill (brand signature)
 * - Basket badge: electric green with count
 */
export const PremiumTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
  insets,
}) => {
  // Merchant / Rider / Admin consoles are dark surfaces; customer tabs are light.
  const isDark = /^(Merchant|Rider|Admin)/.test(state.routes[state.index].name);
  const surface = isDark ? SURFACE_DARK : SURFACE_LIGHT;

  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: surface.surface1,
          borderTopColor: surface.border,
          paddingBottom: Math.max(insets.bottom, SPACING.sm),
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const visual = TAB_VISUALS[route.name] ?? FALLBACK_VISUAL;

        const badgeCount =
          typeof options.tabBarBadge === 'number' ? options.tabBarBadge : undefined;

        const tintColor = focused
          ? isDark
            ? BRAND_COLORS.goldenYellow
            : BRAND_COLORS.charcoalBlack
          : surface.textMuted;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? visual.label}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tabItem}
            hitSlop={TOUCH_TARGETS.hitSlopDefault}
          >
            {visual.isLogo ? (
              <View
                style={[
                  styles.logoPill,
                  focused && styles.logoPillActive,
                ]}
              >
                <Image
                  source={require('../../assets/zaff-it-logo.jpg')}
                  style={styles.logoPillImage}
                  resizeMode="contain"
                />
              </View>
            ) : (
              <View style={styles.iconWrap}>
                <Ionicons
                  name={focused ? visual.iconActive ?? visual.icon : visual.icon}
                  size={focused ? 24 : 22}
                  color={tintColor}
                />
                {badgeCount !== undefined && badgeCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badgeCount}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {visual.label ? (
              <Text
                style={[
                  styles.tabLabel,
                  { color: focused ? tintColor : surface.textMuted },
                ]}
                numberOfLines={1}
              >
                {visual.label}
              </Text>
            ) : null}

            {/* Signature golden underline indicator */}
            <View
              style={[
                styles.underline,
                focused && {
                  backgroundColor: BRAND_COLORS.goldenYellow,
                  opacity: 1,
                  width: 22,
                },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: SPACING.sm,
    minHeight: TOUCH_TARGETS.tabBarHeight,
    ...ELEVATION.md,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 52,
  },
  iconWrap: {
    width: 40,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: 2,
    minWidth: 17,
    height: 17,
    borderRadius: RADII.full,
    backgroundColor: BRAND_COLORS.electricGreen,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: BRAND_COLORS.pureWhite,
    fontSize: 10,
    fontWeight: '800',
  },
  logoPill: {
    width: 46,
    height: 26,
    borderRadius: RADII.full,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: BRAND_COLORS.goldenYellow,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoPillActive: {
    borderWidth: 2,
    ...GLOW.goldSoft,
  },
  logoPillImage: {
    width: 40,
    height: 18,
  },
  tabLabel: {
    fontSize: TYPOGRAPHY.captionMin.fontSize,
    fontWeight: '700',
    letterSpacing: 0.1,
    marginTop: 1,
  },
  underline: {
    width: 0,
    height: 3,
    borderRadius: RADII.full,
    marginTop: 2,
    opacity: 0,
  },
});
