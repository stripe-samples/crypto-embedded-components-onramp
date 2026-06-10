import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'EuKYC'>;
  route: RouteProp<RootStackParamList, 'EuKYC'>;
};

export default function EuKYCScreen({ navigation, route }: Props) {
  const { customerId, authToken } = route.params;
  const { attachKycInfo } = useOnramp();

  const [submitting, setSubmitting] = useState(false);
  const [nationalityInput, setNationalityInput] = useState('');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    dobDay: '',
    dobMonth: '',
    dobYear: '',
    line1: '',
    city: '',
    postalCode: '',
    country: '',
    state: '',
    birthCity: '',
    birthCountry: '',
  });
  const [nationalities, setNationalities] = useState<string[]>([]);

  const set = (key: keyof typeof form) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const addNationality = () => {
    const code = nationalityInput.trim().toUpperCase();
    if (code.length !== 2) return;
    if (nationalities.includes(code)) return;
    setNationalities(prev => [...prev, code]);
    setNationalityInput('');
  };

  const removeNationality = (code: string) => {
    setNationalities(prev => prev.filter(n => n !== code));
  };

  const handleSubmit = async () => {
    const { firstName, lastName, dobDay, dobMonth, dobYear, line1, city, postalCode, country, birthCity, birthCountry } = form;

    if (!firstName || !lastName || !dobDay || !dobMonth || !dobYear) {
      Alert.alert('Error', 'Please fill in your name and date of birth.');
      return;
    }
    if (!line1 || !city || !postalCode || !country) {
      Alert.alert('Error', 'Please fill in all address fields.');
      return;
    }
    if (nationalities.length === 0) {
      Alert.alert('Error', 'Please add at least one nationality.');
      return;
    }
    if (!birthCity || !birthCountry) {
      Alert.alert('Error', 'Please fill in your birth city and country.');
      return;
    }

    setSubmitting(true);
    try {
      const address: any = { line1, city, postalCode, country };
      if (country === 'IE' && form.state) {
        address.state = form.state;
      }

      const result = await attachKycInfo({
        firstName,
        lastName,
        dateOfBirth: {
          day: parseInt(dobDay, 10),
          month: parseInt(dobMonth, 10),
          year: parseInt(dobYear, 10),
        },
        address,
        nationalities,
        birthCity,
        birthCountry,
      } as any);

      if (result?.error) {
        Alert.alert('KYC Error', result.error.message);
        return;
      }

      navigation.navigate('EuIdentifiers', { customerId, authToken });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.tierBadge}>EU</Text>
        <Text style={styles.title}>Add your personal info</Text>

        <View style={styles.testCard}>
          <Text style={styles.testCardTitle}>Test mode</Text>
          <Text style={styles.testCardBody}>
            Use <Text style={styles.testCardCode}>Verified</Text> as the last name to pass verification in test mode.
          </Text>
        </View>

        <Row label="First Name" value={form.firstName} onChange={set('firstName')} autoCapitalize="words" />
        <Row label="Last Name" value={form.lastName} onChange={set('lastName')} autoCapitalize="words" />

        <Text style={styles.section}>Date of Birth</Text>
        <View style={styles.row3}>
          <SmallRow label="DD" value={form.dobDay} onChange={set('dobDay')} />
          <SmallRow label="MM" value={form.dobMonth} onChange={set('dobMonth')} />
          <SmallRow label="YYYY" value={form.dobYear} onChange={set('dobYear')} />
        </View>

        <Text style={styles.section}>Address</Text>
        <Row label="Address line 1" value={form.line1} onChange={set('line1')} autoCapitalize="words" />
        <Row label="City" value={form.city} onChange={set('city')} autoCapitalize="words" />
        <Row label="Postal Code" value={form.postalCode} onChange={set('postalCode')} />
        <Row label="Country (2-letter code)" value={form.country} onChange={(v) => set('country')(v.toUpperCase().slice(0, 2))} autoCapitalize="characters" />

        {form.country === 'IE' && (
          <Row label="State" value={form.state} onChange={set('state')} autoCapitalize="words" />
        )}

        <Text style={styles.section}>Nationalities</Text>
        <View style={styles.chipRow}>
          {nationalities.map(code => (
            <TouchableOpacity key={code} style={styles.chip} onPress={() => removeNationality(code)}>
              <Text style={styles.chipText}>{code} ✕</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.addRow}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={nationalityInput}
            onChangeText={setNationalityInput}
            placeholder="2-letter code (e.g. GR)"
            placeholderTextColor="#555"
            autoCapitalize="characters"
            maxLength={2}
          />
          <TouchableOpacity style={styles.addButton} onPress={addNationality}>
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.section}>Place of Birth</Text>
        <Row label="Birth City" value={form.birthCity} onChange={set('birthCity')} autoCapitalize="words" />
        <Row label="Birth Country (2-letter code)" value={form.birthCountry} onChange={(v) => set('birthCountry')(v.toUpperCase().slice(0, 2))} autoCapitalize="characters" />

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Next</Text>}
        </TouchableOpacity>
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

function SmallRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1, marginHorizontal: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor="#555"
        keyboardType="numeric"
        maxLength={label === 'YYYY' ? 4 : 2}
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
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 },
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
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 16 },
  testCard: {
    backgroundColor: '#141f14',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1e3a1e',
  },
  testCardTitle: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  testCardBody: { color: '#777', fontSize: 13, lineHeight: 18 },
  testCardCode: { color: '#aaa', fontFamily: 'monospace', fontSize: 12 },
  section: { color: '#635BFF', fontSize: 14, fontWeight: '600', marginBottom: 12, marginTop: 8 },
  row3: { flexDirection: 'row', marginBottom: 16, marginHorizontal: -4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#635BFF',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: { color: '#635BFF', fontSize: 13, fontWeight: '600' },
  addRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  addButton: {
    backgroundColor: '#635BFF',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginLeft: 8,
  },
  addButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
