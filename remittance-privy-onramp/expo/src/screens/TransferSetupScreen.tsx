import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePrivy } from '@privy-io/expo';
import { RootStackParamList } from '../types';
import { useTransfer } from '../context/TransferContext';
import { errorMessage } from '../errors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'TransferSetup'>;
};

export default function TransferSetupScreen({ navigation }: Props) {
  const { transfer, updateTransfer } = useTransfer();
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);

  const continueToWallet = async () => {
    if (!transfer.amountUsd || Number(transfer.amountUsd) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }
    if (!transfer.recipientName.trim() || !transfer.recipientDestination.trim()) {
      Alert.alert('Error', 'Please enter recipient details.');
      return;
    }

    setLoading(true);
    try {
      const authToken = await getAccessToken();
      if (!authToken) {
        throw new Error('Privy did not return an access token');
      }
      navigation.navigate('Wallet', { authToken });
    } catch (err: unknown) {
      Alert.alert('Error', errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Transfer details</Text>
      <Text style={styles.title}>Who are you sending to?</Text>
      <Text style={styles.subtitle}>
        Enter the transfer amount and recipient details. The developer app will handle the payment and payout flow after this.
      </Text>

      <View style={styles.amountPanel}>
        <Text style={styles.label}>You send</Text>
        <View style={styles.amountRow}>
          <Text style={styles.currencyPrefix}>$</Text>
          <TextInput
            style={styles.amountInput}
            value={transfer.amountUsd}
            onChangeText={amountUsd => updateTransfer({ amountUsd })}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor="#555"
          />
          <Text style={styles.currencyCode}>USD</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Recipient</Text>
        <TextInput
          style={styles.textInput}
          value={transfer.recipientName}
          onChangeText={recipientName => updateTransfer({ recipientName })}
          placeholder="Recipient name"
          placeholderTextColor="#555"
        />
        <TextInput
          style={styles.textInput}
          value={transfer.recipientDestination}
          onChangeText={recipientDestination => updateTransfer({ recipientDestination })}
          placeholder="Bank or wallet destination"
          placeholderTextColor="#555"
        />
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={continueToWallet}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32 },
  kicker: { color: '#8db8ff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 10 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', marginBottom: 10 },
  subtitle: { color: '#aaa', fontSize: 15, lineHeight: 21, marginBottom: 22 },
  amountPanel: {
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
  },
  label: { color: '#888', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  currencyPrefix: { color: '#fff', fontSize: 34, fontWeight: '800', marginRight: 4 },
  amountInput: { flex: 1, color: '#fff', fontSize: 40, fontWeight: '800', paddingVertical: 0 },
  currencyCode: { color: '#888', fontSize: 15, fontWeight: '800', marginLeft: 10 },
  card: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#242424',
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
  },
  cardLabel: { color: '#777', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 10 },
  textInput: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 10,
    color: '#fff',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
  },
  button: { backgroundColor: '#635BFF', paddingVertical: 17, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
