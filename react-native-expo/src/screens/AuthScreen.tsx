import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { signup, login, createAuthIntent, saveUser, getCryptoCustomer } from '../api/client';
import { MERCHANT_DISPLAY_NAME } from '../constants';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Auth'>;
};

export default function AuthScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'signup' | 'login' | null>(null);

  const { configure, hasLinkAccount, authorize, verifyIdentity } = useOnramp();

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

      await saveUser(authResult.customerId, authToken);

      const customerRes = await getCryptoCustomer(authResult.customerId, authToken);
      if (customerRes.success && customerRes.data.kycStatus === 'verified') {
        const idResult = await verifyIdentity();
        if (idResult?.error) {
          console.log('Identity verification note:', idResult.error.message);
        }
        navigation.navigate('Wallet', {
          customerId: authResult.customerId,
          authToken,
        });
      } else {
        navigation.navigate('KYCPrimer', {
          customerId: authResult.customerId,
          authToken,
        });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
      setLoadingMode(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Get Started</Text>
      <Text style={styles.subtitle}>Sign in to buy crypto</Text>

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
            : <Text style={styles.buttonText}>Sign Up</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary, loading && styles.buttonDisabled]}
          onPress={() => handleAuth('login')}
          disabled={loading}
        >
          {loading && loadingMode === 'login'
            ? <ActivityIndicator color="#635BFF" />
            : <Text style={styles.buttonTextSecondary}>Log In</Text>}
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
