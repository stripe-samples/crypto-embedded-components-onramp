import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StripeProvider } from '@stripe/stripe-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import AppNavigator from './src/navigation/AppNavigator';
import { getPublicConfig } from './src/api/client';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [publishableKey, setPublishableKey] = useState<string>();
  const [configError, setConfigError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadConfig = async () => {
      setConfigError(undefined);
      const result = await getPublicConfig();
      if (!active) return;

      if (result.success) {
        setPublishableKey(result.data.publishable_key);
      } else {
        setConfigError(result.error.message);
      }
      await SplashScreen.hideAsync();
    };

    loadConfig();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  if (!publishableKey) {
    return (
      <View style={styles.loadingContainer}>
        {configError ? (
          <>
            <Text style={styles.errorTitle}>Could not load the app configuration</Text>
            <Text style={styles.errorMessage}>{configError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => setReloadKey(value => value + 1)}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator color="#635BFF" size="large" />
        )}
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider
          publishableKey={publishableKey}
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

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    color: '#999',
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#635BFF',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
