import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { getRemittance, triggerRemittanceTransfer, RemittanceResponse } from '../api/client';
import { DEMO_PAYOUT_PARTNER, NETWORK_NAMES } from '../constants';
import { useTransfer } from '../context/TransferContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Success'>;
  route: RouteProp<RootStackParamList, 'Success'>;
};

type TrackerStatus = 'complete' | 'active' | 'ready' | 'waiting' | 'failed';

type TrackerStep = {
  title: string;
  body: string;
  status: TrackerStatus;
};

function shorten(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function statusLabel(status: TrackerStatus): string {
  switch (status) {
    case 'complete':
      return 'Done';
    case 'active':
      return 'In progress';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Needs attention';
    case 'waiting':
      return 'Waiting';
  }
}

function statusStyle(status: TrackerStatus) {
  switch (status) {
    case 'complete':
      return styles.stepMarkerComplete;
    case 'active':
      return styles.stepMarkerActive;
    case 'ready':
      return styles.stepMarkerReady;
    case 'failed':
      return styles.stepMarkerFailed;
    case 'waiting':
      return styles.stepMarkerWaiting;
  }
}

function statusTextStyle(status: TrackerStatus) {
  switch (status) {
    case 'complete':
      return styles.stepStatusComplete;
    case 'active':
      return styles.stepStatusActive;
    case 'ready':
      return styles.stepStatusReady;
    case 'failed':
      return styles.stepStatusFailed;
    case 'waiting':
      return styles.stepStatusWaiting;
  }
}

function TrackerRow({ step, isLast }: { step: TrackerStep; isLast: boolean }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepRail}>
        <View style={[styles.stepMarker, statusStyle(step.status)]}>
          {step.status === 'active' ? <ActivityIndicator color="#fff" size="small" /> : null}
          {step.status === 'complete' ? <Text style={styles.stepMarkerText}>✓</Text> : null}
          {step.status === 'ready' ? <Text style={styles.stepMarkerText}>•</Text> : null}
          {step.status === 'failed' ? <Text style={styles.stepMarkerText}>!</Text> : null}
        </View>
        {!isLast ? <View style={styles.stepLine} /> : null}
      </View>
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Text style={styles.stepTitle}>{step.title}</Text>
          <Text style={[styles.stepStatus, statusTextStyle(step.status)]}>{statusLabel(step.status)}</Text>
        </View>
        <Text style={styles.stepBody}>{step.body}</Text>
      </View>
    </View>
  );
}

