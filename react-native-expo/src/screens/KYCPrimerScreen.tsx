/**
 * KYCPrimerScreen — consent and country-of-residence selection before identity collection.
 *
 * The user manually picks their country of residence here. That choice determines
 * which KYC flow they enter:
 *   - US  → KYCScreen  (name / SSN / DOB → AddressScreen)
 *   - EU  → EuKycScreen (Basic Info → Identifiers → Attestation → Verify Docs)
 *
 * No API calls are made here.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, ScrollView,
} from 'react-native';
import { MERCHANT_DISPLAY_NAME } from '../constants';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useSettings } from '../context/SettingsContext';
import { EU_COUNTRY_NAMES, EU_COUNTRIES } from '../euIdentifiers';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'KYCPrimer'>;
  route: RouteProp<RootStackParamList, 'KYCPrimer'>;
};

const REQUIREMENTS_BY_TIER = {
  L0: ['Full name', 'Home address'],
  L1: ['Full name', 'Social Security Number', 'Date of birth', 'Home address'],
  L2: [
    'Full name', 'Social Security Number', 'Date of birth',
    'Home address', 'Government-issued photo ID', 'Selfie',
  ],
};

const EU_REQUIREMENTS = [
  'Full name and date of birth',
  'Home address',
  'Birth city and country',
  'Nationality',
  'National identifier (MiCA / CARF)',
  'Terms of Service acceptance',
  'Government-issued photo ID + selfie',
];

// All selectable countries: US first, then EU alphabetically.
const COUNTRY_OPTIONS: { code: string; label: string }[] = [
  { code: 'US', label: 'United States' },
  ...Object.entries(EU_COUNTRY_NAMES)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([code, name]) => ({ code, label: name })),
];

export default function KYCPrimerScreen({ navigation, route }: Props) {
  const { customerId, authToken, registrationCountry } = route.params;
  const { settings } = useSettings();

  // Default to the country the user registered with, if available.
  const [country, setCountry] = useState(registrationCountry ?? '');
  const [showPicker, setShowPicker] = useState(false);

  const isEu = EU_COUNTRIES.has(country);
  const requirements = country
    ? isEu
      ? EU_REQUIREMENTS
      : REQUIREMENTS_BY_TIER[settings.kycTier]
    : null;

  const handleContinue = () => {
    if (isEu) {
      navigation.navigate('EuKyc', { customerId, authToken, country });
    } else {
      navigation.navigate('KYC', { customerId, authToken });
    }
  };

  const selectedLabel = country
    ? `${EU_COUNTRY_NAMES[country] ?? 'United States'} (${country})`
    : 'Select your country of residence';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {country ? (
        <Text style={[styles.badge, isEu && styles.badgeEu]}>
          {isEu ? 'EU' : 'US'}
        </Text>
      ) : null}

      <Text style={styles.title}>Add your personal info</Text>
      <Text style={styles.description}>
        Next, Link needs to collect a few personal details to verify your
        identity. This information is not shared with {MERCHANT_DISPLAY_NAME}.{' '}
        <Text
          style={styles.link}
          onPress={() =>
            Linking.openURL('https://support.link.com/questions/why-do-i-need-to-verify-my-identity')
          }
        >
          Learn more
        </Text>
      </Text>

      {/* Country of residence picker */}
      <Text style={styles.sectionLabel}>Country of residence</Text>
      <TouchableOpacity
        style={[styles.countryButton, !country && styles.countryButtonEmpty]}
        onPress={() => setShowPicker(!showPicker)}
      >
        <Text style={[styles.countryButtonText, !country && styles.countryButtonPlaceholder]}>
          {selectedLabel}
        </Text>
        <Text style={styles.chevron}>{showPicker ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {showPicker && (
        <ScrollView style={styles.pickerList} nestedScrollEnabled>
          {COUNTRY_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.code}
              style={[styles.pickerItem, country === opt.code && styles.pickerItemSelected]}
              onPress={() => {
                setCountry(opt.code);
                setShowPicker(false);
              }}
            >
              <Text style={[styles.pickerItemText, country === opt.code && styles.pickerItemTextSelected]}>
                {opt.label} ({opt.code})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Requirements list — shown after country is chosen */}
      {requirements && (
        <>
          {isEu && (
            <View style={styles.noteBanner}>
              <Text style={styles.noteText}>
                EU customers must complete identity verification under MiCA / CARF regulations.
              </Text>
            </View>
          )}

          <Text style={styles.requiredLabel}>{"What's required:"}</Text>
          {requirements.map(item => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}

          {!isEu && settings.kycTier === 'L2' && (
            <View style={styles.noteBanner}>
              <Text style={styles.noteText}>
                The ID and selfie are captured via Stripe's built-in secure verification flow.
              </Text>
            </View>
          )}
        </>
      )}

      <View style={styles.securityBanner}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.securityText}>Link encrypts this data to keep it secure.</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, !country && styles.buttonDisabled]}
        onPress={handleContinue}
        disabled={!country}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#635BFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    color: '#635BFF',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },
  badgeEu: {},
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 12 },
  description: { fontSize: 14, color: '#999', lineHeight: 20, marginBottom: 24 },
  link: { color: '#635BFF' },
  sectionLabel: {
    color: '#635BFF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#635BFF',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  countryButtonEmpty: { borderColor: '#333' },
  countryButtonText: { color: '#fff', fontSize: 15, flex: 1 },
  countryButtonPlaceholder: { color: '#555' },
  chevron: { color: '#635BFF', fontSize: 12, marginLeft: 8 },
  pickerList: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 16,
    maxHeight: 260,
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  pickerItemSelected: { backgroundColor: '#1a1a2e' },
  pickerItemText: { color: '#ccc', fontSize: 14 },
  pickerItemTextSelected: { color: '#635BFF', fontWeight: '600' },
  noteBanner: {
    backgroundColor: '#1a1a2a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  noteText: { color: '#888', fontSize: 13, lineHeight: 18 },
  requiredLabel: { fontSize: 15, color: '#fff', marginBottom: 12, marginTop: 8 },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingLeft: 4,
  },
  bullet: { color: '#fff', fontSize: 16, marginRight: 10 },
  bulletText: { color: '#fff', fontSize: 15 },
  securityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 24,
  },
  lockIcon: { fontSize: 16, marginRight: 10 },
  securityText: { color: '#999', fontSize: 13, flex: 1 },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
