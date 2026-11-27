import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import {
  completeAuthIntent,
  createAuthIntent,
  getCryptoCustomer,
} from '../api/client';
import { MERCHANT_DISPLAY_NAME } from '../constants';
import { useSettings } from '../context/SettingsContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Auth'>;
};

export default function AuthScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const { configure, hasLinkAccount, authorize } = useOnramp();

  // Read the KYC tier chosen in the Settings screen so we can route the user
  // through the appropriate identity-collection steps (or skip them for L0).
  const { settings } = useSettings();

  const handleContinue = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }
    setLoading(true);

    try {
      // Step 1: Configure the onramp SDK.
      const configResult = await configure({
        merchantDisplayName: MERCHANT_DISPLAY_NAME,
        appearance: { style: 'AUTOMATIC' },
      });
      if (configResult.error) {
        Alert.alert('SDK Config Error', configResult.error.message);
        return;
      }

      // Step 2: Check for an existing Link account.
      const linkResult = await hasLinkAccount(normalizedEmail);
      if (linkResult.error) {
        Alert.alert('Error', linkResult.error.message);
        return;
      }

      if (!linkResult.hasLinkAccount) {
        // Register a new Link user — phone and country are collected next.
        navigation.navigate('Register', { email: normalizedEmail });
        return;
      }

      // Step 3: Create and authorize a Link auth intent.
      const intentResult = await createAuthIntent(normalizedEmail);
      if (!intentResult.success) {
        Alert.alert('Error', intentResult.error.message);
        return;
      }

      const authResult = await authorize(intentResult.data.authIntentId);
      if (authResult.error) {
        Alert.alert('Authorization Error', authResult.error.message);
        return;
      }
      if (authResult.status === 'Denied') {
        Alert.alert('Denied', 'You must consent to continue.');
        return;
      }
      if (authResult.status !== 'Consented' || !authResult.customerId) {
        Alert.alert('Canceled', 'Authorization was canceled.');
        return;
      }

      // Step 4: Exchange the short-lived flow token for a backend session.
      const sessionResult = await completeAuthIntent(
        intentResult.data.flowToken,
        authResult.customerId,
      );
      if (!sessionResult.success) {
        Alert.alert('Error', sessionResult.error.message);
        return;
      }
      const { sessionToken } = sessionResult.data;

      // Step 5: Route to KYC collection (or skip) based on the selected tier.
      //
      // If the customer already has verified KYC (returning user), we skip
      // the collection screens regardless of the tier setting.
      const customerRes = await getCryptoCustomer(authResult.customerId, sessionToken);

      if (customerRes.success) {
        const { kyc_level } = customerRes.data;

        if (kyc_level === 'L0' || kyc_level === 'L1' || kyc_level === 'L2' || kyc_level === 'PENDING') {
          // Already verified (or verification under review) — go straight to wallet.
          navigation.navigate('Wallet', { customerId: authResult.customerId, sessionToken });
        } else if (kyc_level === 'REJECTED') {
          // Prior KYC attempt was rejected — re-enter the collection flow.
          navigation.navigate('KYCPrimer', { customerId: authResult.customerId, sessionToken });
        } else {
          // REQUIRES_KYC: no active tier yet. Apply settings.kycTier.
          // If settings.kycTier is greater than the current tier (l0),
          // route through the KYC collection flow; otherwise skip it.
          if (settings.kycTier === 'L0') {
            navigation.navigate('Wallet', { customerId: authResult.customerId, sessionToken });
          } else {
            // L1 or L2: proceed through the standard KYC collection flow.
            navigation.navigate('KYCPrimer', { customerId: authResult.customerId, sessionToken });
          }
        }
      } else {
        // Could not fetch customer KYC state — fall back to settings-based routing.
        if (settings.kycTier === 'L0') {
          navigation.navigate('Wallet', { customerId: authResult.customerId, sessionToken });
        } else {
          navigation.navigate('KYCPrimer', { customerId: authResult.customerId, sessionToken });
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Get Started</Text>
      <Text style={styles.subtitle}>Continue with your Link account to buy crypto</Text>

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor="#555"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleContinue}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Continue</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingHorizontal: 24, paddingTop: 48 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 32 },
  label: { color: '#aaa', fontSize: 14, marginBottom: 8 },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
