import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import {
  BRAND_COLORS,
  RADII,
  SPACING,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TOUCH_TARGETS,
  TYPOGRAPHY,
} from '@zaff-it/shared/tokens';
import { useAppStore, type UserRole } from '@/store/useAppStore';
import { SplashAndOnboardingScreen } from '@/screens/customer/SplashAndOnboardingScreen';
import { LoginOtpScreen } from '@/screens/customer/LoginOtpScreen';
import { CustomerHomeScreen } from '@/screens/customer/CustomerHomeScreen';
import { OrdersAndSupportScreen } from '@/screens/customer/OrdersAndSupportScreen';
import { CartCheckoutScreen } from '@/screens/customer/CartCheckoutScreen';
import { AccountComplianceScreen } from '@/screens/customer/AccountComplianceScreen';
import { AddressBookScreen } from '@/screens/customer/AddressBookScreen';
import {
  ProductDetailScreen,
  type ProductDetailInput,
} from '@/screens/customer/ProductDetailScreen';
import { OrderTrackingScreen } from '@/screens/customer/OrderTrackingScreen';
import { MerchantDashboardScreen } from '@/screens/merchant/MerchantDashboardScreen';
import { MerchantInventoryScreen } from '@/screens/merchant/MerchantInventoryScreen';
import { MerchantOrdersScreen } from '@/screens/merchant/MerchantOrdersScreen';
import { RiderShiftKycScreen } from '@/screens/rider/RiderShiftKycScreen';
import { RiderTasksScreen } from '@/screens/rider/RiderTasksScreen';
import { RiderDeliveryOtpScreen } from '@/screens/rider/RiderDeliveryOtpScreen';
import { AdminOpsBoardScreen } from '@/screens/admin/AdminOpsBoardScreen';

export type RootStackParamList = {
  SplashAndOnboarding: undefined;
  LoginOtp: undefined;
  CustomerRoot: undefined;
  MerchantRoot: undefined;
  RiderRoot: undefined;
  AdminRoot: undefined;
};

export type CustomerStackParamList = {
  CustomerTabs: undefined;
  AddressBook: undefined;
  ProductDetail: { product?: ProductDetailInput } | undefined;
  OrderTracking: { orderId?: string } | undefined;
};

export type CustomerTabParamList = {
  HomeTab: undefined;
  ExploreTab: undefined;
  TrackingTab: { orderId?: string } | undefined;
  CartTab: undefined;
  AccountTab: undefined;
};

export type MerchantTabParamList = {
  MerchantOrders: undefined;
  MerchantCatalog: undefined;
  MerchantKhata: undefined;
  MerchantStore: undefined;
};

export type RiderTabParamList = {
  RiderDuty: undefined;
  RiderEarnings: undefined;
  RiderProfile: undefined;
};

export type AdminTabParamList = {
  AdminRadar: undefined;
  AdminMerchants: undefined;
  AdminVault: undefined;
  AdminGeofence: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const CustomerStackNav = createNativeStackNavigator<CustomerStackParamList>();
const CustomerTab = createBottomTabNavigator<CustomerTabParamList>();
const MerchantTab = createBottomTabNavigator<MerchantTabParamList>();
const RiderTab = createBottomTabNavigator<RiderTabParamList>();
const AdminTab = createBottomTabNavigator<AdminTabParamList>();

const CustomerTabs: React.FC = () => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const cartCount = useAppStore((s) =>
    s.cartItems.reduce((sum, item) => sum + item.quantity, 0),
  );
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  return (
    <CustomerTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor:
          colorScheme === 'dark'
            ? BRAND_COLORS.goldenYellow
            : BRAND_COLORS.charcoalBlack,
        tabBarInactiveTintColor: surface.textMuted,
        tabBarStyle: {
          backgroundColor: surface.surface1,
          borderTopColor: surface.border,
          height: TOUCH_TARGETS.tabBarHeight,
          paddingBottom: SPACING.sm,
          paddingTop: SPACING.xs,
        },
        tabBarLabelStyle: {
          fontSize: TYPOGRAPHY.captionMin.fontSize,
          fontWeight: '700',
        },
      }}
    >
      <CustomerTab.Screen
        name="HomeTab"
        component={CustomerHomeScreen}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={size}
              color={focused ? BRAND_COLORS.charcoalBlack : color}
            />
          ),
        }}
      />
      <CustomerTab.Screen
        name="ExploreTab"
        component={CustomerHomeScreen}
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'grid' : 'grid-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <CustomerTab.Screen
        name="TrackingTab"
        component={OrdersAndSupportScreen}
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'clipboard' : 'clipboard-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <CustomerTab.Screen
        name="CartTab"
        component={CartCheckoutScreen}
        options={{
          title: 'Basket',
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: BRAND_COLORS.electricGreen,
            color: BRAND_COLORS.pureWhite,
            fontSize: TYPOGRAPHY.captionMin.fontSize,
          },
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'cart' : 'cart-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <CustomerTab.Screen
        name="AccountTab"
        component={AccountComplianceScreen}
        options={{
          title: 'ZAFF',
          tabBarIcon: ({ focused }) => (
            <View
              style={[
                styles.zaffTabIconWrap,
                focused && styles.zaffTabIconWrapActive,
              ]}
            >
              <Image
                source={require('../../assets/zaff-it-logo.jpg')}
                style={styles.zaffTabIcon}
                resizeMode="contain"
              />
            </View>
          ),
        }}
      />
    </CustomerTab.Navigator>
  );
};

