import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Success'>;
  route: RouteProp<RootStackParamList, 'Success'>;
};

export default function SuccessScreen({ navigation, route }: Props) {
  const {
    transactionId, destinationAmount, destinationCurrency,
    customerId, authToken, walletAddress, network,
  } = route.params;

  const canBuyAgain = !!(customerId && authToken && walletAddress && network);

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>✓</Text>
      <Text style={styles.title}>Purchase Complete</Text>
      {destinationAmount && destinationCurrency ? (
        <Text style={styles.amount}>
          {destinationAmount} {destinationCurrency.toUpperCase()} sent to your wallet
        </Text>
      ) : null}
      {transactionId ? (
        <Text style={styles.txId} numberOfLines={1} ellipsizeMode="middle">
          Tx: {transactionId}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {canBuyAgain && (
          <TouchableOpacity
            style={styles.buttonPrimary}
            onPress={() =>
              navigation.navigate('PaymentMethod', {
                customerId: customerId!,
                authToken: authToken!,
                walletAddress: walletAddress!,
                network: network!,
              })
            }
          >
            <Text style={styles.buttonText}>New Purchase</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={canBuyAgain ? styles.buttonSecondary : styles.buttonPrimary}
          onPress={() => navigation.popToTop()}
        >
          <Text style={canBuyAgain ? styles.buttonSecondaryText : styles.buttonText}>
            Start Over
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  icon: {
    fontSize: 64,
    color: '#00C853',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  amount: {
    fontSize: 18,
    color: '#aaa',
    marginBottom: 8,
    textAlign: 'center',
  },
  txId: {
    fontSize: 12,
    color: '#555',
    marginBottom: 40,
    paddingHorizontal: 16,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  buttonPrimary: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: '#333',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSecondaryText: { color: '#888', fontSize: 16, fontWeight: '600' },
});
