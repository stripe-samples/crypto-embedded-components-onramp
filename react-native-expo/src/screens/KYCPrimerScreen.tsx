/**
 * KYCPrimerScreen — consent and overview screen shown before identity collection.
 *
 * Recommended operations at this step:
 *   - Display what information will be collected (varies by KYC tier).
 *   - Explain that the data is handled by Link / Stripe, not the merchant.
 *   - No API calls are made here.
 *
 * Next screen: KYCScreen (collects name; L1/L2 also collect SSN + date of birth)
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { MERCHANT_DISPLAY_NAME } from '../constants';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useSettings } from '../context/SettingsContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'KYCPrimer'>;
  route: RouteProp<RootStackParamList, 'KYCPrimer'>;
};

// What each tier requires the user to provide.
const REQUIREMENTS_BY_TIER = {
  L0: [
    'Full name',
    'Home address',
  ],
  L1: [
    'Full name',
    'Social Security Number',
    'Date of birth',
    'Home address',
  ],
  L2: [
    'Full name',
    'Social Security Number',
    'Date of birth',
    'Home address',
    'Government-issued photo ID',
    'Selfie',
  ],
};

export default function KYCPrimerScreen({ navigation, route }: Props) {
  const { customerId, authToken } = route.params;
  const { settings } = useSettings();

  const requirements = REQUIREMENTS_BY_TIER[settings.kycTier];

  return (
    <View style={styles.container}>
      <Text style={styles.tierBadge}>{settings.kycTier}</Text>
      <Text style={styles.title}>Add your personal info</Text>
      <Text style={styles.description}>
        Next, Link needs to collect a few personal details to verify your
        identity. This information is not shared with {MERCHANT_DISPLAY_NAME}.{' '}
        <Text
          style={styles.link}
          onPress={() =>
            Linking.openURL(
              'https://support.link.com/questions/why-do-i-need-to-verify-my-identity'
            )
          }
        >
          Learn more
        </Text>
      </Text>

      <Text style={styles.requiredLabel}>{"What's required:"}</Text>
      {requirements.map(item => (
        <View key={item} style={styles.bulletRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}

      {/* L2 note about the identity-document step */}
      {settings.kycTier === 'L2' && (
        <View style={styles.noteBanner}>
          <Text style={styles.noteText}>
            The ID and selfie are captured via Stripe's built-in secure
            verification flow at the end of setup.
          </Text>
        </View>
      )}

      <View style={styles.securityBanner}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.securityText}>
          Link encrypts this data to keep it secure.
        </Text>
      </View>

      <View style={styles.spacer} />

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('KYC', { customerId, authToken })}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  tierBadge: {
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
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 12 },
  description: { fontSize: 14, color: '#999', lineHeight: 20, marginBottom: 28 },
  link: { color: '#635BFF' },
  requiredLabel: { fontSize: 15, color: '#fff', marginBottom: 12 },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingLeft: 4,
  },
  bullet: { color: '#fff', fontSize: 16, marginRight: 10 },
  bulletText: { color: '#fff', fontSize: 15 },
  noteBanner: {
    backgroundColor: '#1a1a2a',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  noteText: { color: '#888', fontSize: 13, lineHeight: 18 },
  securityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 20,
  },
  lockIcon: { fontSize: 16, marginRight: 10 },
  securityText: { color: '#999', fontSize: 13, flex: 1 },
  spacer: { flex: 1 },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