const CustomerStack: React.FC = () => (
  <CustomerStackNav.Navigator screenOptions={{ headerShown: false }}>
    <CustomerStackNav.Screen name="CustomerTabs" component={CustomerTabs} />
    <CustomerStackNav.Screen name="AddressBook" component={AddressBookScreen} />
    <CustomerStackNav.Screen name="ProductDetail" component={ProductDetailScreen} />
    <CustomerStackNav.Screen name="OrderTracking" component={OrderTrackingScreen} />
  </CustomerStackNav.Navigator>
);

const MerchantTabs: React.FC = () => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  return (
    <MerchantTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND_COLORS.electricGreen,
        tabBarInactiveTintColor: surface.textMuted,
        tabBarStyle: {
          backgroundColor: surface.surface1,
          borderTopColor: surface.border,
          height: TOUCH_TARGETS.tabBarHeight,
          paddingBottom: SPACING.sm,
          paddingTop: SPACING.xs,
        },
        tabBarLabelStyle: {
          fontSize: TYPOGRAPHY.captionMin.fontSize,
          fontWeight: '700',
        },
      }}
    >
      <MerchantTab.Screen
        name="MerchantOrders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      >
        {() => <MerchantOrdersScreen initialState="ready" />}
      </MerchantTab.Screen>
      <MerchantTab.Screen
        name="MerchantCatalog"
        options={{
          title: 'Catalog',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" size={size} color={color} />
          ),
        }}
      >
        {() => <MerchantInventoryScreen initialState="ready" />}
      </MerchantTab.Screen>
      <MerchantTab.Screen
        name="MerchantKhata"
        options={{
          title: 'Khata',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      >
        {({ navigation }) => (
          <MerchantDashboardScreen
            initialState="ready"
            onOpenOrders={() => navigation.navigate('MerchantOrders')}
            onOpenInventory={() => navigation.navigate('MerchantCatalog')}
          />
        )}
      </MerchantTab.Screen>
      <MerchantTab.Screen
        name="MerchantStore"
        options={{
          title: 'Store',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      >
        {({ navigation }) => (
          <MerchantDashboardScreen
            initialState="ready"
            onOpenOrders={() => navigation.navigate('MerchantOrders')}
            onOpenInventory={() => navigation.navigate('MerchantCatalog')}
          />
        )}
      </MerchantTab.Screen>
    </MerchantTab.Navigator>
  );
};

const RiderTabs: React.FC = () => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  return (
    <RiderTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND_COLORS.goldenYellow,
        tabBarInactiveTintColor: surface.textMuted,
        tabBarStyle: {
          backgroundColor: surface.surface1,
          borderTopColor: surface.border,
          height: TOUCH_TARGETS.tabBarHeight,
          paddingBottom: SPACING.sm,
          paddingTop: SPACING.xs,
        },
        tabBarLabelStyle: {
          fontSize: TYPOGRAPHY.captionMin.fontSize,
          fontWeight: '700',
        },
      }}
    >
      <RiderTab.Screen
        name="RiderDuty"
        options={{
          title: 'Duty',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bicycle-outline" size={size} color={color} />
          ),
        }}
      >
        {({ navigation }) => (
          <RiderTasksScreen
            initialState="ready"
            initialOnline
            onProceedToOtp={() => navigation.navigate('RiderEarnings')}
          />
        )}
      </RiderTab.Screen>
      <RiderTab.Screen
        name="RiderEarnings"
        options={{
          title: 'Handover',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cash-outline" size={size} color={color} />
          ),
        }}
      >
        {({ navigation }) => (
          <RiderDeliveryOtpScreen
            initialState="ready"
            onFinishHandover={() => navigation.navigate('RiderDuty')}
          />
        )}
      </RiderTab.Screen>
      <RiderTab.Screen
        name="RiderProfile"
        options={{
          title: 'KYC',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark-outline" size={size} color={color} />
          ),
        }}
      >
        {() => <RiderShiftKycScreen initialState="ready" />}
      </RiderTab.Screen>
    </RiderTab.Navigator>
  );
};

