/**
 * WalletOwnershipVerificationPanel — EU Travel Rule wallet signing UI.
 *
 * Shared between WalletScreen (proactive verification on registration)
 * and PaymentMethodScreen (reactive verification on checkout failure).
 */
import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Onramp } from '@stripe/stripe-react-native';

type Props = {
  challenge: Onramp.WalletOwnershipChallenge;
  sig: string;
  onSigChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
};

export default function WalletOwnershipVerificationPanel({ challenge, sig, onSigChange, onSubmit, loading }: Props) {
  return (
    <View>
      <Text style={styles.title}>Verify Wallet Ownership</Text>
      <Text style={styles.subtitle}>
        EU Travel Rule requires proof that you control this wallet.
      </Text>

      <Text style={styles.label}>Challenge Message</Text>
      <TextInput
        style={[styles.input, styles.inputMono, { minHeight: 100 }]}
        value={challenge.message}
        editable={false}
        multiline
        selectTextOnFocus
      />

      <View style={styles.testCard}>
        <Text style={styles.testCardText}>
          Test mode: paste the challenge message above as the signature to pass verification.
        </Text>
      </View>

      <Text style={styles.label}>Signature</Text>
      <TextInput
        style={styles.input}
        value={sig}
        onChangeText={onSigChange}
        placeholder="Paste your signature here"
        placeholderTextColor="#555"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TouchableOpacity
        style={[styles.button, (loading || !sig) && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={loading || !sig}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Verify Ownership</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 24 },
  label: { color: '#aaa', fontSize: 13, marginBottom: 8 },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 15,
    marginBottom: 24,
  },
  inputMono: { fontFamily: 'Courier', fontSize: 13, color: '#ccc' },
  testCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    marginBottom: 20,
  },
  testCardText: { color: '#7070cc', fontSize: 13, lineHeight: 18 },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
