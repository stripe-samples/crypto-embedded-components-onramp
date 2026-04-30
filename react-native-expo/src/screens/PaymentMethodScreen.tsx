import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { createOnrampSession } from '../api/client';
import { CURRENCIES_BY_NETWORK } from '../constants';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PaymentMethod'>;
  route: RouteProp<RootStackParamList, 'PaymentMethod'>;
};

export default function PaymentMethodScreen({ navigation, route }: Props) {
  const { customerId, authToken, walletAddress, network } = route.params;
  const availableCurrencies = CURRENCIES_BY_NETWORK[network] ?? ['eth'];
  const [sourceAmount, setSourceAmount] = useState('10');
  const [destCurrency, setDestCurrency] = useState(availableCurrencies[0]);

  const [paymentReady, setPaymentReady] = useState(false);
  const [paymentLabel, setPaymentLabel] = useState('');
  const [cryptoPaymentToken, setCryptoPaymentToken] = useState('');
  const [collectingMethod, setCollectingMethod] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);

  const { collectPaymentMethod, createCryptoPaymentToken } = useOnramp();

  // collectPaymentMethod opens Stripe's wallet UI which already lists saved
  // methods and allows adding new ones — always go through this SDK flow.
  const handleCollectPaymentMethod = async () => {
    setCollectingMethod(true);
    try {
      const result = await collectPaymentMethod('Card');
      if (result?.error) {
        Alert.alert('Error', result.error.message);
        return;
      }
      if (!result?.displayData) return;

      const tokenResult = await createCryptoPaymentToken();
      if (tokenResult?.error) {
        Alert.alert('Error', tokenResult.error.message);
        return;
      }

      setCryptoPaymentToken(tokenResult.cryptoPaymentToken ?? '');
      setPaymentLabel(result.displayData.label ?? 'Card');
      setPaymentReady(true);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setCollectingMethod(false);
    }
  };

  const handleProceed = async () => {
    const amount = parseFloat(sourceAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }
    setCreatingSession(true);
    try {
      const sessionResult = await createOnrampSession({
        paymentToken: cryptoPaymentToken,
        walletAddress,
        customerId,
        authToken,
        destinationNetwork: network,
        sourceAmount: amount,
        sourceCurrency: 'usd',
        destinationCurrency: destCurrency,
      });

      if (!sessionResult.success) {
        Alert.alert('Error', sessionResult.error.message);
        return;
      }

      navigation.navigate('Checkout', {
        customerId,
        authToken,
        walletAddress,
        network,
        sessionId: sessionResult.data.id,
        sourceAmount,
        sourceCurrency: 'usd',
        destinationCurrency: destCurrency,
        paymentLabel,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setCreatingSession(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Add a payment method</Text>

      <Text style={styles.label}>Amount (USD)</Text>
      <TextInput
        style={styles.input}
        value={sourceAmount}
        onChangeText={setSourceAmount}
        keyboardType="decimal-pad"
        placeholder="10"
        placeholderTextColor="#555"
      />

      <Text style={styles.label}>Destination Currency</Text>
      <View style={styles.chipRow}>
        {availableCurrencies.map(c => (
          <TouchableOpacity
            key={c}
            style={[styles.chip, destCurrency === c && styles.chipSelected]}
            onPress={() => setDestCurrency(c)}
          >
            <Text style={[styles.chipText, destCurrency === c && styles.chipTextSelected]}>
              {c.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Payment Method</Text>

      {paymentReady ? (
        <View style={styles.paymentCard}>
          <Text style={styles.paymentLabel}>{paymentLabel}</Text>
          <TouchableOpacity onPress={() => { setPaymentReady(false); setCryptoPaymentToken(''); }}>
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TouchableOpacity
            style={[styles.addMethodButton, collectingMethod && styles.buttonDisabled]}
            onPress={handleCollectPaymentMethod}
            disabled={collectingMethod}
          >
            {collectingMethod
              ? <ActivityIndicator color="#635BFF" />
              : <Text style={styles.addMethodText}>Select or Add Payment Method</Text>}
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity
        style={[styles.button, (!paymentReady || creatingSession) && styles.buttonDisabled]}
        onPress={handleProceed}
        disabled={!paymentReady || creatingSession}
      >
        {creatingSession
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Review Purchase</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 24 },
  label: { color: '#aaa', fontSize: 13, marginBottom: 8 },
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
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 24, flexWrap: 'wrap' },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  chipSelected: { backgroundColor: '#635BFF', borderColor: '#635BFF' },
  chipText: { color: '#888', fontSize: 13 },
  chipTextSelected: { color: '#fff' },
  paymentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#635BFF',
  },
  paymentLabel: { color: '#fff', fontSize: 15 },
  changeText: { color: '#635BFF', fontSize: 14 },
  addMethodButton: {
    borderWidth: 1,
    borderColor: '#635BFF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  addMethodText: { color: '#635BFF', fontSize: 14, fontWeight: '600' },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
