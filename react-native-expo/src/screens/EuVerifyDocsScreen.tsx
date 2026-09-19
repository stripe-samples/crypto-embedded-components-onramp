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
  navigation: NativeStackNavigationProp<RootStackParamList, 'EuVerifyDocs'>;
  route: RouteProp<RootStackParamList, 'EuVerifyDocs'>;
};

export default function EuVerifyDocsScreen({ navigation, route }: Props) {
  const { customerId, authToken } = route.params;
  const { verifyIdentity } = useOnramp();
  const [submitting, setSubmitting] = useState(false);

  const handleVerify = async () => {
    setSubmitting(true);
    try {
      const result = await verifyIdentity();
      if (result?.error) {
        Alert.alert('Verification Error', result.error.message);
        return;
      }
      navigation.navigate('Wallet', { customerId, authToken });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.tierBadge}>EU</Text>
      <Text style={styles.title}>Document Verification</Text>
      <Text style={styles.subtitle}>L2 identity verification is mandatory for EU users</Text>

      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>What you will need</Text>
        <View style={styles.requirementsList}>
          <View style={styles.requirementRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.requirementText}>Government-issued photo ID (passport or driver's license)</Text>
          </View>
          <View style={styles.requirementRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.requirementText}>A selfie to match your ID photo</Text>
          </View>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>Why is this required?</Text>
        <Text style={styles.infoCardBody}>
          EU regulations require full identity verification (L2) for all crypto asset transactions. This includes document verification and a liveness check to confirm your identity.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleVerify}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Start Document Verification</Text>}
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
  requirementsList: { marginTop: 4 },
  requirementRow: { flexDirection: 'row', marginBottom: 8 },
  bullet: { color: '#635BFF', fontSize: 16, marginRight: 8 },
  requirementText: { color: '#888', fontSize: 14, lineHeight: 20, flex: 1 },
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
