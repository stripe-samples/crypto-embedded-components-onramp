import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { Onramp, useOnramp } from '@stripe/stripe-react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { getCustomerWallets } from '../api/client';

const NETWORKS: { label: string; value: Onramp.CryptoNetwork }[] = [
  { label: 'Ethereum', value: Onramp.CryptoNetwork.ethereum },
  { label: 'Bitcoin', value: Onramp.CryptoNetwork.bitcoin },
  { label: 'Solana', value: Onramp.CryptoNetwork.solana },
  { label: 'Base', value: Onramp.CryptoNetwork.base },
];

type ExistingWallet = { id: string; network: string; wallet_address: string };

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Wallet'>;
  route: RouteProp<RootStackParamList, 'Wallet'>;
};

export default function WalletScreen({ navigation, route }: Props) {
  const { customerId, authToken } = route.params;
  const [existingWallets, setExistingWallets] = useState<ExistingWallet[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(true);
  const [selectedWallet, setSelectedWallet] = useState<ExistingWallet | null>(null);
  const [showAddNew, setShowAddNew] = useState(false);
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState<Onramp.CryptoNetwork>(Onramp.CryptoNetwork.ethereum);
  const [registering, setRegistering] = useState(false);

  const { registerWalletAddress } = useOnramp();

  useEffect(() => {
    (async () => {
      const res = await getCustomerWallets(customerId, authToken);
      if (res.success && res.data.data.length > 0) {
        setExistingWallets(res.data.data);
      } else {
        setShowAddNew(true);
      }
      setLoadingWallets(false);
    })();
  }, [customerId, authToken]);

  const handleUseExisting = () => {
    if (!selectedWallet) return;
    navigation.navigate('PaymentMethod', {
      customerId,
      authToken,
      walletAddress: selectedWallet.wallet_address,
      network: selectedWallet.network,
    });
  };

  const handleRegister = async () => {
    if (!address.trim()) {
      Alert.alert('Error', 'Please enter a wallet address.');
      return;
    }
    setRegistering(true);
    try {
      const result = await registerWalletAddress(address.trim(), network);
      if (result?.error) {
        Alert.alert('Error', result.error.message);
        return;
      }
      navigation.navigate('PaymentMethod', {
        customerId,
        authToken,
        walletAddress: address.trim(),
        network,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setRegistering(false);
    }
  };

  const shortenAddress = (addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : addr;

  if (loadingWallets) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#635BFF" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {existingWallets.length > 0 && !showAddNew && (
        <>
          <Text style={styles.title}>Your wallets</Text>
          <Text style={styles.subtitle}>Select a wallet or add a new one</Text>

          {existingWallets.map(w => (
            <TouchableOpacity
              key={w.id}
              style={[styles.walletCard, selectedWallet?.id === w.id && styles.walletCardSelected]}
              onPress={() => setSelectedWallet(w)}
            >
              <View style={styles.walletInfo}>
                <Text style={styles.walletNetwork}>{w.network}</Text>
                <Text style={styles.walletAddress}>{shortenAddress(w.wallet_address)}</Text>
              </View>
              <View style={[styles.radio, selectedWallet?.id === w.id && styles.radioSelected]}>
                {selectedWallet?.id === w.id && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.button, !selectedWallet && styles.buttonDisabled]}
            onPress={handleUseExisting}
            disabled={!selectedWallet}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.addNewLink} onPress={() => setShowAddNew(true)}>
            <Text style={styles.addNewText}>+ Add a new wallet</Text>
          </TouchableOpacity>
        </>
      )}

      {(showAddNew || existingWallets.length === 0) && (
        <>
          <Text style={styles.title}>Add a new wallet</Text>
          <Text style={styles.subtitle}>Your crypto will be sent to this wallet address</Text>

          <Text style={styles.label}>Network</Text>
          <View style={styles.networkRow}>
            {NETWORKS.map(n => (
              <TouchableOpacity
                key={n.value}
                style={[styles.chip, network === n.value && styles.chipSelected]}
                onPress={() => setNetwork(n.value)}
              >
                <Text style={[styles.chipText, network === n.value && styles.chipTextSelected]}>
                  {n.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Wallet Address</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="0x... or bc1..."
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[styles.button, registering && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={registering}
          >
            {registering ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Add Wallet</Text>}
          </TouchableOpacity>

          {existingWallets.length > 0 && (
            <TouchableOpacity style={styles.addNewLink} onPress={() => setShowAddNew(false)}>
              <Text style={styles.addNewText}>Use existing wallet</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 },
  center: { justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 24 },
  label: { color: '#aaa', fontSize: 13, marginBottom: 8 },
  networkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
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
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
  },
  walletCardSelected: { borderColor: '#635BFF' },
  walletInfo: { flex: 1 },
  walletNetwork: { color: '#aaa', fontSize: 12, textTransform: 'capitalize', marginBottom: 4 },
  walletAddress: { color: '#fff', fontSize: 15, fontFamily: 'Courier' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#555',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  radioSelected: { borderColor: '#635BFF' },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#635BFF' },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  addNewLink: { alignItems: 'center', marginTop: 16 },
  addNewText: { color: '#635BFF', fontSize: 14, fontWeight: '600' },
});
