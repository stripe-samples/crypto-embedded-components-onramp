import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { X } from 'lucide-react-native';
import { DEFAULT_DEMO_NETWORK_NAME } from '../constants';
import { useSettings } from '../context/SettingsContext';
import { RootStackParamList } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PayoutSettings'>;
  route: RouteProp<RootStackParamList, 'PayoutSettings'>;
};

function isEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export default function PayoutSettingsScreen({ navigation, route }: Props) {
  const { settings, updateSettings } = useSettings();
  const [draftAddress, setDraftAddress] = useState(settings.payoutDestinationAddress);
  const [showAddressError, setShowAddressError] = useState(false);

  const saveSettings = async () => {
    if (!isEvmAddress(draftAddress)) {
      setShowAddressError(true);
      return;
    }

    await updateSettings({ payoutDestinationAddress: draftAddress.trim() });
    if (route.params.continueToAuth) {
      navigation.replace('Auth');
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.kicker}>Demo configuration</Text>
          <Text style={styles.title}>Payout destination</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Close demo settings"
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
        >
          <X color="#b8c1d1" size={22} />
        </TouchableOpacity>
      </View>
      <Text style={styles.description}>
        After Stripe delivers USDC to the sender wallet, the demo sends it to this address.
      </Text>
      <Text style={styles.networkSummary}>
        Network <Text style={styles.networkValue}>{DEFAULT_DEMO_NETWORK_NAME}</Text>
      </Text>
      <Text style={styles.inputLabel}>Payout wallet address</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={value => {
          setDraftAddress(value);
          setShowAddressError(false);
        }}
        placeholder="0x..."
        placeholderTextColor="#666"
        spellCheck={false}
        style={[styles.input, showAddressError && !isEvmAddress(draftAddress) && styles.inputError]}
        value={draftAddress}
      />
      <Text style={showAddressError && !isEvmAddress(draftAddress) ? styles.errorText : styles.helpText}>
        {showAddressError && !isEvmAddress(draftAddress)
          ? 'Enter a valid EVM wallet address.'
          : 'The address must be allowed by the configured Privy policy.'}
      </Text>
      <TouchableOpacity style={styles.button} onPress={() => void saveSettings()}>
        <Text style={styles.buttonText}>Save settings</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: '#141414', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  heading: { flex: 1 },
  kicker: { color: '#8db8ff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 25, fontWeight: '800', marginTop: 5 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  description: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 18 },
  networkSummary: { color: '#888', fontSize: 14, marginBottom: 18 },
  networkValue: { color: '#fff', fontSize: 14, fontWeight: '700' },
  inputLabel: { color: '#cbd3e1', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 10,
    backgroundColor: '#101010',
    color: '#fff',
    paddingHorizontal: 14,
    fontSize: 15,
  },
  inputError: { borderColor: '#ff6b6b' },
  helpText: { color: '#777', fontSize: 12, lineHeight: 17, marginTop: 8, marginBottom: 18 },
  errorText: { color: '#ff6b6b', fontSize: 12, lineHeight: 17, marginTop: 8, marginBottom: 18 },
  button: { backgroundColor: '#635BFF', paddingVertical: 17, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
