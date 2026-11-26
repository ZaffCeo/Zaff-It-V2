import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAppStore, type UserRole } from '@/store/useAppStore';
import { PremiumTabBar } from '@/components/PremiumTabBar';
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
  const cartCount = useAppStore((s) =>
    s.cartItems.reduce((sum, item) => sum + item.quantity, 0),
  );

  return (
    <CustomerTab.Navigator
      tabBar={(props) => <PremiumTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <CustomerTab.Screen
        name="HomeTab"
        component={CustomerHomeScreen}
        options={{
          title: 'Home',
        }}
      />
      <CustomerTab.Screen
        name="ExploreTab"
        component={CustomerHomeScreen}
        options={{
          title: 'Explore',
        }}
      />
      <CustomerTab.Screen
        name="TrackingTab"
        component={OrdersAndSupportScreen}
        options={{
          title: 'Orders',
        }}
      />
      <CustomerTab.Screen
        name="CartTab"
        component={CartCheckoutScreen}
        options={{
          title: 'Basket',
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
        }}
      />
      <CustomerTab.Screen
        name="AccountTab"
        component={AccountComplianceScreen}
        options={{
          title: 'ZAFF',
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

const MerchantTabs: React.FC = () => (
  <MerchantTab.Navigator
    tabBar={(props) => <PremiumTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <MerchantTab.Screen
      name="MerchantOrders"
      options={{ title: 'Orders' }}
    >
      {() => <MerchantOrdersScreen initialState="ready" />}
    </MerchantTab.Screen>
    <MerchantTab.Screen
      name="MerchantCatalog"
      options={{ title: 'Inventory' }}
    >
      {() => <MerchantInventoryScreen initialState="ready" />}
    </MerchantTab.Screen>
    <MerchantTab.Screen
      name="MerchantKhata"
      options={{ title: 'Khata' }}
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
      options={{ title: 'Store' }}
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

const RiderTabs: React.FC = () => (
  <RiderTab.Navigator
    tabBar={(props) => <PremiumTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <RiderTab.Screen name="RiderDuty" options={{ title: 'Duty' }}>
      {({ navigation }) => (
        <RiderTasksScreen
          initialState="ready"
          initialOnline
          onProceedToOtp={() => navigation.navigate('RiderEarnings')}
        />
      )}
    </RiderTab.Screen>
    <RiderTab.Screen name="RiderEarnings" options={{ title: 'Handover' }}>
      {({ navigation }) => (
        <RiderDeliveryOtpScreen
          initialState="ready"
          onFinishHandover={() => navigation.navigate('RiderDuty')}
        />
      )}
    </RiderTab.Screen>
    <RiderTab.Screen name="RiderProfile" options={{ title: 'KYC' }}>
      {() => <RiderShiftKycScreen initialState="ready" />}
    </RiderTab.Screen>
  </RiderTab.Navigator>
);

const AdminTabs: React.FC = () => (
  <AdminTab.Navigator
    tabBar={(props) => <PremiumTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <AdminTab.Screen name="AdminRadar" options={{ title: 'Radar' }}>
      {() => <AdminOpsBoardScreen initialState="ready" />}
    </AdminTab.Screen>
    <AdminTab.Screen name="AdminMerchants" options={{ title: 'Merchants' }}>
      {() => <AdminOpsBoardScreen initialState="ready" />}
    </AdminTab.Screen>
    <AdminTab.Screen name="AdminVault" options={{ title: 'COD Vault' }}>
      {() => <AdminOpsBoardScreen initialState="ready" />}
    </AdminTab.Screen>
    <AdminTab.Screen name="AdminGeofence" options={{ title: 'Geofence' }}>
      {() => <AdminOpsBoardScreen initialState="ready" />}
    </AdminTab.Screen>
  </AdminTab.Navigator>
);

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