export default function SuccessScreen({ navigation, route }: Props) {
  const {
    transactionId, destinationAmount, destinationCurrency,
    customerId, authToken, walletAddress, network, remittanceId,
    onrampDestinationAmount,
  } = route.params;

  const canStartAnotherTransfer = !!(customerId && authToken);
  const { transfer } = useTransfer();
  const networkName = network ? NETWORK_NAMES[network] ?? network : 'the configured network';
  const destinationCurrencyLabel = (destinationCurrency ?? 'usdc').toUpperCase();
  const [loadingRemittance, setLoadingRemittance] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [remittance, setRemittance] = useState<RemittanceResponse | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const transferAttemptedRef = useRef(false);
  const transferInFlightRef = useRef(false);

  const isOnrampFulfilled = remittance?.status === 'onramp_fulfilled'
    || remittance?.status === 'transfer_submitted'
    || remittance?.status === 'transfer_failed';
  const transferSubmitted = remittance?.status === 'transfer_submitted';
  const transferFailed = remittance?.status === 'transfer_failed';
  const isHoldMode = transfer.payoutMode === 'hold_in_wallet';
  const canManuallySendToPayout = !!(
    isHoldMode &&
    remittance?.status === 'onramp_fulfilled' &&
    destinationCurrency === 'usdc' &&
    onrampDestinationAmount &&
    authToken &&
    remittanceId
  );

  const pollRemittance = useCallback(async (showAlert = true) => {
    if (!remittanceId || !authToken) return;
    setLoadingRemittance(true);
    try {
      const res = await getRemittance(remittanceId, authToken);
      if (res.success) {
        setRemittance(res.data);
        setPollingError(null);
      } else {
        setPollingError(res.error.message);
        if (showAlert) Alert.alert('Transfer status unavailable', res.error.message);
      }
    } finally {
      setLoadingRemittance(false);
    }
  }, [authToken, remittanceId]);

  const runTransfer = useCallback(async (showAlert = false) => {
    if (!remittanceId || !authToken || !onrampDestinationAmount || !destinationCurrency) return;
    if (transferInFlightRef.current) return;
    transferInFlightRef.current = true;
    setTransferring(true);
    try {
      const res = await triggerRemittanceTransfer({
        remittanceId,
        authToken,
        amount: onrampDestinationAmount,
        currency: destinationCurrency,
      });
      if (res.success) {
        setRemittance(res.data);
        setPollingError(null);
      } else {
        setPollingError(res.error.message);
        if (showAlert) Alert.alert('Payout handoff failed', res.error.message);
      }
    } finally {
      transferInFlightRef.current = false;
      setTransferring(false);
    }
  }, [authToken, destinationCurrency, onrampDestinationAmount, remittanceId]);

  const shouldAutoPoll = !!(
    remittanceId &&
    authToken &&
    (!remittance || remittance.status === 'onramp_session_created')
  );

  useEffect(() => {
    if (!shouldAutoPoll) return;

    pollRemittance(false);
    const interval = setInterval(() => {
      pollRemittance(false);
    }, 4000);

    return () => clearInterval(interval);
  }, [pollRemittance, shouldAutoPoll]);

  useEffect(() => {
    if (
      isOnrampFulfilled &&
      remittance?.status === 'onramp_fulfilled' &&
      destinationCurrency === 'usdc' &&
      transfer.payoutMode === 'auto_send_to_payout' &&
      !transferAttemptedRef.current
    ) {
      transferAttemptedRef.current = true;
      runTransfer(false);
    }
  }, [destinationCurrency, isOnrampFulfilled, remittance?.status, runTransfer, transfer.payoutMode]);

  const amountText = destinationAmount && destinationCurrency
    ? `${destinationAmount} ${destinationCurrencyLabel}`
    : `${destinationCurrencyLabel}`;

  const trackerSteps: TrackerStep[] = [
    {
      title: 'Payment completed',
      body: 'Stripe accepted the USD payment for this transfer.',
      status: 'complete',
    },
    {
      title: `Delivering ${destinationCurrencyLabel}`,
      body: `Stripe Onramp is delivering ${destinationCurrencyLabel} to the sender's Privy wallet on ${networkName}.`,
      status: isOnrampFulfilled ? 'complete' : 'active',
    },
    {
      title: `${destinationCurrencyLabel} arrived on ${networkName}`,
      body: 'Funds are in the user-owned Privy wallet prepared for this remittance.',
      status: isOnrampFulfilled ? 'complete' : 'waiting',
    },
    {
      title: isHoldMode && isOnrampFulfilled && !transferSubmitted && !transferFailed
        ? 'Held in wallet'
        : 'Sending to payout partner',
      body: isHoldMode && isOnrampFulfilled && !transferSubmitted && !transferFailed
        ? `USDC is in the Privy wallet. The sender can send it to ${DEMO_PAYOUT_PARTNER} when ready.`
        : `The developer backend uses delegated wallet authority to send funds to ${DEMO_PAYOUT_PARTNER}.`,
      status: transferFailed
        ? 'failed'
        : transferSubmitted
          ? 'complete'
          : transferring
            ? 'active'
            : isHoldMode && isOnrampFulfilled
              ? 'ready'
              : 'waiting',
    },
    {
      title: 'Ready for local payout',
      body: `${DEMO_PAYOUT_PARTNER} can complete the recipient payout outside this demo.`,
      status: transferSubmitted ? 'complete' : transferFailed ? 'failed' : 'waiting',
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Transfer tracker</Text>
      <Text style={styles.title}>
        {transferSubmitted
          ? 'Payout handoff submitted'
          : transferFailed
            ? 'Payout handoff needs attention'
            : isOnrampFulfilled
              ? isHoldMode
                ? `${destinationCurrencyLabel} held in wallet`
                : `${destinationCurrencyLabel} delivered`
              : 'Transfer in progress'}
      </Text>
      <Text style={styles.subtitle}>
        {isHoldMode && isOnrampFulfilled && !transferSubmitted
          ? `${amountText} for ${transfer.recipientName} is in the Privy wallet. Send it to payout when ready.`
          : `${amountText} for ${transfer.recipientName} moves through USDC on ${networkName} before the developer app hands it to its payout partner.`}
      </Text>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Recipient</Text>
          <Text style={styles.summaryValue}>{transfer.recipientName}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Destination</Text>
          <Text style={styles.summaryValue}>{transfer.recipientDestination}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Intermediary</Text>
          <Text style={styles.summaryValue}>{destinationCurrencyLabel} on {networkName}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Payout</Text>
          <Text style={styles.summaryValue}>{DEMO_PAYOUT_PARTNER}</Text>
        </View>
      </View>

      <View style={styles.trackerCard}>
        {trackerSteps.map((step, index) => (
          <TrackerRow key={step.title} step={step} isLast={index === trackerSteps.length - 1} />
        ))}
      </View>

      {canManuallySendToPayout ? (
        <View style={styles.manualCard}>
          <Text style={styles.manualTitle}>Ready when you are</Text>
          <Text style={styles.manualBody}>
            Funds are in the Privy wallet. Send them to the payout partner to continue this transfer.
          </Text>
          <TouchableOpacity
            style={[styles.buttonPrimary, transferring && styles.buttonDisabled]}
            onPress={() => runTransfer(true)}
            disabled={transferring}
          >
            {transferring ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send to payout partner</Text>}
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.detailCard}>
        <TouchableOpacity
          style={styles.detailHeader}
          onPress={() => setDetailsExpanded(value => !value)}
          activeOpacity={0.8}
        >
          <Text style={styles.detailTitle}>Technical details</Text>
          <Text style={styles.detailToggle}>{detailsExpanded ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
        {detailsExpanded ? (
          <>
            {walletAddress ? <Text style={styles.detailMono}>Wallet: {shorten(walletAddress)}</Text> : null}
            {remittance ? <Text style={styles.detailMono}>Remittance: {remittance.id}</Text> : null}
            {remittance?.stripeStatus ? <Text style={styles.detailMono}>Stripe status: {remittance.stripeStatus}</Text> : null}
            {transactionId ? <Text style={styles.detailMono}>Transaction: {transactionId}</Text> : null}
            {remittance?.transferHash ? <Text style={styles.detailMono}>Payout tx: {remittance.transferHash}</Text> : null}
          </>
        ) : null}
        {remittance?.error ? <Text style={styles.errorText}>{remittance.error}</Text> : null}
        {pollingError ? <Text style={styles.errorText}>{pollingError}</Text> : null}

        <View style={styles.detailActions}>
          <TouchableOpacity
            style={styles.smallButtonSecondary}
            onPress={() => pollRemittance(true)}
            disabled={!remittanceId || loadingRemittance}
          >
            {loadingRemittance ? <ActivityIndicator color="#aaa" /> : <Text style={styles.smallButtonSecondaryText}>Refresh</Text>}
          </TouchableOpacity>
          {transferFailed ? (
            <TouchableOpacity
              style={[styles.smallButtonPrimary, transferring && styles.buttonDisabled]}
              onPress={() => runTransfer(true)}
              disabled={transferring}
            >
              {transferring ? <ActivityIndicator color="#fff" /> : <Text style={styles.smallButtonText}>Retry payout</Text>}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        {canStartAnotherTransfer && (
          <TouchableOpacity
            style={styles.buttonPrimary}
            onPress={() => navigation.navigate('TransferSetup')}
          >
            <Text style={styles.buttonText}>Start another transfer</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={canStartAnotherTransfer ? styles.buttonSecondary : styles.buttonPrimary}
          onPress={() => navigation.popToTop()}
        >
          <Text style={canStartAnotherTransfer ? styles.buttonSecondaryText : styles.buttonText}>
            Back to start
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 32,
  },
  kicker: {
    color: '#8db8ff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 10,
  },
  subtitle: {
    color: '#aaa',
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 18,
  },
  summaryCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  summaryLabel: { color: '#777', fontSize: 13 },
  summaryValue: { color: '#fff', fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  trackerCard: {
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  stepRow: { flexDirection: 'row' },
  stepRail: { width: 34, alignItems: 'center' },
  stepMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  stepMarkerComplete: { backgroundColor: '#15803d', borderColor: '#22c55e' },
  stepMarkerActive: { backgroundColor: '#635BFF', borderColor: '#8b85ff' },
  stepMarkerReady: { backgroundColor: '#1d4ed8', borderColor: '#60a5fa' },
  stepMarkerWaiting: { backgroundColor: '#242424', borderColor: '#3a3a3a' },
  stepMarkerFailed: { backgroundColor: '#7f1d1d', borderColor: '#ef4444' },
  stepMarkerText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  stepLine: {
    width: 2,
    flex: 1,
    minHeight: 46,
    backgroundColor: '#303030',
  },
  stepContent: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 18,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepTitle: { color: '#fff', fontSize: 15, fontWeight: '800', flex: 1 },
  stepStatus: { fontSize: 12, fontWeight: '800' },
  stepStatusComplete: { color: '#22c55e' },
  stepStatusActive: { color: '#9b96ff' },
  stepStatusReady: { color: '#93c5fd' },
  stepStatusWaiting: { color: '#777' },
  stepStatusFailed: { color: '#ef4444' },
  stepBody: { color: '#aaa', fontSize: 13, lineHeight: 18, marginTop: 5 },
  manualCard: {
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  manualTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 6 },
  manualBody: { color: '#aaa', fontSize: 13, lineHeight: 19, marginBottom: 14 },
  detailCard: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#242424',
    borderRadius: 10,
    padding: 14,
    marginBottom: 18,
  },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailTitle: { color: '#aaa', fontSize: 14, fontWeight: '800' },
  detailToggle: { color: '#8b85ff', fontSize: 13, fontWeight: '800' },
  detailMono: { color: '#888', fontSize: 11, fontFamily: 'Courier', marginTop: 4 },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  smallButtonPrimary: {
    flex: 1,
    backgroundColor: '#635BFF',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  smallButtonSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#333',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  smallButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  smallButtonSecondaryText: { color: '#aaa', fontSize: 13, fontWeight: '700' },
  errorText: { color: '#ef4444', fontSize: 12, marginTop: 8, lineHeight: 17 },
  actions: {
    gap: 12,
  },
  buttonDisabled: { opacity: 0.55 },
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
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonSecondaryText: { color: '#aaa', fontSize: 16, fontWeight: '700' },
});
