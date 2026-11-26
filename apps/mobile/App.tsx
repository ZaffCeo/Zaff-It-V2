import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from '@/navigation/RootNavigator';
import { supabase } from '@/services/supabase';
import { useAppStore, type UserRole } from '@/store/useAppStore';

export default function App(): React.JSX.Element {
  const colorScheme = useAppStore((s) => s.colorScheme);
  const setSession = useAppStore((s) => s.setSession);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      const user = data.session?.user ?? null;
      if (user) {
        const metaRole = user.app_metadata?.role as UserRole | undefined;
        setSession(user.id, user.phone ?? null, metaRole ?? 'customer');
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const user = session?.user ?? null;
        if (user) {
          const metaRole = user.app_metadata?.role as UserRole | undefined;
          setSession(user.id, user.phone ?? null, metaRole ?? 'customer');
        } else {
          setSession(null, null);
        }
      },
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [setSession]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
