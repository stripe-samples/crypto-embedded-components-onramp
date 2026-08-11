import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'EuAttestation'>;
  route: RouteProp<RootStackParamList, 'EuAttestation'>;
};

export default function EuAttestationScreen({ navigation, route }: Props) {
  const { customerId, authToken } = route.params;
  const { presentUserAttestation } = useOnramp() as any;
  const [submitting, setSubmitting] = useState(false);

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      const result = await presentUserAttestation();
      if (result.status === 'Confirmed') {
        navigation.navigate('EuVerifyDocs', { customerId, authToken });
      } else {
        Alert.alert('Not Confirmed', 'The declaration was not confirmed. Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.tierBadge}>EU</Text>
      <Text style={styles.title}>Terms of Service</Text>
      <Text style={styles.subtitle}>Review and accept the terms of service</Text>

      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>What is this?</Text>
        <Text style={styles.infoCardBody}>
          Review and accept the terms of service for crypto asset purchases.
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>Why is this required?</Text>
        <Text style={styles.infoCardBody}>
          By accepting, you confirm that the information you provided is accurate and complete, and you agree to the terms governing crypto asset purchases.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleAccept}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Accept Terms of Service</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

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
  infoCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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
  infoCardBody: { color: '#888', fontSize: 14, lineHeight: 20 },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
