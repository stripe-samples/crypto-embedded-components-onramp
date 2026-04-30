import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'KYC'>;
  route: RouteProp<RootStackParamList, 'KYC'>;
};

function formatSSN(raw: string): string {
  if (raw.length <= 3) return raw;
  if (raw.length <= 5) return `${raw.slice(0, 3)}-${raw.slice(3)}`;
  return `${raw.slice(0, 3)}-${raw.slice(3, 5)}-${raw.slice(5)}`;
}

function maskSSN(raw: string): string {
  if (raw.length < 9) return formatSSN(raw);
  return `•••-••-${raw.slice(5)}`;
}

export default function KYCScreen({ navigation, route }: Props) {
  const { customerId, authToken } = route.params;
  const [form, setForm] = useState({
    firstName: '', lastName: '',
    dobDay: '', dobMonth: '', dobYear: '',
  });
  const [ssnRaw, setSsnRaw] = useState('');
  const [ssnFocused, setSsnFocused] = useState(false);

  const handleSSNChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 9);
    setSsnRaw(digits);
  };

  const handleNext = () => {
    const { firstName, lastName, dobDay, dobMonth, dobYear } = form;
    if (!firstName || !lastName || ssnRaw.length !== 9 || !dobDay || !dobMonth || !dobYear) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
    navigation.navigate('Address', {
      customerId,
      authToken,
      firstName,
      lastName,
      idNumber: ssnRaw,
      dobDay: parseInt(dobDay, 10),
      dobMonth: parseInt(dobMonth, 10),
      dobYear: parseInt(dobYear, 10),
    });
  };

  const set = (key: keyof typeof form) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const ssnDisplay = ssnFocused ? formatSSN(ssnRaw) : maskSSN(ssnRaw);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Add your personal info</Text>
      <Text style={styles.subtitle}>Enter your name, SSN, and date of birth</Text>

      <Row label="First Name" value={form.firstName} onChange={set('firstName')} autoCapitalize="words" />
      <Row label="Last Name" value={form.lastName} onChange={set('lastName')} autoCapitalize="words" />

      <View style={{ marginBottom: 16 }}>
        <Text style={s.label}>Social Security Number</Text>
        <TextInput
          style={s.input}
          value={ssnDisplay}
          onChangeText={handleSSNChange}
          onFocus={() => setSsnFocused(true)}
          onBlur={() => setSsnFocused(false)}
          placeholder="XXX-XX-XXXX"
          placeholderTextColor="#555"
          keyboardType="numeric"
          maxLength={11}
        />
      </View>

      <Text style={styles.section}>Date of Birth</Text>
      <View style={styles.row3}>
        <SmallRow label="MM" value={form.dobMonth} onChange={set('dobMonth')} />
        <SmallRow label="DD" value={form.dobDay} onChange={set('dobDay')} />
        <SmallRow label="YYYY" value={form.dobYear} onChange={set('dobYear')} />
      </View>

      <TouchableOpacity style={styles.button} onPress={handleNext}>
        <Text style={styles.buttonText}>Next</Text>
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
  content: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 24 },
  section: { color: '#635BFF', fontSize: 14, fontWeight: '600', marginBottom: 12, marginTop: 8 },
  row3: { flexDirection: 'row', marginBottom: 16, marginHorizontal: -4 },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
