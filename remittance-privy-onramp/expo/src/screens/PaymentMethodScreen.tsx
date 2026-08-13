/**
 * PaymentMethodScreen — select transfer amount, intermediary asset, and payment card.
 *
 * This screen is the hub of the progressive KYC demonstration. It sits at the
 * intersection of KYC verification status, transaction limits, and session
 * creation, and orchestrates the step-up loop when the user needs a higher tier.
 *
 * ─── Recommended screen order and per-screen operations ─────────────────────
 *
 *  1. AuthScreen
 *       Operation : Privy app sign-in
 *       Next      : TransferSetupScreen
 *
 *  2. TransferSetupScreen
 *       Operation : Collect transfer amount and recipient details
 *       Produces  : authToken (Privy access token)
 *       Next      : WalletScreen
 *
 *  3. WalletScreen
 *       Operation : Create/reuse the user's Privy wallet and add delegated signer
 *       API calls : attachRemittanceWallet()
 *       Next      : PaymentMethodScreen
 *
 *  4. PaymentMethodScreen
 *       Operation : Link sign-in or account creation, Stripe wallet registration
 *       API calls : createAuthIntent(), saveUser(), getOnrampCustomer()
 *       Decision  : route to KYCPrimerScreen only if initial KYC is needed,
 *                   otherwise show payment method selection
 *       Produces  : customerId
 *       Next      : KYCPrimerScreen, or payment method selection on this screen
 *
 *  5. KYCPrimerScreen
 *       Operation : Show what information will be collected (consent screen)
 *       API calls : none
 *       Next      : KYCScreen
 *
 *  6. KYCScreen
 *       Operation : Collect first name, last name
 *                   L1/L2: also collect SSN and date of birth
 *       API calls : none (data is held in navigation params)
 *       Next      : AddressScreen
 *
 *  7. AddressScreen
 *       Operation : Collect home address
 *       API calls : attachKycInfo({ firstName, lastName, address [, idNumber, dob] })
 *                   L2 only: verifyIdentity() — captures government ID + selfie
 *       Next      : PaymentMethodScreen
 *
 *  8. PaymentMethodScreen  ◄── you are here
 *       Operation : Select amount, destination currency, and payment card
 *       API calls : getOnrampCustomer()        — fetch kycTiers; poll if pending
 *                   getTransactionLimits()       — get limit for verified tier
 *                   collectPaymentMethod()       — Stripe UI to pick/add a card
 *                   createCryptoPaymentToken()   — tokenise the selected card
 *       Decision  :
 *         • Verification pending   → poll getOnrampCustomer() every 3 s (button disabled)
 *         • Verification rejected  → "Re-enter identity details" → back to identity screen
 *         • Amount within limit    → createRemittance() → CheckoutScreen
 *         • Amount exceeds limit   → "Verify more information" → step-up loop
 *
 * ─── Step-up loop (repeats until amount fits within the verified tier's limit) ──
 *
 *  9. KYCStepUpScreen
 *       Operation : Collect only the incremental fields needed for the next tier
 *                   L0 → L1: attachKycInfo({ idNumber, dateOfBirth })
 *                   L1 → L2: verifyIdentity()
 *       API calls : attachKycInfo() and/or verifyIdentity()
 *       Next      : PaymentMethodScreen (with payment params pre-filled)
 *                   PaymentMethodScreen fetches fresh kycTiers, detects 'pending',
 *                   and polls until the new tier resolves.
 *
 * 10. PaymentMethodScreen (same screen, new instance)
 *       Operation : Re-check limits for the newly verified tier
 *       API calls : getOnrampCustomer() (poll), getTransactionLimits()
 *       Decision  :
 *         • Amount still exceeds new tier's limit → go to step 7 again (L1→L2)
 *         • Amount now within limit → createRemittance() → CheckoutScreen
 *
 * ─── Checkout ────────────────────────────────────────────────────────────────
 *
 * 11. CheckoutScreen
 *       Operation : Display quote and fees; user confirms
 *       API calls : refreshQuote(), checkoutSession() (server-side for client_secret)
 *                   performCheckout() — Stripe SDK completes the transaction
 *       Next      : SuccessScreen
 *
 * 12. SuccessScreen
 *       Operation : Show transfer tracker
 *       Options   : "Start another transfer" → back to TransferSetupScreen (skips auth + identity)
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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, TextInput, Linking,
} from 'react-native';
import type { Onramp } from '@stripe/stripe-react-native';
import { usePrivy, type User as PrivyUser } from '@privy-io/expo';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import {
  createRemittance, getTransactionLimits, getOnrampCustomer,
  KycTierEntry, deriveCurrentTier, createAuthIntent, saveUser,
} from '../api/client';
import { CURRENCIES_BY_NETWORK, MERCHANT_DISPLAY_NAME } from '../constants';
import { useSettings } from '../context/SettingsContext';
import { useTransfer } from '../context/TransferContext';
import { LOCAL_LIMITS, TransactionLimits } from '../kycLimits';
import { errorMessage } from '../errors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PaymentMethod'>;
  route: RouteProp<RootStackParamList, 'PaymentMethod'>;
};

function getPrivyEmail(user: PrivyUser | null | undefined) {
  const account = user?.linked_accounts.find(linkedAccount => linkedAccount.type === 'email');
  return account?.type === 'email' ? account.address : undefined;
}

export default function PaymentMethodScreen({ navigation, route }: Props) {
  const {
    customerId: routeCustomerId, authToken, walletAddress, network,
    kycSubmitted,
    // Optional — passed back from KYCStepUpScreen after a step-up so the user
    // does not need to re-enter their amount or re-add their card.
    paymentToken: routePaymentToken,
    paymentLabel: routePaymentLabel,
    sourceAmount: routeSourceAmount,
    destinationCurrency: routeDestCurrency,
  } = route.params;

  const availableCurrencies = CURRENCIES_BY_NETWORK[network] ?? ['usdc'];
  const initialDestCurrency = routeDestCurrency && availableCurrencies.includes(routeDestCurrency)
    ? routeDestCurrency
    : availableCurrencies[0];
  const { transfer } = useTransfer();
  const [sourceAmount, setSourceAmount] = useState(routeSourceAmount ?? transfer.amountUsd);
  const [destCurrency, setDestCurrency] = useState(initialDestCurrency);
  const [customerId, setCustomerId] = useState(routeCustomerId ?? '');
  const [walletRegistered, setWalletRegistered] = useState(false);
  const [needsNewLinkAccount, setNeedsNewLinkAccount] = useState(false);
  const [phone, setPhone] = useState('+1');
  const [preparingPayment, setPreparingPayment] = useState(false);

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

  // True while we are polling getOnrampCustomer() waiting for a pending
  // verification to resolve. Set to true when a pending tier is detected on
  // mount or after returning from KYCStepUp; cleared when the tier resolves.
  const [verifyingKyc, setVerifyingKyc] = useState(false);
  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transaction limits — loaded when the screen mounts.
  const [limits, setLimits] = useState<TransactionLimits | null>(null);
  const [loadingLimits, setLoadingLimits] = useState(true);
  const [limitsError, setLimitsError] = useState<string | null>(null);

  const {
    collectPaymentMethod,
    createCryptoPaymentToken,
    configure,
    hasLinkAccount,
    registerLinkUser,
    authorize,
    registerWalletAddress,
  } = useOnramp();
  const { user: privyUser } = usePrivy();
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
  // Sync route.params into local state when navigated back from KYCStepUpScreen.
  //
  // useState initializers only run on first mount. When KYCStepUpScreen calls
  // navigation.navigate('PaymentMethod', updatedParams) it pops itself and
  // returns to this screen, updating route.params — but not re-running useState.
  // These effects detect param changes and push them into local state.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (routePaymentToken) {
      setCryptoPaymentToken(routePaymentToken);
      setPaymentLabel(routePaymentLabel ?? '');
      setPaymentReady(true);
    }
  }, [routePaymentToken, routePaymentLabel]);

  useEffect(() => {
    if (routeSourceAmount) setSourceAmount(routeSourceAmount);
  }, [routeSourceAmount]);

  useEffect(() => {
    if (routeDestCurrency) setDestCurrency(routeDestCurrency);
  }, [routeDestCurrency]);

  useEffect(() => {
    if (routeCustomerId) setCustomerId(routeCustomerId);
  }, [routeCustomerId]);

  // ---------------------------------------------------------------------------
  // KYC verification polling
  //
  // Imperative poll loop — started when a pending tier is detected and
  // self-terminates when the tier resolves. Runs every 3 s.
  // ---------------------------------------------------------------------------

  const startPolling = useCallback(() => {
    if (!customerId) return;
    if (pollTimerRef.current) return; // Already running

    setVerifyingKyc(true);

    const doPoll = async () => {
      if (!mountedRef.current) return;
      const result = await getOnrampCustomer(customerId, authToken);
      if (!mountedRef.current) return;

      if (result.success) {
        const tiers = result.data.kycTiers ?? [];
        setKycTiers(tiers);
        const tierKey = deriveCurrentTier(tiers);
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
  }, [customerId, authToken]);

  // ---------------------------------------------------------------------------
  // Load KYC tiers on focus; start polling if a tier is still pending
  //
  // useFocusEffect runs both on initial mount and whenever the screen regains
  // focus (e.g. after returning from KYCStepUpScreen). This ensures we always
  // see the latest verification status after a step-up, without needing a
  // second PaymentMethod instance on the navigation stack.
  //
  // When the current tier's verification_status is 'pending', we start polling
  // getOnrampCustomer() every 3 s until the status resolves.
  // ---------------------------------------------------------------------------

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      if (!customerId || !walletRegistered) {
        setLoadingTiers(false);
        setVerifyingKyc(false);
        return () => {
          cancelled = true;
        };
      }

      // Cancel any stale polling timer from a previous focus session.
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      (async () => {
        setLoadingTiers(true);
        const result = await getOnrampCustomer(customerId, authToken);
        if (cancelled || !mountedRef.current) return;
        if (result.success) {
          const tiers = result.data.kycTiers ?? [];
          setKycTiers(tiers);
          const tierKey = deriveCurrentTier(tiers);
          const entry = tiers.find(t => t.tier === tierKey);
          if (entry?.verification_status === 'pending') {
            startPolling();
          } else {
            // Tier resolved (or was never pending) — clear any leftover polling state.
            setVerifyingKyc(false);
          }
        }
        setLoadingTiers(false);
      })();

      return () => {
        cancelled = true;
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      };
    }, [customerId, authToken, startPolling, walletRegistered]),
  );

  // ---------------------------------------------------------------------------
  // Load transaction limits
  //
  // Re-runs when currentTier changes (step-up to a new tier) OR when
  // verifyingKyc transitions from true → false (pending verification resolved).
  // The latter is necessary because currentTier stays 'l2' for both
  // pending and verified states, so without verifyingKyc in the deps the
  // API would never re-fetch the updated limits after L2 is confirmed.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Wait until tiers are resolved and not mid-polling so we fetch the limit
    // for the customer's actual verified tier, not a still-pending one.
    if (!walletRegistered || currentTier === null || verifyingKyc) {
      if (!walletRegistered) setLoadingLimits(false);
      return;
    }

    (async () => {
      setLoadingLimits(true);
      setLimitsError(null);
      try {
        if (settings.limitSource === 'api') {
          // Fetch live limits from Stripe. The backend uses the Privy access token
          // to return limits for their current verified tier server-side.
          // Backend API: GET /v1/onramp/limits
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
          setLimits(LOCAL_LIMITS[currentTier.toUpperCase() as 'L0' | 'L1' | 'L2']);
        }
      } catch (err: unknown) {
        setLimitsError(errorMessage(err));
      } finally {
        setLoadingLimits(false);
      }
    })();
  }, [authToken, walletAddress, network, settings.limitSource, currentTier, verifyingKyc, walletRegistered]);

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
      navigation.navigate('KYCPrimer', { customerId, authToken, walletAddress, network });
      return;
    }

    // Step-up re-entry: map the rejected tier to the correct error code and
    // the tier the user was at before submitting the rejected step-up data.
    const errorCode = rejectedEntry.tier === 'l2'
      ? 'crypto_onramp_missing_document_verification'    // L2 rejected → redo verifyIdentity
      : 'crypto_onramp_missing_identity_verification';   // L1 rejected → re-collect SSN+DOB

    const fromTier = rejectedEntry.tier === 'l2' ? 'l1' : 'l0';

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
  // Link authorization and Stripe wallet registration
  // ---------------------------------------------------------------------------

  const handlePreparePayment = async () => {
    const email = getPrivyEmail(privyUser);
    if (!email) {
      Alert.alert('Error', 'Sign in with an email address before continuing.');
      return;
    }

    setPreparingPayment(true);
    try {
      let nextCustomerId = customerId;

      const configResult = await configure({
        merchantDisplayName: MERCHANT_DISPLAY_NAME,
        appearance: { style: 'AUTOMATIC' },
      });
      if (configResult.error) {
        throw new Error(configResult.error.message);
      }

      if (!nextCustomerId) {
        const linkResult = await hasLinkAccount(email);
        if (linkResult.error) {
          throw new Error(linkResult.error.message);
        }

        if (!linkResult.hasLinkAccount) {
          if (!needsNewLinkAccount) {
            setNeedsNewLinkAccount(true);
            return;
          }
          if (!phone.trim() || phone === '+1') {
            Alert.alert('Error', 'Please enter your phone number.');
            return;
          }

          const registerResult = await registerLinkUser({
            email,
            phone: phone.trim(),
            country: 'US',
          });
          if (registerResult.error) {
            throw new Error(registerResult.error.message);
          }
        }

        const intentResult = await createAuthIntent(authToken);
        if (!intentResult.success) {
          throw new Error(intentResult.error.message);
        }

        const authResult = await authorize(intentResult.data.authIntentId);
        if (authResult.error) {
          throw new Error(authResult.error.message);
        }
        if (authResult.status === 'Denied') {
          Alert.alert('Denied', 'You must consent to continue.');
          return;
        }
        if (authResult.status !== 'Consented' || !authResult.customerId) {
          Alert.alert('Canceled', 'Authorization was canceled.');
          return;
        }

        nextCustomerId = authResult.customerId;
        const saveRes = await saveUser(nextCustomerId, authToken);
        if (!saveRes.success) {
          throw new Error(saveRes.error.message);
        }
        setCustomerId(nextCustomerId);
      }

      const customerRes = await getOnrampCustomer(nextCustomerId, authToken);
      if (!customerRes.success) {
        throw new Error(customerRes.error.message);
      }
      const l1Status = customerRes.data.kycTiers.find(tier => tier.tier === 'l1')?.verification_status;
      const l2Status = customerRes.data.kycTiers.find(tier => tier.tier === 'l2')?.verification_status;
      const hasVerifiedIdentityTier = l1Status === 'verified' || l2Status === 'verified';

      if (!hasVerifiedIdentityTier && settings.kycTier !== 'L0' && !kycSubmitted) {
        navigation.navigate('KYCPrimer', {
          customerId: nextCustomerId,
          authToken,
          walletAddress,
          network,
        });
        return;
      }

      const registration = await registerWalletAddress(
        walletAddress,
        network as Onramp.CryptoNetwork,
      );
      if (registration?.error) {
        throw new Error(registration.error.message);
      }

      setWalletRegistered(true);
      setNeedsNewLinkAccount(false);
    } catch (err: unknown) {
      Alert.alert('Error', errorMessage(err));
    } finally {
      setPreparingPayment(false);
    }
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
    } catch (err: unknown) {
      Alert.alert('Error', errorMessage(err));
    } finally {
      setCollectingMethod(false);
    }
  };

  // ---------------------------------------------------------------------------
  // KYC step-up
  //
  // Called when the entered amount exceeds the customer's current tier limit.
  // Uses the live kycTiers state (kept fresh by the polling loop) to determine
  // which tier the customer is on and which verification step comes next:
  //
  //   Current tier L0 → step up to L1: collect SSN + date of birth
  //   Current tier L1 → step up to L2: capture ID document + selfie
  //   Current tier L2 → already at max tier, cannot step up further
  // ---------------------------------------------------------------------------

  const handleStepUp = async () => {
    setSteppingUp(true);
    try {
      const tier = deriveCurrentTier(kycTiers);

      if (tier === 'l2') {
        // L2 is the highest tier — no further step-up is available.
        Alert.alert(
          'Maximum Tier Reached',
          'You have completed the highest level of identity verification. Please reduce your transaction amount.',
        );
        return;
      }

      // Map the current tier to the Stripe error code that KYCStepUpScreen
      // uses to determine which fields to collect for the next tier:
      //   currentTier l1 → missing_document_verification  (L1 → L2: ID doc + selfie)
      //   currentTier l0 → missing_identity_verification  (L0 → L1: SSN + DOB)
      const nextErrorCode = tier === 'l1'
        ? 'crypto_onramp_missing_document_verification'
        : 'crypto_onramp_missing_identity_verification';

      navigation.navigate('KYCStepUp', {
        customerId, authToken,
        errorCode: nextErrorCode,
        currentTier: tier,
        walletAddress, network, sourceAmount, sourceCurrency: 'usd',
        destinationCurrency: destCurrency, paymentToken: cryptoPaymentToken, paymentLabel,
      });
    } catch (err: unknown) {
      Alert.alert('Error', errorMessage(err));
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
      const remittanceResult = await createRemittance({
        paymentToken: cryptoPaymentToken,
        walletAddress,
        customerId,
        authToken,
        destinationNetwork: network,
        sourceAmount: amount,
        sourceCurrency: 'usd',
        destinationCurrency: destCurrency,
        payoutDestinationAddress: settings.payoutDestinationAddress,
      });

      if (!remittanceResult.success) {
        const errorCode = remittanceResult.error.code;
        const kycErrorCodes = [
          'crypto_onramp_missing_minimum_identity_verification',
          'crypto_onramp_missing_identity_verification',
          'crypto_onramp_missing_document_verification',
        ] as const;

        if (kycErrorCodes.includes(errorCode as typeof kycErrorCodes[number])) {
          // Session rejected due to KYC — route to KYCStepUpScreen with the
          // exact error code so it selects the right collection path.
          const tier = deriveCurrentTier(kycTiers);
          navigation.navigate('KYCStepUp', {
            customerId, authToken,
            errorCode: errorCode as typeof kycErrorCodes[number],
            currentTier: tier,
            walletAddress, network, sourceAmount, sourceCurrency: 'usd',
            destinationCurrency: destCurrency, paymentToken: cryptoPaymentToken, paymentLabel,
          });
          return;
        }

        Alert.alert('Error', remittanceResult.error.message);
        return;
      }

      navigation.navigate('Checkout', {
        customerId,
        authToken,
        walletAddress,
        network,
        remittanceId: remittanceResult.data.id,
        onrampSessionId: remittanceResult.data.onrampSession.id,
        sourceAmount,
        sourceCurrency: 'usd',
        destinationCurrency: destCurrency,
        paymentLabel,
      });
    } catch (err: unknown) {
      Alert.alert('Error', errorMessage(err));
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
  const currentTierKey = currentTier;
  const currentTierEntry = currentTierKey ? kycTiers.find(t => t.tier === currentTierKey) : undefined;
  const currentTierStatus = currentTierEntry?.verification_status;

  // Initial tier loading is bookkeeping. Only show user-facing status when
  // Stripe is actually reviewing submitted identity information.
  const isKycPending = verifyingKyc;
  // True when the current tier's review came back rejected.
  const isKycRejected = !loadingTiers && !isKycPending && currentTierStatus === 'rejected';

  // Button label and style depend on KYC status and whether amount exceeds limit.
  const buttonLabel = isKycPending
    ? 'Verifying identity…'
    : isKycRejected
      ? 'Re-enter identity details'
      : exceedsLimit
        ? 'Verify more information'
        : 'Review transfer';

  const buttonStyleBase = isKycRejected
    ? styles.buttonReenter
    : exceedsLimit
      ? styles.buttonStepUp
      : styles.button;

  // Payment method required for all flows except re-entering KYC after rejection.
  // loadingLimits is included so the button stays disabled while limits refresh
  // after a pending verification resolves (prevents proceeding with stale limits).
  const buttonDisabled = loadingTiers || isKycPending || loadingLimits || busy || (!isKycRejected && !paymentReady);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!walletRegistered) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Payment method</Text>
        <Text style={styles.subtitle}>
          Select how you want to pay. You will review the transfer details before confirming.
        </Text>

        <Text style={styles.label}>Payment method</Text>

        {needsNewLinkAccount ? (
          <>
            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+12125551234"
              placeholderTextColor="#555"
              keyboardType="phone-pad"
              autoCapitalize="none"
              editable={!preparingPayment}
            />
            <Text style={styles.terms}>
              By continuing you agree to the{' '}
              <Text style={styles.link} onPress={() => Linking.openURL('https://link.com/terms/crypto-onramp')}>
                Link terms
              </Text>
              .
            </Text>
          </>
        ) : null}

        <TouchableOpacity
          style={[
            needsNewLinkAccount ? styles.button : styles.addMethodButton,
            preparingPayment && styles.buttonDisabled,
          ]}
          disabled={preparingPayment}
          onPress={handlePreparePayment}
        >
          {preparingPayment
            ? <ActivityIndicator color={needsNewLinkAccount ? '#fff' : '#635BFF'} />
            : (
              <Text style={needsNewLinkAccount ? styles.buttonText : styles.addMethodText}>
                {needsNewLinkAccount ? 'Create Link account' : 'Continue with Link'}
              </Text>
            )}
        </TouchableOpacity>

      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Payment method</Text>
      <Text style={styles.subtitle}>
        Select how you want to pay. You will review the transfer details before confirming.
      </Text>

      {(isKycPending || isKycRejected || exceedsLimit || limitsError) ? (
        <View style={[
          styles.statusCard,
          (isKycRejected || exceedsLimit || limitsError) && styles.statusCardWarning,
        ]}>
          <View style={styles.statusHeader}>
            <Text style={styles.statusTitle}>
              {isKycRejected
                ? 'Identity needs attention'
                : exceedsLimit
                  ? 'More information needed'
                  : limitsError
                    ? 'Transfer limits unavailable'
                    : 'Checking identity status'}
            </Text>
            {isKycPending ? <ActivityIndicator color="#635BFF" size="small" /> : null}
          </View>
          <Text style={styles.statusBody}>
            {isKycRejected
              ? 'Some identity information could not be verified. Re-enter your details to continue.'
              : exceedsLimit
                ? 'This amount is above the current transfer limit. A quick identity step-up unlocks higher limits.'
                : limitsError
                  ? limitsError
                  : 'Stripe is checking whether this transfer needs more information.'}
          </Text>
        </View>
      ) : null}

      {/* Payment method */}
      <Text style={styles.label}>Payment method</Text>

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
            : <Text style={styles.addMethodText}>Select or add payment method</Text>}
        </TouchableOpacity>
      )}

      {/* Primary action button — label and style reflect live KYC status:
          - Pending verification:  "Verifying identity…" (disabled, spinner)
          - Rejected verification: "Re-enter identity details" → back to identity screen
          - Verified + over limit: "Verify more information" → step-up flow
          - Verified + ok:         "Review transfer" → create session → Checkout */}
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
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 18 },
  label: { color: '#aaa', fontSize: 13, marginBottom: 8 },
  statusCard: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#252525',
  },
  statusCardWarning: { borderColor: '#5a2010' },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  statusBody: { color: '#aaa', fontSize: 13, lineHeight: 18 },
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
  terms: { color: '#777', fontSize: 12, lineHeight: 18 },
  link: { color: '#8b85ff' },

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
  assetCard: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#252525',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
  },
  assetLabel: { color: '#777', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  assetValue: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 5 },
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
