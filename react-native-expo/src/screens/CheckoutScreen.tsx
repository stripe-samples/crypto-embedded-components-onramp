import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
  ScrollView,
} from 'react-native';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { refreshQuote, checkoutSession, QuoteResponse } from '../api/client';
import { CURRENCY_NAMES, NETWORK_NAMES, SERVICE_TIMEOUT_ERROR } from '../constants';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Checkout'>;
  route: RouteProp<RootStackParamList, 'Checkout'>;
};

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}····${addr.slice(-4)}`;
}

function formatCurrency(amount: string | number, currency: string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (currency === 'usd') return `$${num.toFixed(2)}`;
  return `${num} ${currency.toUpperCase()}`;
}

export default function CheckoutScreen({ navigation, route }: Props) {
  const {
    authToken, walletAddress, network, sessionId,
    sourceAmount, sourceCurrency, destinationCurrency, paymentLabel,
  } = route.params;

  const [checking, setChecking] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [quote, setQuote] = useState<QuoteResponse['transaction_details'] | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [feesExpanded, setFeesExpanded] = useState(false);
  const [quoteRefreshDisabled, setQuoteRefreshDisabled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { performCheckout } = useOnramp();

  const destCurrencyUpper = destinationCurrency.toUpperCase();
  const currencyName = CURRENCY_NAMES[destinationCurrency] ?? destCurrencyUpper;
  const networkName = NETWORK_NAMES[network] ?? network;

  const fetchQuote = useCallback(async () => {
    if (quoteRefreshDisabled) return;
    setLoadingQuote(true);
    try {
      const res = await refreshQuote(sessionId, authToken);
      if (res.success) {
        setQuote(res.data.transaction_details);
        const expiresAt = res.data.transaction_details.quote_expiration;
        const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        setCountdown(remaining);
      } else {
        if (res.error.message?.includes('locked state')) {
          setQuoteRefreshDisabled(true);
        }
        console.warn('[checkout] refresh quote failed:', res.error.message);
      }
    } catch (err: any) {
      console.warn('[checkout] refresh quote error:', err.message);
    } finally {
      setLoadingQuote(false);
    }
  }, [sessionId, authToken, quoteRefreshDisabled]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  useEffect(() => {
    if (countdown <= 0 || quoteRefreshDisabled) return;
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          fetchQuote();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [countdown, fetchQuote, quoteRefreshDisabled]);

  const exchangeRate = quote
    ? (parseFloat(sourceAmount) / parseFloat(quote.destination_amount)).toFixed(2)
    : null;

  const runCheckout = async () => {
    setChecking(true);
    setQuoteRefreshDisabled(true);

    try {
      const result = await performCheckout(sessionId, async () => {
        const res = await checkoutSession(sessionId, authToken);
        if (!res.success) throw new Error(res.error.message);
        return res.data.client_secret;
      });

      if (result?.error?.code === 'Canceled') {
        setChecking(false);
        setQuoteRefreshDisabled(false);
        return;
      }

      if (result?.error) {
        Alert.alert('Checkout Failed', SERVICE_TIMEOUT_ERROR);
        setChecking(false);
        setQuoteRefreshDisabled(false);
        return;
      }

      navigation.replace('Success', {
        destinationAmount: quote?.destination_amount,
        destinationCurrency,
      });
    } catch {
      Alert.alert('Checkout Failed', SERVICE_TIMEOUT_ERROR);
      setChecking(false);
      setQuoteRefreshDisabled(false);
    }
  };

  const destAmount = quote?.destination_amount ?? '—';
  const networkFee = parseFloat(quote?.fees?.network_fee_amount ?? '0');
  const transactionFee = parseFloat(quote?.fees?.transaction_fee_amount ?? '0');
  const totalFees = networkFee + transactionFee;
  const total = parseFloat(quote?.source_amount ?? sourceAmount) + totalFees;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        Buy {destAmount} {destCurrencyUpper} ({currencyName})
      </Text>

      {/* Summary card */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.rowLabel}>Send to</Text>
          <View style={styles.rowValueCol}>
            <Text style={styles.rowValue}>{networkName} wallet</Text>
            <Text style={styles.rowValueSub}>{truncateAddress(walletAddress)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardRow}>
          <Text style={styles.rowLabel}>Pay with</Text>
          <Text style={styles.rowValue}>{paymentLabel}</Text>
        </View>
      </View>

      {/* Quote details */}
      <View style={styles.quoteSection}>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Receive</Text>
          <Text style={styles.quoteValue}>{destAmount} {destCurrencyUpper}</Text>
        </View>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteSub}>
            {loadingQuote
              ? 'Updating price...'
              : countdown > 0
                ? `Price updates in ${countdown}s`
                : 'Refreshing...'}
          </Text>
          {exchangeRate && (
            <Text style={styles.quoteSub}>
              1 {destCurrencyUpper} = ${exchangeRate}
            </Text>
          )}
        </View>

        <View style={styles.quoteDivider} />

        <TouchableOpacity
          style={styles.quoteRow}
          onPress={() => setFeesExpanded(!feesExpanded)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.quoteLabel}>Fees</Text>
            <Text style={styles.chevron}>{feesExpanded ? ' ▴' : ' ▾'}</Text>
          </View>
          <Text style={styles.quoteValue}>{formatCurrency(totalFees, sourceCurrency)}</Text>
        </TouchableOpacity>
        {feesExpanded && (
          <>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteSub}>Network fee</Text>
              <Text style={styles.quoteSub}>{formatCurrency(networkFee, sourceCurrency)}</Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteSub}>Transaction fee</Text>
              <Text style={styles.quoteSub}>{formatCurrency(transactionFee, sourceCurrency)}</Text>
            </View>
          </>
        )}

        <View style={styles.quoteDivider} />

        <View style={styles.quoteRow}>
          <Text style={[styles.quoteLabel, styles.totalLabel]}>Total</Text>
          <Text style={[styles.quoteValue, styles.totalValue]}>
            {formatCurrency(total, sourceCurrency)}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, (checking || loadingQuote) && styles.buttonDisabled]}
        onPress={runCheckout}
        disabled={checking || loadingQuote}
      >
        {checking
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Confirm & Buy</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 24 },

  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 20,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowLabel: { color: '#888', fontSize: 14, width: 80 },
  rowValueCol: { flex: 1, alignItems: 'flex-end' },
  rowValue: { color: '#fff', fontSize: 15, fontWeight: '500' },
  rowValueSub: { color: '#888', fontSize: 13, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#2a2a2a', marginVertical: 8 },

  quoteSection: { marginBottom: 28 },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  quoteLabel: { color: '#ccc', fontSize: 15, fontWeight: '500' },
  quoteValue: { color: '#fff', fontSize: 15, fontWeight: '600' },
  quoteSub: { color: '#888', fontSize: 13, marginTop: 2 },
  quoteDivider: { height: 1, backgroundColor: '#1a1a1a', marginVertical: 10 },
  chevron: { color: '#888', fontSize: 12 },
  totalLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },
  totalValue: { color: '#fff', fontWeight: '700', fontSize: 16 },

  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
