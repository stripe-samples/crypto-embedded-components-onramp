/**
 * WalletScreen - developer backend prepares the remittance wallet.
 *
 * The app does not create Privy users, create wallets, or configure delegation.
 * It asks the developer backend for a remittance wallet, registers that address
 * with the Link-authenticated Onramp user, and then uses the returned address
 * as the Stripe Onramp destination.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import type { Onramp } from '@stripe/stripe-react-native';
import { RootStackParamList } from '../types';
import { useOnramp } from '../hooks/useOnramp';
import { prepareRemittanceWallet } from '../api/client';
import { DEFAULT_DEMO_NETWORK_NAME } from '../constants';
import { useTransfer } from '../context/TransferContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Wallet'>;
  route: RouteProp<RootStackParamList, 'Wallet'>;
};

type SetupStage = 'idle' | 'creating_wallet' | 'registering_wallet' | 'ready';

export default function WalletScreen({ navigation, route }: Props) {
  const { customerId, authToken } = route.params;
  const { transfer } = useTransfer();
  const { registerWalletAddress } = useOnramp();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<SetupStage>('idle');
  const routeNetworkName = DEFAULT_DEMO_NETWORK_NAME;

  const prepareWallet = async () => {
    setBusy(true);
    setStage('creating_wallet');
    try {
      const result = await prepareRemittanceWallet(authToken);
      if (!result.success) {
        setStage('idle');
        Alert.alert('Wallet setup failed', result.error.message);
        return;
      }

      setStage('registering_wallet');
      const registration = await registerWalletAddress(
        result.data.walletAddress,
        result.data.network as Onramp.CryptoNetwork,
      );
      if (registration?.error) {
        setStage('idle');
        Alert.alert('Wallet registration failed', registration.error.message);
        return;
      }

      setStage('ready');
      navigation.replace('PaymentMethod', {
        customerId,
        authToken,
        walletAddress: result.data.walletAddress,
        network: result.data.network,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Authorize this transfer</Text>
      <Text style={styles.subtitle}>
        The developer app needs your consent to use its wallet-backed remittance flow for this transfer.
      </Text>

      <View style={styles.summaryCard}>
        <Text style={styles.cardLabel}>Transfer</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryAmount}>${transfer.amountUsd || '0'} USD</Text>
          <Text style={styles.summaryArrow}>→</Text>
          <View style={styles.summaryRecipient}>
            <Text style={styles.summaryRecipientName}>{transfer.recipientName}</Text>
            <Text style={styles.summaryRecipientDetail}>{transfer.recipientDestination}</Text>
          </View>
        </View>
        <Text style={styles.summaryRoute}>Delivered through USDC on {routeNetworkName}</Text>
      </View>

      <View style={styles.consentPanel}>
        <Text style={styles.consentTitle}>What you authorize</Text>
        <Text style={styles.consentText}>
          The developer app may create or reuse a Privy wallet for you, receive USDC from Stripe
          Onramp on {routeNetworkName}, and move those funds to complete this remittance.
        </Text>
        <Text style={styles.consentFinePrint}>
          The wallet is created for you. The developer app handles the remittance flow and
          uses delegated authority only for the payout handoff described here.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        disabled={busy}
        onPress={prepareWallet}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Authorize and continue</Text>}
      </TouchableOpacity>

      {busy ? <Text style={styles.loadingText}>{stage === 'registering_wallet' ? 'Connecting Stripe delivery...' : 'Preparing transfer...'}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#999', lineHeight: 20, marginBottom: 20 },
  summaryCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  cardLabel: { color: '#777', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryAmount: { color: '#fff', fontSize: 20, fontWeight: '800' },
  summaryArrow: { color: '#666', fontSize: 20, fontWeight: '800', marginHorizontal: 12 },
  summaryRecipient: { flex: 1 },
  summaryRecipientName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  summaryRecipientDetail: { color: '#888', fontSize: 12, marginTop: 3 },
  summaryRoute: { color: '#9dbfff', fontSize: 13, fontWeight: '700', marginTop: 14 },
  consentPanel: {
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  consentTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  consentText: { color: '#aaa', fontSize: 13, lineHeight: 19 },
  consentFinePrint: { color: '#777', fontSize: 12, lineHeight: 17, marginTop: 10 },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 17,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  loadingText: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 2 },
});
