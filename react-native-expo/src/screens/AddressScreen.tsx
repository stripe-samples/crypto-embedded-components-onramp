/**
 * AddressScreen — collect the customer's home address and submit KYC data.
 *
 * Recommended operations at this step:
 *   - Collect home address (line1, city, state, postalCode).
 *   - Call attachKycInfo({ firstName, lastName, address }) for L0.
 *     L1/L2: also include idNumber and dateOfBirth collected in KYCScreen.
 *   - L2 only: call verifyIdentity() after attachKycInfo to capture a
 *     government-issued ID document and selfie via Stripe's built-in UI.
 *
 * attachKycInfo() merges with any data already on file — only send the fields
 * collected in this onboarding flow (do not re-send fields from prior sessions).
 *
 * Next screen: WalletScreen
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, Modal, FlatList, Linking,
} from 'react-native';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useSettings } from '../context/SettingsContext';

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

const US_STATES = Object.keys(STATE_NAMES) as (keyof typeof STATE_NAMES)[];

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Address'>;
  route: RouteProp<RootStackParamList, 'Address'>;
};

export default function AddressScreen({ navigation, route }: Props) {
  const { customerId, authToken, firstName, lastName, idNumber, dobDay, dobMonth, dobYear } = route.params;
  const [submitting, setSubmitting] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [form, setForm] = useState({
    line1: '', line2: '', city: '', state: '', postalCode: '',
  });

  const { attachKycInfo, verifyIdentity } = useOnramp();
  // L2 tier adds a government-ID + selfie verification step after address submission.
  const { settings } = useSettings();

  const handleSubmit = async () => {
    const { line1, city, state, postalCode } = form;
    if (!line1 || !city || !state || !postalCode) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      // Build the KYC payload with only the fields that were collected.
      // L0 skips SSN and DOB (idNumber/dob* are undefined in route params),
      // so we omit those fields from the attachKycInfo call.
      // L1 and L2 include all fields.
      const kycPayload: Parameters<typeof attachKycInfo>[0] = {
        firstName,
        lastName,
        address: {
          line1,
          line2: form.line2 || undefined,
          city,
          state,
          postalCode,
          country: 'US',
        },
        ...(idNumber ? { idNumber } : {}),
        ...(dobDay && dobMonth && dobYear
          ? { dateOfBirth: { day: dobDay, month: dobMonth, year: dobYear } }
          : {}),
      };
      const result = await attachKycInfo(kycPayload);

      if (result?.error) {
        Alert.alert('KYC Error', result.error.message);
        return;
      }

      // L2 requires an additional identity-document verification step.
      // For L0 and L1 we skip this and the user proceeds with their current
      // KYC tier. If they later attempt a purchase above the tier's limit,
      // the KYCStepUp screen will guide them through the upgrade.
      if (settings.kycTier === 'L2') {
        const idResult = await verifyIdentity();
        if (idResult?.error) {
          console.log('Identity verification note:', idResult.error.message);
        }
      }

      // Proceed to wallet attachment. PaymentMethodScreen (reached after the
      // wallet is registered) will poll getCryptoCustomer() to confirm the
      // initial KYC submission is verified before allowing a purchase.
      navigation.navigate('Wallet', { customerId, authToken });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const set = (key: keyof typeof form) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.tierBadge}>{settings.kycTier}</Text>
      <Text style={styles.title}>Add your home address</Text>
      <Text style={styles.subtitle}>Currently only US addresses are supported</Text>

      <Row label="Address line 1" value={form.line1} onChange={set('line1')} autoCapitalize="words" />
      <Row label="Address line 2 (optional)" value={form.line2} onChange={set('line2')} autoCapitalize="words" />
      <Row label="City" value={form.city} onChange={set('city')} autoCapitalize="words" />

      <View style={styles.row2}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={s.label}>State</Text>
          <TouchableOpacity
            style={s.pickerButton}
            onPress={() => setShowStatePicker(true)}
          >
            <Text style={form.state ? s.pickerText : s.pickerPlaceholder}>
              {form.state ? STATE_NAMES[form.state] : 'Select state'}
            </Text>
            <Text style={s.pickerArrow}>▼</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          <Row label="ZIP" value={form.postalCode} onChange={set('postalCode')} keyboardType="numeric" />
        </View>
      </View>

      {/* SDK call reference */}
      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>SDK calls on submit</Text>
        <Text style={styles.infoCardBody}>
          <Text style={styles.infoCode}>attachKycInfo(&#123; firstName, lastName, address
            {settings.kycTier !== 'L0' ? ', idNumber, dateOfBirth' : ''}
          {' '}&#125;)</Text>
          {settings.kycTier === 'L2' && (
            <Text>{'\n'}<Text style={styles.infoCode}>verifyIdentity()</Text></Text>
          )}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit KYC</Text>}
      </TouchableOpacity>

      <Modal visible={showStatePicker} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select State</Text>
              <TouchableOpacity onPress={() => setShowStatePicker(false)}>
                <Text style={s.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={US_STATES}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.stateRow, form.state === item && s.stateRowSelected]}
                  onPress={() => { set('state')(item); setShowStatePicker(false); }}
                >
                  <Text style={s.stateName}>{STATE_NAMES[item]}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function Row({ label, value, onChange, keyboardType, autoCapitalize }: {
  label: string; value: string; onChange: (v: string) => void;
  keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor="#555"
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'none'}
      />
    </View>
  );
}

const s = StyleSheet.create({
  label: { color: '#aaa', fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 15,
  },
  pickerButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText: { color: '#fff', fontSize: 15 },
  pickerPlaceholder: { color: '#555', fontSize: 15 },
  pickerArrow: { color: '#555', fontSize: 10 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  modalClose: { color: '#635BFF', fontSize: 16, fontWeight: '600' },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  stateRowSelected: { backgroundColor: '#252535' },
  stateCode: { color: '#635BFF', fontSize: 16, fontWeight: '700', width: 32 },
  stateName: { color: '#fff', fontSize: 15, marginLeft: 8 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 },
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
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 24 },
  row2: { flexDirection: 'row' },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  infoCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  infoCardTitle: {
    color: '#635BFF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  infoCardBody: { color: '#777', fontSize: 13, lineHeight: 20 },
  infoCode: { fontFamily: 'monospace', color: '#aaa', fontSize: 12 },
});
