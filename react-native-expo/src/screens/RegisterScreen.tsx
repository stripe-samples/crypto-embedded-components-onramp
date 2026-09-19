import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, Linking, Modal, FlatList,
} from 'react-native';
import { MERCHANT_DISPLAY_NAME } from '../constants';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { createAuthIntent, saveUser, getCryptoCustomer } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import { EU_COUNTRY_NAMES } from '../euIdentifiers';


type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Register'>;
  route: RouteProp<RootStackParamList, 'Register'>;
};

const EU_COUNTRY_LIST = Object.entries(EU_COUNTRY_NAMES)
  .sort(([, a], [, b]) => a.localeCompare(b))
  .map(([code]) => code);

export default function RegisterScreen({ navigation, route }: Props) {
  const { email, authToken: initialToken } = route.params;
  const { settings } = useSettings();
  const [phone, setPhone] = useState(settings.kycRegion === 'eu' ? '+' : '+1');
  const [country, setCountry] = useState(settings.kycRegion === 'eu' ? '' : 'US');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const { registerLinkUser, authorize } = useOnramp();

  const handleRegister = async () => {
    if (!phone.trim() || phone === '+1' || phone === '+') {
      Alert.alert('Error', 'Please enter your phone number.');
      return;
    }
    if (!country) {
      Alert.alert('Error', 'Please select your country.');
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

      <Text style={styles.label}>Country</Text>
      {settings.kycRegion === 'us' ? (
        <TextInput style={[styles.input, styles.inputDisabled]} value="United States" editable={false} />
      ) : (
        <TouchableOpacity
          style={[styles.input, styles.countryPicker]}
          onPress={() => setShowCountryPicker(true)}
        >
          <Text style={country ? styles.countryPickerText : styles.countryPickerPlaceholder}>
            {country ? `${EU_COUNTRY_NAMES[country]} (${country})` : 'Select country'}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.label}>Phone number</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder={settings.kycRegion === 'eu' ? '+491234567890' : '+12125551234'}
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

      <Modal visible={showCountryPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Country</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={EU_COUNTRY_LIST}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.countryRow}
                  onPress={() => { setCountry(item); setShowCountryPicker(false); }}
                >
                  <Text style={styles.countryCode}>{item}</Text>
                  <Text style={styles.countryName}>{EU_COUNTRY_NAMES[item]}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
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
  countryPicker: { justifyContent: 'center' },
  countryPickerText: { color: '#fff', fontSize: 16 },
  countryPickerPlaceholder: { color: '#555', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#333',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  modalClose: { color: '#635BFF', fontSize: 16, fontWeight: '600' },
  countryRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2a2a2a',
  },
  countryCode: { color: '#635BFF', fontSize: 16, fontWeight: '700', width: 32 },
  countryName: { color: '#fff', fontSize: 15, marginLeft: 8 },
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
