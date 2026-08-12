import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { DEFAULT_DEMO_NETWORK_NAME, MERCHANT_DISPLAY_NAME } from '../constants';
import { PayoutMode, useTransfer } from '../context/TransferContext';
import { useSettings } from '../context/SettingsContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

function isEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export default function HomeScreen({ navigation }: Props) {
  const { transfer, updateTransfer } = useTransfer();
  const { settings } = useSettings();

  const setPayoutMode = (payoutMode: PayoutMode) => updateTransfer({ payoutMode });

  const openSettings = (continueToAuth = false) => {
    navigation.navigate('PayoutSettings', { continueToAuth });
  };

  const startTransfer = () => {
    if (!isEvmAddress(settings.payoutDestinationAddress)) {
      openSettings(true);
      return;
    }
    navigation.navigate('Auth');
  };

  return (
    <View style={styles.container}>
      <View style={styles.landingToolbar}>
        <Text style={styles.brand}>{MERCHANT_DISPLAY_NAME}</Text>
        <TouchableOpacity onPress={() => openSettings()} style={styles.settingsButton}>
          <Text style={styles.settingsButtonText}>Demo settings</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>Send money across borders</Text>
      <Text style={styles.subtitle}>
        A simplified remittance demo powered by Stripe Onramp, Privy wallets,
        USDC, and {DEFAULT_DEMO_NETWORK_NAME}.
      </Text>

      <View style={styles.valueCard}>
        <Text style={styles.valueTitle}>What this shows</Text>
        <Text style={styles.valueText}>A sender pays in USD.</Text>
        <Text style={styles.valueText}>Stripe delivers USDC on {DEFAULT_DEMO_NETWORK_NAME}.</Text>
        <Text style={styles.valueText}>The developer app either holds funds in wallet or sends them to payout.</Text>
      </View>

      <View style={styles.modeCard}>
        <Text style={styles.modeTitle}>Demo flow</Text>
        <View style={styles.modeOptions}>
          <ModeOption
            title="Hold in wallet"
            body="USDC stays in the Privy wallet until the sender sends it to payout."
            selected={transfer.payoutMode === 'hold_in_wallet'}
            onPress={() => setPayoutMode('hold_in_wallet')}
          />
          <ModeOption
            title="Auto send to payout"
            body="After Stripe delivery, the developer backend automatically sends funds to its payout partner."
            selected={transfer.payoutMode === 'auto_send_to_payout'}
            onPress={() => setPayoutMode('auto_send_to_payout')}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.button} onPress={startTransfer}>
        <Text style={styles.buttonText}>Start demo transfer</Text>
      </TouchableOpacity>
    </View>
  );
}

function ModeOption({
  title,
  body,
  selected,
  onPress,
}: {
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.modeOption, selected && styles.modeOptionSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <View style={styles.modeCopy}>
        <Text style={styles.modeOptionTitle}>{title}</Text>
        <Text style={styles.modeOptionBody}>{body}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  landingToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  brand: { color: '#8db8ff', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  settingsButton: { minHeight: 40, justifyContent: 'center' },
  settingsButtonText: { color: '#b8c1d1', fontSize: 13, fontWeight: '700' },
  title: { color: '#fff', fontSize: 40, fontWeight: '800', lineHeight: 46, marginBottom: 12 },
  subtitle: { color: '#aaa', fontSize: 16, lineHeight: 23, marginBottom: 28 },
  valueCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    padding: 16,
    marginBottom: 28,
  },
  valueTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 12 },
  valueText: { color: '#cfcfcf', fontSize: 14, lineHeight: 21, marginBottom: 6 },
  modeCard: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#242424',
    borderRadius: 10,
    padding: 16,
    marginBottom: 24,
  },
  modeTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 12 },
  modeOptions: { gap: 10 },
  modeOption: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#171717',
  },
  modeOptionSelected: { borderColor: '#635BFF', backgroundColor: '#18172a' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#555',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  radioSelected: { borderColor: '#8b85ff' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#8b85ff' },
  modeCopy: { flex: 1 },
  modeOptionTitle: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  modeOptionBody: { color: '#aaa', fontSize: 12, lineHeight: 17 },
  button: { backgroundColor: '#635BFF', paddingVertical: 17, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
