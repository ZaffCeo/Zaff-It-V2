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
import { UniversalSearchScreen } from '@/screens/customer/UniversalSearchScreen';
import { CategoryDeepDiveScreen } from '@/screens/customer/CategoryDeepDiveScreen';
import { NotificationCenterScreen } from '@/screens/customer/NotificationCenterScreen';
import { RequestItScreen } from '@/screens/customer/RequestItScreen';
import { ZaffyChatScreen } from '@/screens/customer/ZaffyChatScreen';
import { RazorpayCheckoutScreen } from '@/screens/customer/RazorpayCheckoutScreen';
import { RatingTipScreen } from '@/screens/customer/RatingTipScreen';
import { InviteScreen } from '@/screens/customer/InviteScreen';
import { ProScreen } from '@/screens/customer/ProScreen';
import { ZaffIdScreen } from '@/screens/customer/ZaffIdScreen';
import { LaundryScreen } from '@/screens/customer/LaundryScreen';
import { ServicesScreen } from '@/screens/customer/ServicesScreen';
import { ServiceJobsScreen } from '@/screens/customer/ServiceJobsScreen';
import { MerchantRegistrationScreen } from '@/screens/customer/MerchantRegistrationScreen';
import { MerchantDashboardScreen } from '@/screens/merchant/MerchantDashboardScreen';
import { MerchantInventoryScreen } from '@/screens/merchant/MerchantInventoryScreen';
import { MerchantOrdersScreen } from '@/screens/merchant/MerchantOrdersScreen';
import { MerchantAdsScreen } from '@/screens/merchant/MerchantAdsScreen';
import { RiderShiftKycScreen } from '@/screens/rider/RiderShiftKycScreen';
import { RiderTasksScreen } from '@/screens/rider/RiderTasksScreen';
import { RiderDeliveryOtpScreen } from '@/screens/rider/RiderDeliveryOtpScreen';
import { AdminOpsBoardScreen } from '@/screens/admin/AdminOpsBoardScreen';
import { AdminApprovalsScreen } from '@/screens/admin/AdminApprovalsScreen';
import { CatalogReviewScreen } from '@/screens/admin/CatalogReviewScreen';
import { AdminVaultScreen } from '@/screens/admin/AdminVaultScreen';
import { AdminMerchantsScreen } from '@/screens/admin/AdminMerchantsScreen';
import { AdminZonesScreen } from '@/screens/admin/AdminZonesScreen';
import { MerchantStoreScreen } from '@/screens/merchant/MerchantStoreScreen';
import { WalletScreen } from '@/screens/customer/WalletScreen';

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
  Wallet: undefined;
  ProductDetail: { product?: ProductDetailInput } | undefined;
  OrderTracking: { orderId?: string } | undefined;
  UniversalSearch: { initialQuery?: string } | undefined;
  CategoryDeepDive: { category?: string } | undefined;
  NotificationCenter: undefined;
  RequestIt: undefined;
  ZaffyChat: { initialQuery?: string } | undefined;
  RazorpayCheckout: { razorpayOrderId: string; amountPaise: number; currency: string; orderNumber: string; orderId: string } | undefined;
  RatingTip: { orderId: string } | undefined;
  Invite: undefined;
  Pro: undefined;
  ZaffId: undefined;
  Laundry: undefined;
  Services: undefined;
  ServiceJobs: undefined;
  MerchantRegister: undefined;
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
  MerchantAds: undefined;
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
  AdminApprovals: undefined;
  AdminRadar: undefined;
  AdminCatalog: undefined;
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
        component={CategoryDeepDiveScreen}
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
    <CustomerStackNav.Screen name="Wallet" component={WalletScreen} />
    <CustomerStackNav.Screen name="ProductDetail" component={ProductDetailScreen} />
    <CustomerStackNav.Screen name="OrderTracking" component={OrderTrackingScreen} />
    <CustomerStackNav.Screen name="UniversalSearch" component={UniversalSearchScreen} />
    <CustomerStackNav.Screen name="CategoryDeepDive" component={CategoryDeepDiveScreen} />
    <CustomerStackNav.Screen name="NotificationCenter" component={NotificationCenterScreen} />
    <CustomerStackNav.Screen name="RequestIt" component={RequestItScreen} />
    <CustomerStackNav.Screen name="ZaffyChat" component={ZaffyChatScreen} />
    <CustomerStackNav.Screen name="RazorpayCheckout" component={RazorpayCheckoutScreen} />
    <CustomerStackNav.Screen name="RatingTip" component={RatingTipScreen} />
    <CustomerStackNav.Screen name="Invite" component={InviteScreen} />
    <CustomerStackNav.Screen name="Pro" component={ProScreen} />
    <CustomerStackNav.Screen name="ZaffId" component={ZaffIdScreen} />
    <CustomerStackNav.Screen name="Laundry" component={LaundryScreen} />
    <CustomerStackNav.Screen name="Services" component={ServicesScreen} />
    <CustomerStackNav.Screen name="ServiceJobs" component={ServiceJobsScreen} />
    <CustomerStackNav.Screen name="MerchantRegister" component={MerchantRegistrationScreen} />
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
      name="MerchantAds"
      options={{ title: 'Ads' }}
    >
      {() => <MerchantAdsScreen />}
    </MerchantTab.Screen>
    <MerchantTab.Screen
      name="MerchantStore"
      options={{ title: 'Store' }}
    >
      {() => <MerchantStoreScreen />}
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
    <AdminTab.Screen name="AdminApprovals" options={{ title: 'Approvals' }}>
      {() => <AdminApprovalsScreen />}
    </AdminTab.Screen>
    <AdminTab.Screen name="AdminRadar" options={{ title: 'Radar' }}>
      {() => <AdminOpsBoardScreen initialState="ready" />}
    </AdminTab.Screen>
    <AdminTab.Screen name="AdminCatalog" options={{ title: 'Catalog' }}>
      {() => <CatalogReviewScreen />}
    </AdminTab.Screen>
    <AdminTab.Screen name="AdminMerchants" options={{ title: 'Merchants' }}>
      {() => <AdminMerchantsScreen />}
    </AdminTab.Screen>
    <AdminTab.Screen name="AdminVault" options={{ title: 'COD Vault' }}>
      {() => <AdminVaultScreen />}
    </AdminTab.Screen>
    <AdminTab.Screen name="AdminGeofence" options={{ title: 'Geofence' }}>
      {() => <AdminZonesScreen />}
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
