import React, { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, Linking,
} from 'react-native';
import { MERCHANT_DISPLAY_NAME } from '../constants';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { createAuthIntent, saveUser, getCryptoCustomer } from '../api/client';


type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Register'>;
  route: RouteProp<RootStackParamList, 'Register'>;
};

export default function RegisterScreen({ navigation, route }: Props) {
  const { email, authToken: initialToken } = route.params;
  const [phone, setPhone] = useState('+1');
  const [loading, setLoading] = useState(false);
  const { registerLinkUser, authorize, verifyIdentity } = useOnramp();

  const handleRegister = async () => {
    if (!phone.trim() || phone === '+1') {
      Alert.alert('Error', 'Please enter your phone number.');
      return;
    }
    setLoading(true);
    try {
      const registerResult = await registerLinkUser({ email, phone: phone.trim(), country: 'US' });
      if (registerResult.error) {
        Alert.alert('Registration Error', registerResult.error.message);
        return;
      }

      const intentResult = await createAuthIntent(initialToken);
      if (!intentResult.success) {
        Alert.alert('Error', intentResult.error.message);
        return;
      }
      let authToken = intentResult.data.token ?? initialToken;

      const authResult = await authorize(intentResult.data.authIntentId);
      if (authResult.error) {
        Alert.alert('Authorization Error', authResult.error.message);
        return;
      }
      if (authResult.status !== 'Consented' || !authResult.customerId) {
        Alert.alert('Canceled', 'Authorization was canceled or denied.');
        return;
      }

      await saveUser(authResult.customerId, authToken);

      const customerRes = await getCryptoCustomer(authResult.customerId, authToken);
      if (customerRes.success && customerRes.data.kycStatus === 'verified') {
        const idResult = await verifyIdentity();
        if (idResult?.error) {
          console.log('Identity verification note:', idResult.error.message);
        }
        navigation.navigate('Wallet', { customerId: authResult.customerId, authToken });
      } else {
        navigation.navigate('KYCPrimer', { customerId: authResult.customerId, authToken });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Sign up for Link</Text>
      <Text style={styles.subtitle}>
        {MERCHANT_DISPLAY_NAME} uses{' '}
        <Text style={styles.link} onPress={() => Linking.openURL('https://link.com/')}>
          Link
        </Text>
        {' '}to complete crypto purchases. Link securely saves your payment details so you can speed through check out across thousands of sites.
      </Text>

      <Text style={styles.label}>Email address</Text>
      <TextInput style={[styles.input, styles.inputDisabled]} value={email} editable={false} />

      <Text style={styles.label}>Phone number</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="+12125551234"
        placeholderTextColor="#555"
        keyboardType="phone-pad"
        autoCapitalize="none"
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign Up</Text>}
      </TouchableOpacity>

      <Text style={styles.terms}>
        By continuing you agree to the{' '}
        <Text style={styles.link} onPress={() => Linking.openURL('https://link.com/terms/crypto-onramp')}>
          Terms of Service
        </Text>
        {' '}and{' '}
        <Text style={styles.link} onPress={() => Linking.openURL('https://link.com/privacy')}>
          Privacy Policy
        </Text>
        .
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 12 },
  subtitle: { fontSize: 14, color: '#999', lineHeight: 21, marginBottom: 28 },
  label: { color: '#aaa', fontSize: 14, fontWeight: '600', marginBottom: 8 },
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
  inputDisabled: { opacity: 0.5 },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  terms: { color: '#777', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  link: { color: '#635BFF', textDecorationLine: 'underline' },
});
