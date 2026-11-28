import React from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CustomerHomeScreen } from './.gen/HomeScreen';

const Stack = createNativeStackNavigator<any>();
function TestApp() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="CustomerHome" component={CustomerHomeScreen} />
          <Stack.Screen name="UniversalSearch" component={() => null} />
          <Stack.Screen name="Wallet" component={() => null} />
          <Stack.Screen name="ZaffId" component={() => null} />
          <Stack.Screen name="Pro" component={() => null} />
          <Stack.Screen name="Login" component={() => null} />
          <Stack.Screen name="Cart" component={() => null} />
          <Stack.Screen name="ProductDetail" component={() => null} />
          <Stack.Screen name="Orders" component={() => null} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
const root = createRoot(document.getElementById('root')!);
root.render(<TestApp />);
