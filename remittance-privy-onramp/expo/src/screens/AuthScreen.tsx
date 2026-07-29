import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { signup, login, createAuthIntent, saveUser, getOnrampCustomer } from '../api/client';
import { MERCHANT_DISPLAY_NAME } from '../constants';
import { useSettings } from '../context/SettingsContext';
import { errorMessage } from '../errors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Auth'>;
};

export default function AuthScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'signup' | 'login' | null>(null);

  const { configure, hasLinkAccount, authorize } = useOnramp();

  // Read the KYC tier chosen in the Settings screen so we can route the user
  // through the appropriate identity-collection steps (or skip them for L0).
  const { settings } = useSettings();

  const handleAuth = async (mode: 'signup' | 'login') => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }
    setLoading(true);
    setLoadingMode(mode);

    try {
      // Step 1: Authenticate with backend
      const authRes = mode === 'signup'
        ? await signup(email.trim(), password)
        : await login(email.trim(), password);

      if (!authRes.success) {
        Alert.alert('Error', authRes.error.message);
        return;
      }
      let authToken = authRes.data.token;

      // Step 2: Configure the onramp SDK
      const configResult = await configure({
        merchantDisplayName: MERCHANT_DISPLAY_NAME,
        appearance: { style: 'AUTOMATIC' },
      });
      if (configResult.error) {
        Alert.alert('SDK Config Error', configResult.error.message);
        return;
      }

      // Step 3: Check for existing Link account
      const linkResult = await hasLinkAccount(email.trim());
      if (linkResult.error) {
        Alert.alert('Error', linkResult.error.message);
        return;
      }

      if (!linkResult.hasLinkAccount) {
        // Register new Link user — phone collected in next screen
        navigation.navigate('Register', { email: email.trim(), authToken });
        return;
      }

      // Step 4: Create auth intent via backend
      const intentResult = await createAuthIntent(authToken);
      if (!intentResult.success) {
        Alert.alert('Error', intentResult.error.message);
        return;
      }
      if (intentResult.data.token) authToken = intentResult.data.token;

      // Step 5: Authorize (presents Link consent/OTP screen)
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

      const saveRes = await saveUser(authResult.customerId, authToken);
      if (!saveRes.success) {
        Alert.alert('Authorization Error', saveRes.error.message);
        return;
      }

      // Step 6: Route to KYC collection (or skip) based on the selected tier.
      //
      // If the customer already has verified KYC (returning user), we skip
      // the collection screens regardless of the tier setting.
      const customerRes = await getOnrampCustomer(authResult.customerId, authToken);
      if (!customerRes.success) {
        Alert.alert('Authorization Error', customerRes.error.message);
        return;
      }
      const l1Status = customerRes.success
        ? customerRes.data.kycTiers.find(tier => tier.tier === 'l1')?.verification_status
        : undefined;
      const l2Status = customerRes.success
        ? customerRes.data.kycTiers.find(tier => tier.tier === 'l2')?.verification_status
        : undefined;
      const hasVerifiedIdentityTier = l1Status === 'verified' || l2Status === 'verified';

      if (hasVerifiedIdentityTier) {
        // Returning L1/L2 users can go straight to the wallet. Do not call
        // verifyIdentity() on login; that is only for explicit L2 onboarding
        // or step-up after Stripe asks for document verification.
        navigation.navigate('TransferSetup', {
          customerId: authResult.customerId,
          authToken,
        });
      } else if (settings.kycTier === 'L0') {
        // L0 demo: deliberately skip identity collection. The user will have
        // the lowest transaction limits and will be shown the KYC step-up
        // screen if they attempt a transfer above those limits.
        navigation.navigate('TransferSetup', {
          customerId: authResult.customerId,
          authToken,
        });
      } else {
        // L1 or L2: proceed through the standard KYC collection flow.
        // The AddressScreen will conditionally call verifyIdentity() for L2.
        navigation.navigate('KYCPrimer', {
          customerId: authResult.customerId,
          authToken,
        });
      }
    } catch (err: unknown) {
      Alert.alert('Error', errorMessage(err) || 'Something went wrong.');
    } finally {
      setLoading(false);
      setLoadingMode(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.subtitle}>Sign in to start a remittance transfer.</Text>

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
      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="password"
        placeholderTextColor="#555"
        secureTextEntry
        autoCapitalize="none"
      />

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => handleAuth('signup')}
          disabled={loading}
        >
          {loading && loadingMode === 'signup'
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Create account</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary, loading && styles.buttonDisabled]}
          onPress={() => handleAuth('login')}
          disabled={loading}
        >
          {loading && loadingMode === 'login'
            ? <ActivityIndicator color="#635BFF" />
            : <Text style={styles.buttonTextSecondary}>Sign in</Text>}
        </TouchableOpacity>
      </View>
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
  buttonRow: { flexDirection: 'row', gap: 12 },
  button: {
    flex: 1,
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#635BFF',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonTextSecondary: { color: '#635BFF', fontSize: 16, fontWeight: '600' },
});
