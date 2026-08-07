import React, { useEffect } from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';
import { PrivyProvider } from '@privy-io/expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import AppNavigator from './src/navigation/AppNavigator';

SplashScreen.preventAutoHideAsync();

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set in .env');
}
const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID;
if (!PRIVY_APP_ID) {
  throw new Error('EXPO_PUBLIC_PRIVY_APP_ID is not set in .env');
}
const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID;
if (!PRIVY_CLIENT_ID) {
  throw new Error('EXPO_PUBLIC_PRIVY_CLIENT_ID is not set in .env');
}

export default function App() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PrivyProvider appId={PRIVY_APP_ID} clientId={PRIVY_CLIENT_ID}>
          <StripeProvider
            publishableKey={PUBLISHABLE_KEY}
            merchantIdentifier="remittance-privy-onramp"
            urlScheme="remittanceonramp"
          >
            <StatusBar style="light" />
            <AppNavigator />
          </StripeProvider>
        </PrivyProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
