import React, { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, Linking, View,
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

const COUNTRIES = [
  { code: 'US', label: 'US' },
  { code: 'DE', label: 'DE' },
  { code: 'FR', label: 'FR' },
  { code: 'IT', label: 'IT' },
  { code: 'NL', label: 'NL' },
  { code: 'ES', label: 'ES' },
  { code: 'GB', label: 'GB' },
];

export default function RegisterScreen({ navigation, route }: Props) {
  const { email, authToken: initialToken } = route.params;
  const [phone, setPhone] = useState('+1');
  const [country, setCountry] = useState('US');
  const [loading, setLoading] = useState(false);
  const { registerLinkUser, authorize } = useOnramp();

  const handleRegister = async () => {
    if (!phone.trim() || phone === '+1') {
      Alert.alert('Error', 'Please enter your phone number.');
      return;
    }
    setLoading(true);
    try {
      const registerResult = await registerLinkUser({ email, phone: phone.trim(), country });
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
      const kyc_level = customerRes.success ? customerRes.data.kyc_level : null;

      if (kyc_level === 'L0' || kyc_level === 'L1' || kyc_level === 'L2' || kyc_level === 'PENDING') {
        navigation.navigate('Wallet', { customerId: authResult.customerId, authToken });
      } else {
        navigation.navigate('KYCPrimer', {
          customerId: authResult.customerId,
          authToken,
          registrationCountry: country,
        });
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

      <Text style={styles.label}>Country</Text>
      <View style={styles.chipRow}>
        {COUNTRIES.map(c => (
          <TouchableOpacity
            key={c.code}
            style={[styles.chip, country === c.code && styles.chipSelected]}
            onPress={() => setCountry(c.code)}
          >
            <Text style={[styles.chipText, country === c.code && styles.chipTextSelected]}>
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
  },
  chipSelected: {
    borderColor: '#635BFF',
    backgroundColor: '#1a1a2e',
  },
  chipText: { color: '#aaa', fontSize: 14, fontWeight: '600' },
  chipTextSelected: { color: '#635BFF' },
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
