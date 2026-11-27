import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { MERCHANT_DISPLAY_NAME } from '../constants';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      {/*
       * Settings button — top-right corner.
       * Navigates to the demo settings screen where developers can configure
       * the KYC tier (L0 / L1 / L2) and the transaction-limit source
       * (live Stripe API vs. local hardcoded config).
       */}
      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => navigation.navigate('Settings')}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Demo settings"
      >
        <Text style={styles.settingsIcon}>⚙</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{MERCHANT_DISPLAY_NAME}</Text>
      <Text style={styles.subtitle}>Buy crypto with fiat via Stripe</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('Auth')}
      >
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  settingsButton: {
    position: 'absolute',
    top: 56,
    right: 24,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  settingsIcon: {
    fontSize: 20,
    color: '#888',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 48,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
