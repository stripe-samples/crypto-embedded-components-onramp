import React, { useEffect } from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';
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

export default function App() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider
          publishableKey={PUBLISHABLE_KEY}
          merchantIdentifier="example-stripe-crypto-onramp"
          urlScheme="cryptoonramp"
        >
          <StatusBar style="light" />
          <AppNavigator />
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
