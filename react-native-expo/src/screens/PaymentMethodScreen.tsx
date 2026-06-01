/**
 * PaymentMethodScreen — select amount, destination currency, and payment card.
 *
 * This screen is the hub of the progressive KYC demonstration. It sits at the
 * intersection of KYC verification status, transaction limits, and session
 * creation, and orchestrates the step-up loop when the user needs a higher tier.
 *
 * ─── Recommended screen order and per-screen operations ─────────────────────
 *
 *  1. AuthScreen / RegisterScreen
 *       Operation : Link sign-in or account creation
 *       Produces  : customerId, authToken
 *       Next      : KYCPrimerScreen
 *
 *  2. KYCPrimerScreen
 *       Operation : Show what information will be collected (consent screen)
 *       API calls : none
 *       Next      : KYCScreen
 *
 *  3. KYCScreen
 *       Operation : Collect first name, last name
 *                   L1/L2: also collect SSN and date of birth
 *       API calls : none (data is held in navigation params)
 *       Next      : AddressScreen
 *
 *  4. AddressScreen
 *       Operation : Collect home address
 *       API calls : attachKycInfo({ firstName, lastName, address [, idNumber, dob] })
 *                   L2 only: verifyIdentity() — captures government ID + selfie
 *       Next      : WalletScreen
 *
 *  5. WalletScreen
 *       Operation : Select or register the destination crypto wallet
 *       API calls : getCustomerWallets() to list saved wallets
 *                   registerWalletAddress() when adding a new wallet
 *       Next      : PaymentMethodScreen (this screen)
 *
 *  6. PaymentMethodScreen  ◄── you are here
 *       Operation : Select amount, destination currency, and payment card
 *       API calls : getCryptoCustomer()         — fetch kycTiers; poll if pending
 *                   getTransactionLimits()       — get limit for verified tier
 *                   collectPaymentMethod()       — Stripe UI to pick/add a card
 *                   createCryptoPaymentToken()   — tokenise the selected card
 *       Decision  :
 *         • Verification pending   → poll getCryptoCustomer() every 3 s (button disabled)
 *         • Verification rejected  → "Re-enter KYC Data" → back to KYC screen
 *         • Amount within limit    → createOnrampSession() → CheckoutScreen
 *         • Amount exceeds limit   → "Collect More KYC Data" → step-up loop ↓
 *
 * ─── Step-up loop (repeats until amount fits within the verified tier's limit) ──
 *
 *  7. KYCStepUpScreen
 *       Operation : Collect only the incremental fields needed for the next tier
 *                   L0 → L1: attachKycInfo({ idNumber, dateOfBirth })
 *                   L1 → L2: verifyIdentity()
 *       API calls : attachKycInfo() and/or verifyIdentity()
 *       Next      : PaymentMethodScreen (with payment params pre-filled)
 *                   PaymentMethodScreen fetches fresh kycTiers, detects 'pending',
 *                   and polls until the new tier resolves.
 *
 *  8. PaymentMethodScreen (same screen, new instance)
 *       Operation : Re-check limits for the newly verified tier
 *       API calls : getCryptoCustomer() (poll), getTransactionLimits()
 *       Decision  :
 *         • Amount still exceeds new tier's limit → go to step 7 again (L1→L2)
 *         • Amount now within limit → createOnrampSession() → CheckoutScreen
 *
 * ─── Checkout ────────────────────────────────────────────────────────────────
 *
 *  9. CheckoutScreen
 *       Operation : Display quote and fees; user confirms
 *       API calls : refreshQuote(), checkoutSession() (server-side for client_secret)
 *                   performCheckout() — Stripe SDK completes the transaction
 *       Next      : SuccessScreen
 *
 * 10. SuccessScreen
 *       Operation : Show confirmation
 *       Options   : "New Purchase" → back to PaymentMethodScreen (skips auth + KYC)
 *                   "Start Over"   → back to HomeScreen
 *
 * ─── Starting tier ───────────────────────────────────────────────────────────
 *
 * The demo Settings screen lets you choose the starting KYC tier:
 *
 *   L0 : Initial collection = name + address only.
 *        Step-up to L1 (SSN+DOB) and L2 (ID doc) triggered from this screen.
 *
 *   L1 : Initial collection = name + address + SSN + DOB.
 *        Step-up to L2 (ID doc) triggered from this screen if needed.
 *
 *   L2 : Initial collection = name + address + SSN + DOB + ID doc + selfie.
 *        No further step-up available; highest limit applies from the start.
 *
 * ─── Proactive limit check ───────────────────────────────────────────────────
 *
 * This screen uses a proactive limit check rather than attempting session
 * creation and reacting to KYC error codes. Proactive checking is recommended
 * because it lets the user see their remaining capacity before entering payment
 * details, and avoids creating a session that immediately fails.
 *
 *   getTransactionLimits() params: wallet_address, destination_network
 *   Response: limits in cents — divide by 100 for dollar comparison
 *   Alternative: src/kycLimits.ts provides hardcoded tiers for offline testing
 *
 * See: https://docs.stripe.com/crypto/onramp/kyc-integration-guide
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import {
  createOnrampSession, getTransactionLimits, getCryptoCustomer,
  KycTierEntry, deriveCurrentTier,
} from '../api/client';
import { CURRENCIES_BY_NETWORK } from '../constants';
import { useSettings } from '../context/SettingsContext';
import { LOCAL_LIMITS, TransactionLimits } from '../kycLimits';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PaymentMethod'>;
  route: RouteProp<RootStackParamList, 'PaymentMethod'>;
};

export default function PaymentMethodScreen({ navigation, route }: Props) {
  const {
    customerId, authToken, walletAddress, network,
    // Optional — passed back from KYCStepUpScreen after a step-up so the user
    // does not need to re-enter their amount or re-add their card.
    paymentToken: routePaymentToken,
    paymentLabel: routePaymentLabel,
    sourceAmount: routeSourceAmount,
    destinationCurrency: routeDestCurrency,
  } = route.params;

  const availableCurrencies = CURRENCIES_BY_NETWORK[network] ?? ['eth'];
  const [sourceAmount, setSourceAmount] = useState(routeSourceAmount ?? '10');
  const [destCurrency, setDestCurrency] = useState(routeDestCurrency ?? availableCurrencies[0]);

  // Pre-populate payment method if returning from a step-up verification.
  const [paymentReady, setPaymentReady] = useState(!!routePaymentToken);
  const [paymentLabel, setPaymentLabel] = useState(routePaymentLabel ?? '');
  const [cryptoPaymentToken, setCryptoPaymentToken] = useState(routePaymentToken ?? '');
  const [collectingMethod, setCollectingMethod] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [steppingUp, setSteppingUp] = useState(false);

  // KYC tiers — fetched on mount and refreshed by the polling loop.
  const [kycTiers, setKycTiers] = useState<KycTierEntry[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(true);

  // True while we are polling getCryptoCustomer() waiting for a pending
  // verification to resolve. Set to true when a pending tier is detected on
  // mount or after returning from KYCStepUp; cleared when the tier resolves.
  const [verifyingKyc, setVerifyingKyc] = useState(false);
  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transaction limits — loaded when the screen mounts.
  const [limits, setLimits] = useState<TransactionLimits | null>(null);
  const [loadingLimits, setLoadingLimits] = useState(true);
  const [limitsError, setLimitsError] = useState<string | null>(null);

  const { collectPaymentMethod, createCryptoPaymentToken } = useOnramp();
  const { settings } = useSettings();

  // Derived from live kycTiers state — updates on initial fetch and on every
  // poll tick. Used to select the correct local limit tier and as a dependency
  // so the limits effect re-runs whenever the customer's tier changes.
  const currentTier = loadingTiers ? null : deriveCurrentTier(kycTiers);

  // ---------------------------------------------------------------------------
  // Mount / unmount lifecycle
  // ---------------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Load KYC tiers on mount; start polling if a tier is still pending
  //
  // This runs on initial load AND when returning from KYCStepUpScreen (new
  // navigation instance with fresh route params). When the current tier's
  // verification_status is 'pending', we start polling getCryptoCustomer()
  // every 3 s until the status resolves to 'verified' or 'rejected'.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    (async () => {
      setLoadingTiers(true);
      const result = await getCryptoCustomer(customerId, authToken);
      if (!mountedRef.current) return;
      if (result.success) {
        const tiers = result.data.kycTiers ?? [];
        setKycTiers(tiers);
        // Start the polling loop if the current tier is awaiting review.
        const tierKey = deriveCurrentTier(tiers).toLowerCase() as 'l0' | 'l1' | 'l2';
        const entry = tiers.find(t => t.tier === tierKey);
        if (entry?.verification_status === 'pending') startPolling();
      }
      setLoadingTiers(false);
    })();
  }, [customerId, authToken]);

  // ---------------------------------------------------------------------------
  // Load transaction limits
  //
  // Depends on currentTier so it re-runs when the customer's tier changes —
  // either on initial load or after returning from a KYC step-up.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Wait until tiers are resolved so we don't show limits for the wrong tier.
    if (currentTier === null) return;

    (async () => {
      setLoadingLimits(true);
      setLimitsError(null);
      try {
        if (settings.limitSource === 'api') {
          // Fetch live limits from Stripe. The API uses the customer's auth token
          // to return limits for their current verified tier server-side.
          // Stripe API: GET /v1/crypto/onramp_transaction_limits
          // Response: { limits: { "usd.fiat": { card: [{ limit, settlement_speed }] } } }
          const result = await getTransactionLimits(authToken, {
            walletAddress,
            destinationNetwork: network,
          });
          if (result.success) {
            const cardLimits = result.data.limits?.['usd.fiat']?.card ?? [];
            const instantEntry =
              cardLimits.find(l => l.settlement_speed === 'instant') ?? cardLimits[0];
            // API returns the limit in cents — convert to dollars for display
            // and comparison against the user-entered amount (which is in dollars).
            setLimits({ limit: (instantEntry?.limit ?? 0) / 100 });
          } else {
            setLimitsError('Could not fetch limits from API');
          }
        } else {
          // Look up the hardcoded limit for the customer's current verified tier.
          // Uses currentTier (derived from live kycTiers) — not settings.kycTier,
          // which is just the demo configuration and doesn't reflect step-ups.
          setLimits(LOCAL_LIMITS[currentTier]);
        }
      } catch (err: any) {
        setLimitsError(err.message);
      } finally {
        setLoadingLimits(false);
      }
    })();
  }, [authToken, walletAddress, network, settings.limitSource, currentTier]);

  // ---------------------------------------------------------------------------
  // KYC verification polling
  //
  // Imperative poll loop — started when a pending tier is detected and
  // self-terminates when the tier resolves. Runs every 3 s.
  // ---------------------------------------------------------------------------

  const startPolling = () => {
    if (pollTimerRef.current) return; // Already running

    setVerifyingKyc(true);

    const doPoll = async () => {
      if (!mountedRef.current) return;
      const result = await getCryptoCustomer(customerId, authToken);
      if (!mountedRef.current) return;

      if (result.success) {
        const tiers = result.data.kycTiers ?? [];
        setKycTiers(tiers);
        const tierKey = deriveCurrentTier(tiers).toLowerCase() as 'l0' | 'l1' | 'l2';
        const entry = tiers.find(t => t.tier === tierKey);
        if (entry?.verification_status === 'pending') {
          // Still pending — schedule next poll.
          pollTimerRef.current = setTimeout(doPoll, 3000);
        } else {
          // Resolved (verified or rejected) — stop.
          pollTimerRef.current = null;
          setVerifyingKyc(false);
        }
      } else {
        // Transient error — keep polling.
        pollTimerRef.current = setTimeout(doPoll, 3000);
      }
    };

    pollTimerRef.current = setTimeout(doPoll, 3000);
  };

  // ---------------------------------------------------------------------------
  // Re-enter KYC after rejection
  //
  // Routes the user back to the appropriate collection screen based on which
  // tier was rejected:
  //   l0 rejected → KYCPrimer (initial onboarding: re-collect name + address)
  //   l1 rejected → KYCStepUp (collect_ssn_dob: re-collect SSN + DOB only)
  //   l2 rejected → KYCStepUp (verify_identity: re-do document capture)
  // ---------------------------------------------------------------------------

  const handleReenterKyc = () => {
    const rejectedEntry = kycTiers.find(t => t.verification_status === 'rejected');
    if (!rejectedEntry) return;

    if (rejectedEntry.tier === 'l0') {
      navigation.navigate('KYCPrimer', { customerId, authToken });
      return;
    }

    // Step-up re-entry: map the rejected tier to the correct error code and
    // the tier the user was at before submitting the rejected step-up data.
    const errorCode = rejectedEntry.tier === 'l2'
      ? 'crypto_onramp_missing_document_verification'    // L2 rejected → redo verifyIdentity
      : 'crypto_onramp_missing_identity_verification';   // L1 rejected → re-collect SSN+DOB

    const fromTier = rejectedEntry.tier === 'l2' ? 'L1' : 'L0';

    navigation.navigate('KYCStepUp', {
      customerId, authToken,
      errorCode,
      currentTier: fromTier,
      walletAddress, network,
      sourceAmount, sourceCurrency: 'usd',
      destinationCurrency: destCurrency,
      paymentToken: cryptoPaymentToken,
      paymentLabel,
    });
  };

  // ---------------------------------------------------------------------------
  // Payment method collection
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // KYC step-up
  //
  // Called when the entered amount exceeds the customer's current tier limit.
  // Determines the next tier's required verification and routes accordingly:
  //
  //   Current tier L0 → step up to L1: collect SSN + date of birth
  //   Current tier L1 → step up to L2: capture ID document + selfie
  //   Current tier L2 → already at max tier, cannot step up further
  // ---------------------------------------------------------------------------

  const handleStepUp = async () => {
    setSteppingUp(true);
    try {
      // Fetch fresh kyc_tiers so the current tier reflects any recent changes.
      const customerResult = await getCryptoCustomer(customerId, authToken);
      const freshTiers = customerResult.success ? (customerResult.data.kycTiers ?? []) : kycTiers;
      if (customerResult.success) setKycTiers(freshTiers);

      const currentTier = deriveCurrentTier(freshTiers);

      if (currentTier === 'L2') {
        // L2 is the highest tier — no further step-up is available.
        Alert.alert(
          'Maximum Tier Reached',
          'You have completed the highest level of identity verification. Please reduce your transaction amount.',
        );
        return;
      }

      // Map current tier to the error code KYCStepUpScreen uses to determine
      // which fields to collect.
      const nextErrorCode = currentTier === 'L1'
        ? 'crypto_onramp_missing_document_verification'   // L1 → L2
        : 'crypto_onramp_missing_identity_verification';  // L0 → L1

      navigation.navigate('KYCStepUp', {
        customerId, authToken,
        errorCode: nextErrorCode,
        currentTier,
        walletAddress, network, sourceAmount, sourceCurrency: 'usd',
        destinationCurrency: destCurrency, paymentToken: cryptoPaymentToken, paymentLabel,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSteppingUp(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Proceed to checkout
  // ---------------------------------------------------------------------------

  const handleProceed = async () => {
    // Verification rejected — re-enter KYC data before anything else.
    if (isKycRejected) {
      handleReenterKyc();
      return;
    }

    const amount = parseFloat(sourceAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }

    // Amount exceeds the current tier's limit — route to KYC step-up instead
    // of attempting session creation which would fail with a KYC error.
    if (exceedsLimit) {
      await handleStepUp();
      return;
    }

    // Amount is within the limit — create the session and proceed to checkout.
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

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const amountNum = parseFloat(sourceAmount) || 0;
  const exceedsLimit = limits !== null && amountNum > limits.limit;
  const busy = creatingSession || steppingUp;

  // KYC status derived from live kycTiers state.
  const currentTierKey = currentTier?.toLowerCase() as 'l0' | 'l1' | 'l2' | undefined;
  const currentTierEntry = currentTierKey ? kycTiers.find(t => t.tier === currentTierKey) : undefined;
  const currentTierStatus = currentTierEntry?.verification_status;

  // True while tiers are loading or polling — button is disabled in this state.
  const isKycPending = loadingTiers || verifyingKyc;
  // True when the current tier's review came back rejected.
  const isKycRejected = !isKycPending && currentTierStatus === 'rejected';

  // Button label and style depend on KYC status and whether amount exceeds limit.
  const buttonLabel = isKycPending
    ? 'Verifying identity…'
    : isKycRejected
      ? 'Re-enter KYC Data'
      : exceedsLimit
        ? 'Collect More KYC Data'
        : 'Review Purchase';

  const buttonStyleBase = isKycRejected
    ? styles.buttonReenter
    : exceedsLimit
      ? styles.buttonStepUp
      : styles.button;

  // Payment method required for all flows except re-entering KYC after rejection.
  const buttonDisabled = isKycPending || busy || (!isKycRejected && !paymentReady);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Add a payment method</Text>

      {/* Amount input */}
      <Text style={styles.label}>Amount (USD)</Text>
      <TextInput
        style={[styles.input, exceedsLimit && styles.inputWarning]}
        value={sourceAmount}
        onChangeText={setSourceAmount}
        keyboardType="decimal-pad"
        placeholder="10"
        placeholderTextColor="#555"
      />

      {/* KYC tier status card
          Shows the customer's current KYC tier and per-tier verification
          status. Updates live while polling during a pending review. */}
      <View style={[styles.tierCard, isKycRejected && styles.tierCardRejected]}>
        <View style={styles.tierCardHeader}>
          <Text style={styles.tierCardTitle}>KYC Verification</Text>
          {isKycPending
            ? <ActivityIndicator color="#635BFF" size="small" />
            : <Text style={[styles.tierBadge, isKycRejected && styles.tierBadgeRejected]}>
                {isKycRejected ? 'Rejected' : `Current: ${currentTier}`}
              </Text>
          }
        </View>
        {!loadingTiers && (
          <View style={styles.tierRows}>
            {(['l0', 'l1', 'l2'] as const).map(tier => {
              const entry = kycTiers.find(t => t.tier === tier);
              const status = entry?.verification_status ?? 'not_started';
              const statusColor =
                status === 'verified' ? '#22c55e' :
                status === 'pending'  ? '#f0a500' :
                status === 'rejected' ? '#ef4444' : '#444';
              return (
                <View key={tier} style={styles.tierRow}>
                  <Text style={styles.tierLabel}>{tier.toUpperCase()}</Text>
                  <Text style={[styles.tierStatus, { color: statusColor }]}>{status}</Text>
                </View>
              );
            })}
          </View>
        )}
        {verifyingKyc && (
          <Text style={styles.tierPollingHint}>
            Polling <Text style={styles.tierPollingMono}>getCryptoCustomer()</Text> every 3 s…
          </Text>
        )}
        {isKycRejected && (
          <Text style={styles.tierRejectedHint}>
            One or more verifications failed. Tap below to re-enter your information.
          </Text>
        )}
      </View>

      {/* Transaction limits card
          Shows the customer's limit for the current tier. When the entered
          amount exceeds it, a warning prompts the user to complete a KYC
          step-up to unlock a higher limit. The primary button changes to
          "Collect More KYC Data" so the intent is immediately clear. */}
      <View style={[styles.limitsCard, exceedsLimit && styles.limitsCardWarning]}>
        <View style={styles.limitsHeader}>
          <Text style={styles.limitsTitle}>Transaction Limits</Text>
          <Text style={styles.limitsSource}>
            {settings.limitSource === 'api'
              ? '🔵 Live API'
              : `📋 Local (${currentTier ?? '…'})`}
          </Text>
        </View>

        {loadingLimits && (
          <ActivityIndicator color="#635BFF" size="small" style={{ marginVertical: 6 }} />
        )}

        {limitsError && !loadingLimits && (
          <Text style={styles.limitsErrorText}>{limitsError}</Text>
        )}

        {limits && !loadingLimits && (
          <>
            <View style={styles.limitsRow}>
              <Text style={styles.limitsLabel}>Card limit (instant)</Text>
              <Text style={[styles.limitsValue, exceedsLimit && styles.limitsValueWarning]}>
                ${limits.limit.toFixed(2)}
              </Text>
            </View>

            {exceedsLimit && (
              <View style={styles.warningRow}>
                <Text style={styles.warningText}>
                  Amount exceeds your current tier's limit. Completing additional
                  identity verification will unlock higher limits.
                </Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Destination currency */}
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

      {/* Payment method */}
      <Text style={styles.label}>Payment Method</Text>

      {paymentReady ? (
        <View style={styles.paymentCard}>
          <Text style={styles.paymentLabel}>{paymentLabel}</Text>
          <TouchableOpacity
            onPress={() => {
              setPaymentReady(false);
              setCryptoPaymentToken('');
            }}
          >
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.addMethodButton, collectingMethod && styles.buttonDisabled]}
          onPress={handleCollectPaymentMethod}
          disabled={collectingMethod}
        >
          {collectingMethod
            ? <ActivityIndicator color="#635BFF" />
            : <Text style={styles.addMethodText}>Select or Add Payment Method</Text>}
        </TouchableOpacity>
      )}

      {/* Primary action button — label and style reflect live KYC status:
          - Pending verification:  "Verifying identity…" (disabled, spinner)
          - Rejected verification: "Re-enter KYC Data"   → back to KYC screen
          - Verified + over limit: "Collect More KYC Data" → step-up flow
          - Verified + ok:         "Review Purchase" → create session → Checkout */}
      <TouchableOpacity
        style={[buttonStyleBase, buttonDisabled && styles.buttonDisabled]}
        onPress={handleProceed}
        disabled={buttonDisabled}
      >
        {(busy || isKycPending)
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>{buttonLabel}</Text>}
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
    marginBottom: 12,
  },
  inputWarning: { borderColor: '#ff6b35' },

  // KYC tier card
  tierCard: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  tierCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tierCardTitle: { color: '#666', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tierBadge: {
    color: '#635BFF',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#635BFF',
  },
  tierRows: { gap: 4 },
  tierRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  tierLabel: { color: '#555', fontSize: 13 },
  tierStatus: { fontSize: 13, fontWeight: '500' },

  // Limits card
  limitsCard: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  limitsCardWarning: { borderColor: '#5a2010' },
  limitsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  limitsTitle: { color: '#666', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  limitsSource: { color: '#444', fontSize: 11 },
  limitsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  limitsLabel: { color: '#555', fontSize: 13 },
  limitsValue: { color: '#888', fontSize: 13, fontWeight: '500' },
  limitsValueWarning: { color: '#ff6b35', fontWeight: '700' },
  limitsErrorText: { color: '#888', fontSize: 12, fontStyle: 'italic' },
  warningRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2a1a14',
  },
  warningText: { color: '#cc5533', fontSize: 12, lineHeight: 17 },

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
  buttonStepUp: {
    backgroundColor: '#c2410c',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonReenter: {
    backgroundColor: '#7f1d1d',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // KYC tier card — rejection state
  tierCardRejected: { borderColor: '#5a0e0e' },
  tierBadgeRejected: {
    color: '#ef4444',
    backgroundColor: '#1a0505',
    borderColor: '#ef4444',
  },
  tierPollingHint: {
    color: '#444',
    fontSize: 11,
    marginTop: 10,
    textAlign: 'center',
  },
  tierPollingMono: { fontFamily: 'monospace', color: '#555' },
  tierRejectedHint: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 10,
    lineHeight: 17,
  },
});
