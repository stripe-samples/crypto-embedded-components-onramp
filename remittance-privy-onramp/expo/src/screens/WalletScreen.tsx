/**
 * WalletScreen - the user authorizes wallet setup for this remittance.
 *
 * The app creates or reuses the user's Privy embedded wallet through the client SDK, adds
 * the backend signer/policy the user consents to, and attaches that wallet to
 * the backend. Stripe Onramp wallet registration happens later, after Link
 * authorizes the payment customer.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import {
  useEmbeddedEthereumWallet,
  usePrivy,
  useSigners,
  type LinkedAccount,
  type User as PrivyUser,
} from '@privy-io/expo';
import { RootStackParamList } from '../types';
import { attachRemittanceWallet } from '../api/client';
import {
  DEFAULT_DEMO_NETWORK,
  DEFAULT_DEMO_NETWORK_NAME,
  PRIVY_WALLET_POLICY_IDS,
  PRIVY_WALLET_SIGNER_ID,
} from '../constants';
import { useTransfer } from '../context/TransferContext';
import { useSettings } from '../context/SettingsContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Wallet'>;
  route: RouteProp<RootStackParamList, 'Wallet'>;
};

type SetupStage = 'idle' | 'creating_wallet' | 'authorizing_wallet' | 'attaching_wallet' | 'ready';

type EthereumEmbeddedWalletAccount = LinkedAccount & {
  type: 'wallet';
  chain_type: 'ethereum';
  connector_type: 'embedded';
  id: string;
  address: string;
};

function isEthereumEmbeddedWallet(account: LinkedAccount): account is EthereumEmbeddedWalletAccount {
  return (
    account.type === 'wallet' &&
    account.chain_type === 'ethereum' &&
    'connector_type' in account &&
    account.connector_type === 'embedded' &&
    'id' in account &&
    typeof account.id === 'string' &&
    Boolean(account.address)
  );
}

function findEmbeddedWalletAccount(
  user: PrivyUser | null | undefined,
  address: string,
): EthereumEmbeddedWalletAccount | undefined {
  const normalizedAddress = address.toLowerCase();
  return user?.linked_accounts
    .filter(isEthereumEmbeddedWallet)
    .find(account => account.address.toLowerCase() === normalizedAddress);
}

function isDuplicateSignerError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.toLowerCase().includes('duplicate signer');
}

function truncateAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

export default function WalletScreen({ navigation, route }: Props) {
  const { authToken } = route.params;
  const { transfer } = useTransfer();
  const { settings } = useSettings();
  const { user: privyUser } = usePrivy();
  const { wallets, create } = useEmbeddedEthereumWallet();
  const { addSigners } = useSigners();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<SetupStage>('idle');
  const routeNetworkName = DEFAULT_DEMO_NETWORK_NAME;

  const prepareWallet = async () => {
    setBusy(true);
    setStage('creating_wallet');
    try {
      if (!privyUser) {
        setStage('idle');
        Alert.alert('Wallet setup failed', 'Sign in with Privy before authorizing the transfer.');
        return;
      }
      if (!PRIVY_WALLET_SIGNER_ID) {
        setStage('idle');
        Alert.alert('Wallet setup failed', 'EXPO_PUBLIC_PRIVY_WALLET_SIGNER_ID is not set.');
        return;
      }

      let walletAddress = wallets[0]?.address;
      let userWithWallet = privyUser;
      if (!walletAddress) {
        const created = await create();
        userWithWallet = created.user;
        walletAddress = created.user.linked_accounts.filter(isEthereumEmbeddedWallet)[0]?.address;
      }
      if (!walletAddress) {
        setStage('idle');
        Alert.alert('Wallet setup failed', 'Privy did not return an embedded Ethereum wallet.');
        return;
      }

      setStage('authorizing_wallet');
      try {
        await addSigners({
          address: walletAddress,
          signers: [{
            signerId: PRIVY_WALLET_SIGNER_ID,
            policyIds: PRIVY_WALLET_POLICY_IDS,
          }],
        });
      } catch (err: unknown) {
        if (!isDuplicateSignerError(err)) {
          throw err;
        }
      }

      const walletAccount = findEmbeddedWalletAccount(userWithWallet, walletAddress)
        ?? findEmbeddedWalletAccount(privyUser, walletAddress);
      if (!walletAccount?.id) {
        setStage('idle');
        Alert.alert('Wallet setup failed', 'Could not determine the Privy wallet ID.');
        return;
      }

      setStage('attaching_wallet');
      const result = await attachRemittanceWallet(authToken, {
        walletAddress,
        privyUserId: userWithWallet.id,
        privyWalletId: walletAccount.id,
        network: DEFAULT_DEMO_NETWORK,
      });
      if (!result.success) {
        setStage('idle');
        Alert.alert('Wallet setup failed', result.error.message);
        return;
      }

      setStage('ready');
      navigation.replace('PaymentMethod', {
        authToken,
        walletAddress: result.data.walletAddress,
        network: result.data.network,
      });
    } catch (err: unknown) {
      setStage('idle');
      Alert.alert('Wallet setup failed', err instanceof Error ? err.message : String(err));
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
        <Text style={styles.summaryPayout}>
          Payout wallet {truncateAddress(settings.payoutDestinationAddress)}
        </Text>
      </View>

      <View style={styles.consentPanel}>
        <Text style={styles.consentTitle}>What you authorize</Text>
        <Text style={styles.consentText}>
          The developer app may create or reuse your Privy wallet, receive USDC from Stripe
          Onramp on {routeNetworkName}, and move those funds to complete this remittance.
        </Text>
        <Text style={styles.consentFinePrint}>
          The wallet is yours. The developer app handles the remittance flow and uses delegated
          authority only for the payout handoff described here.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        disabled={busy}
        onPress={prepareWallet}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Authorize and continue</Text>}
      </TouchableOpacity>

      {busy ? <Text style={styles.loadingText}>{
        stage === 'authorizing_wallet'
          ? 'Adding delegated payout authority...'
          : stage === 'attaching_wallet'
            ? 'Saving wallet for this transfer...'
            : 'Preparing your wallet...'
      }</Text> : null}
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
  summaryPayout: { color: '#888', fontSize: 12, marginTop: 7 },
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