const AdminTabs: React.FC = () => {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const surface = colorScheme === 'dark' ? SURFACE_DARK : SURFACE_LIGHT;

  return (
    <AdminTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND_COLORS.electricGreen,
        tabBarInactiveTintColor: surface.textMuted,
        tabBarStyle: {
          backgroundColor: surface.surface1,
          borderTopColor: surface.border,
          height: TOUCH_TARGETS.tabBarHeight,
          paddingBottom: SPACING.sm,
          paddingTop: SPACING.xs,
        },
        tabBarLabelStyle: {
          fontSize: TYPOGRAPHY.captionMin.fontSize,
          fontWeight: '700',
        },
      }}
    >
      <AdminTab.Screen
        name="AdminRadar"
        options={{
          title: 'Radar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pulse-outline" size={size} color={color} />
          ),
        }}
      >
        {() => <AdminOpsBoardScreen initialState="ready" />}
      </AdminTab.Screen>
      <AdminTab.Screen
        name="AdminMerchants"
        options={{
          title: 'Merchants',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business-outline" size={size} color={color} />
          ),
        }}
      >
        {() => <AdminOpsBoardScreen initialState="ready" />}
      </AdminTab.Screen>
      <AdminTab.Screen
        name="AdminVault"
        options={{
          title: 'COD Vault',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="lock-closed-outline" size={size} color={color} />
          ),
        }}
      >
        {() => <AdminOpsBoardScreen initialState="ready" />}
      </AdminTab.Screen>
      <AdminTab.Screen
        name="AdminGeofence"
        options={{
          title: 'Geofence',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      >
        {() => <AdminOpsBoardScreen initialState="ready" />}
      </AdminTab.Screen>
    </AdminTab.Navigator>
  );
};

function getRoleRootRoute(role: UserRole): keyof RootStackParamList {
  switch (role) {
    case 'merchant':
      return 'MerchantRoot';
    case 'rider':
      return 'RiderRoot';
    case 'admin':
      return 'AdminRoot';
    case 'customer':
    default:
      return 'CustomerRoot';
  }
}

export const RootNavigator: React.FC = () => {
  const hasCompletedOnboarding = useAppStore((s) => s.hasCompletedOnboarding);
  const userId = useAppStore((s) => s.userId);
  const role = useAppStore((s) => s.role);

  const isAuthenticated = userId !== null;
  const activeRoleRoute = getRoleRootRoute(role);

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {!hasCompletedOnboarding ? (
        <RootStack.Screen
          name="SplashAndOnboarding"
          component={SplashAndOnboardingScreen}
        />
      ) : !isAuthenticated ? (
        <RootStack.Screen name="LoginOtp" component={LoginOtpScreen} />
      ) : activeRoleRoute === 'MerchantRoot' ? (
        <RootStack.Screen name="MerchantRoot" component={MerchantTabs} />
      ) : activeRoleRoute === 'RiderRoot' ? (
        <RootStack.Screen name="RiderRoot" component={RiderTabs} />
      ) : activeRoleRoute === 'AdminRoot' ? (
        <RootStack.Screen name="AdminRoot" component={AdminTabs} />
      ) : (
        <RootStack.Screen name="CustomerRoot" component={CustomerStack} />
      )}
    </RootStack.Navigator>
  );
};

const styles = StyleSheet.create({
  zaffTabIconWrap: {
    width: 34,
    height: 24,
    borderRadius: RADII.full,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BRAND_COLORS.goldenYellow,
  },
  zaffTabIconWrapActive: {
    borderWidth: 2,
    borderColor: BRAND_COLORS.goldenYellow,
  },
  zaffTabIcon: {
    width: 30,
    height: 20,
  },
});
