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
  const { transactionId, destinationAmount, destinationCurrency } = route.params;

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
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.popToTop()}
      >
        <Text style={styles.buttonText}>Buy More</Text>
      </TouchableOpacity>
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
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
