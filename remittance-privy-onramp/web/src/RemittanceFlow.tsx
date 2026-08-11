import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CollectPaymentMethodOptions,
  type CryptoNetwork,
  type KycInfo,
} from '@stripe/crypto';
import {
  useCreateWallet,
  useLoginWithEmail,
  usePrivy,
  useSigners,
  useWallets,
  type User as PrivyUser,
} from '@privy-io/react-auth';
import {
  attachRemittanceWallet,
  checkoutSession,
  createAuthIntent,
  createRemittance,
  getOnrampCustomer,
  getRemittance,
  getTransactionLimits,
  refreshQuote,
  saveUser,
  triggerRemittanceTransfer,
} from './api';
import {
  CURRENCIES_BY_NETWORK,
  DEFAULT_KYC_TIER,
  DEFAULT_DEMO_NETWORK,
  DEFAULT_TRANSFER,
  DEMO_PAYOUT_PARTNER,
  LOCAL_LIMITS,
  PRIVY_WALLET_POLICY_IDS,
  PRIVY_WALLET_SIGNER_ID,
} from './constants';
import type {
  AddressForm,
  CreateRemittanceResponse,
  KycForm,
  KycTier,
  KycTierEntry,
  QuoteResponse,
  RemittanceResponse,
  TransferIntent,
} from './types';
import { AppShell, type JourneyStage } from './components/AppShell';
import { SdkElementModal } from './components/SdkElementModal';
import type { TrackerStep } from './components/Tracker';
import { AddressScreen } from './screens/AddressScreen';
import { AuthScreen } from './screens/AuthScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { HomeScreen } from './screens/HomeScreen';
import { KYCPrimerScreen } from './screens/KYCPrimerScreen';
import { KYCScreen } from './screens/KYCScreen';
import { KYCStepUpScreen } from './screens/KYCStepUpScreen';
import { PaymentMethodScreen } from './screens/PaymentMethodScreen';
import { SuccessScreen } from './screens/SuccessScreen';
import { TransferSetupScreen } from './screens/TransferSetupScreen';
import { WalletScreen } from './screens/WalletScreen';
import { useFlowNavigation } from './hooks/useFlowNavigation';
import { useOnramp } from './hooks/useOnramp';
import { digitsOnly, networkName } from './utils';

type SetupStage =
  | 'idle'
  | 'creating_wallet'
  | 'authorizing_wallet'
  | 'attaching_wallet'
  | 'ready';
type AuthCallbackResult = {
  result?: string;
  crypto_customer_id?: string;
};

type EmbeddedWalletIdentity = {
  id: string;
  address: string;
};

function findEmbeddedWallet(
  user: PrivyUser | null | undefined,
  address?: string,
): EmbeddedWalletIdentity | null {
  const normalizedAddress = address?.toLowerCase();
  const account = user?.linkedAccounts.find((linkedAccount) => {
    if (linkedAccount.type !== 'wallet' || linkedAccount.chainType !== 'ethereum') return false;
    if (linkedAccount.walletClientType !== 'privy' && linkedAccount.walletClientType !== 'privy-v2') {
      return false;
    }
    return !normalizedAddress || linkedAccount.address.toLowerCase() === normalizedAddress;
  });

  if (!account || account.type !== 'wallet' || typeof account.id !== 'string') return null;
  return { id: account.id, address: account.address };
}

function isDuplicateSignerError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('duplicate signer');
}

function parseDateOfBirth(monthInput: string, dayInput: string, yearInput: string) {
  if (!/^\d{1,2}$/.test(monthInput) || !/^\d{1,2}$/.test(dayInput) || !/^\d{4}$/.test(yearInput)) {
    return null;
  }
  const month = Number.parseInt(monthInput, 10);
  const day = Number.parseInt(dayInput, 10);
  const year = Number.parseInt(yearInput, 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { day, month, year };
}

function deriveCurrentTier(kycTiers: KycTierEntry[]): 'l0' | 'l1' | 'l2' {
  const attempted = ['pending', 'rejected', 'verified'];
  const find = (tier: string) =>
    kycTiers.find((entry) => entry.tier === tier)?.verification_status ?? 'not_started';
  if (attempted.includes(find('l2'))) return 'l2';
  if (attempted.includes(find('l1'))) return 'l1';
  return 'l0';
}

function hasVerifiedIdentityTier(kycTiers: KycTierEntry[]): boolean {
  return kycTiers.some(
    (tier) =>
      (tier.tier === 'l1' || tier.tier === 'l2') &&
      tier.verification_status === 'verified',
  );
}

function assertReady<T>(
  value: T | null | undefined,
  label: string,
): asserts value is T {
  if (!value) throw new Error(`${label} is not ready yet.`);
}

export default function RemittanceFlow() {
  const {
    ready: privyReady,
    authenticated: privyAuthenticated,
    user: privyUser,
    getAccessToken,
    logout,
  } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { wallets: connectedWallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { addSigners } = useSigners();

  const [error, setError] = useState<string | null>(null);
  const { step, setStep, goBack } = useFlowNavigation(() => setError(null));
  const { onramp, sdkError } = useOnramp();
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [privyCode, setPrivyCode] = useState('');
  const [privyCodeSent, setPrivyCodeSent] = useState(false);
  const [phone, setPhone] = useState('+12125551234');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [authElement, setAuthElement] = useState<HTMLElement | null>(null);
  const [needsNewLinkAccount, setNeedsNewLinkAccount] = useState(false);
  const [kycTier] = useState<KycTier>(DEFAULT_KYC_TIER);
  const [kycForm, setKycForm] = useState<KycForm>({
    firstName: '',
    lastName: '',
    ssn: '',
    dobMonth: '',
    dobDay: '',
    dobYear: '',
  });
  const [addressForm, setAddressForm] = useState<AddressForm>({
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
  });
  const [kycTiers, setKycTiers] = useState<KycTierEntry[]>([]);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycSubmitted, setKycSubmitted] = useState(false);
  const [kycStepUpFromTier, setKycStepUpFromTier] = useState<'l0' | 'l1' | 'l2'>('l0');

  const [transfer, setTransfer] = useState<TransferIntent>(DEFAULT_TRANSFER);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletNetwork, setWalletNetwork] = useState(DEFAULT_DEMO_NETWORK);
  const [walletStage, setWalletStage] = useState<SetupStage>('idle');
  const [walletRegistered, setWalletRegistered] = useState(false);

  const [paymentElement, setPaymentElement] = useState<HTMLElement | null>(null);
  const [paymentToken, setPaymentToken] = useState<string | null>(null);
  const [paymentLabel, setPaymentLabel] = useState('Card');
  const [remittance, setRemittance] = useState<CreateRemittanceResponse | RemittanceResponse | null>(null);
  const [quote, setQuote] = useState<QuoteResponse['transaction_details'] | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const autoTransferAttemptedRef = useRef(false);
  const [limit, setLimit] = useState<number | null>(null);

  const destinationCurrency = useMemo(() => {
    const currencies = CURRENCIES_BY_NETWORK[walletNetwork] ?? ['usdc'];
    return currencies.includes('usdc') ? 'usdc' : currencies[0];
  }, [walletNetwork]);

  const routeNetworkName = networkName(walletNetwork);

  const resetCheckoutDraft = () => {
    setRemittance(null);
    setQuote(null);
    autoTransferAttemptedRef.current = false;
  };

  const updateTransfer = (updates: Partial<TransferIntent>) => {
    if (remittance || quote) resetCheckoutDraft();
    setTransfer((current) => ({ ...current, ...updates }));
  };

  const updateKycForm = (updates: Partial<KycForm>) => {
    setKycForm((current) => ({ ...current, ...updates }));
  };

  const updateAddressForm = (updates: Partial<AddressForm>) => {
    setAddressForm((current) => ({ ...current, ...updates }));
  };

  const refreshCustomerKyc = useCallback(async () => {
    if (!customerId || !authToken) return null;
    const customer = await getOnrampCustomer(customerId, authToken);
    if (customer.success) {
      setKycTiers(customer.data.kycTiers);
      return customer.data.kycTiers;
    }
    setError(customer.error.message);
    return null;
  }, [authToken, customerId]);

  const currentTier = kycTiers.length ? deriveCurrentTier(kycTiers) : 'l0';
  const currentTierEntry = kycTiers.find((entry) => entry.tier === currentTier);
  const isKycPending = currentTierEntry?.verification_status === 'pending';
  const isKycRejected = currentTierEntry?.verification_status === 'rejected';
  const currentTierLimit = limit ?? LOCAL_LIMITS[currentTier.toUpperCase() as KycTier].limit;
  const amountNumber = Number.parseFloat(transfer.amountUsd) || 0;
  const exceedsLimit = amountNumber > currentTierLimit;

  const prepareAuthorizedCustomer = useCallback(
    async (appToken: string, cryptoCustomerId: string) => {
      assertReady(onramp, 'Stripe Onramp');
      assertReady(walletAddress, 'Wallet');

      const customer = await getOnrampCustomer(cryptoCustomerId, appToken);
      if (!customer.success) throw new Error(customer.error.message);
      setKycTiers(customer.data.kycTiers);

      if (!hasVerifiedIdentityTier(customer.data.kycTiers) && kycTier !== 'L0' && !kycSubmitted) {
        setStep('kycPrimer');
        return;
      }

      await onramp.registerWalletAddress(walletAddress, walletNetwork as CryptoNetwork);
      setWalletRegistered(true);
      setNeedsNewLinkAccount(false);
      setStep('payment');
    },
    [kycSubmitted, kycTier, onramp, walletAddress, walletNetwork],
  );

  const finishLinkAuthorization = useCallback(
    async (appToken: string, result: AuthCallbackResult) => {
      setBusy(true);
      setAuthElement(null);
      try {
        if (result.result === 'abandoned') throw new Error('Link authorization was canceled.');
        if (result.result === 'declined') {
          throw new Error('Authorize Link access to continue with the transfer.');
        }
        if (!result.crypto_customer_id) {
          throw new Error('Link authorization did not return a crypto customer.');
        }

        const saveResult = await saveUser(result.crypto_customer_id, appToken);
        if (!saveResult.success) throw new Error(saveResult.error.message);

        setCustomerId(result.crypto_customer_id);
        await prepareAuthorizedCustomer(appToken, result.crypto_customer_id);
      } catch (authorizationError) {
        setError(authorizationError instanceof Error ? authorizationError.message : String(authorizationError));
      } finally {
        setBusy(false);
      }
    },
    [prepareAuthorizedCustomer],
  );

  const authorizeWithLink = useCallback(
    async (appToken: string) => {
      assertReady(onramp, 'Stripe Onramp');
      const intent = await createAuthIntent(appToken);
      if (!intent.success) {
        if (intent.error.code === 'HTTP_404') {
          setNeedsNewLinkAccount(true);
          setBusy(false);
          return;
        }
        throw new Error(intent.error.message);
      }

      const element = await onramp.authenticate(
        intent.data.authIntentId,
        async (result: AuthCallbackResult) => {
          await finishLinkAuthorization(appToken, result);
        },
      );
      if (element) {
        setAuthElement(element);
        setBusy(false);
      }
    },
    [finishLinkAuthorization, onramp],
  );

  const handleSendPrivyCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) throw new Error('Enter your email address.');
      await sendCode({ email: trimmedEmail });
      setPrivyCodeSent(true);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : String(authError));
    } finally {
      setBusy(false);
    }
  };

  const handlePrivyContinue = async () => {
    setError(null);
    setBusy(true);
    try {
      if (!privyAuthenticated) {
        if (!privyCode.trim()) throw new Error('Enter the code sent to your email.');
        await loginWithCode({ code: privyCode.trim() });
      }

      const token = await getAccessToken();
      if (!token) throw new Error('Privy did not return an access token.');
      setAuthToken(token);
      setStep('transfer');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : String(authError));
    } finally {
      setBusy(false);
    }
  };

  const handlePrivyLogout = async () => {
    setBusy(true);
    try {
      await logout();
      setAuthToken(null);
      setCustomerId(null);
      setWalletAddress(null);
      setWalletRegistered(false);
      setPrivyCode('');
      setPrivyCodeSent(false);
      setStep('auth');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateLinkAccount = async () => {
    setError(null);
    setBusy(true);
    try {
      assertReady(onramp, 'Stripe Onramp');
      assertReady(authToken, 'Privy auth');
      const senderEmail = privyUser?.email?.address ?? email.trim();
      if (!senderEmail) throw new Error('Sign in with an email address before continuing.');
      if (!phone.trim() || phone.trim() === '+1') {
        throw new Error('Enter a phone number.');
      }

      const registration = await onramp.registerLinkUser(senderEmail, phone.trim(), 'US');
      if (!registration.created) {
        throw new Error('Link account creation did not complete.');
      }

      await authorizeWithLink(authToken);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : String(linkError));
      setBusy(false);
    }
  };

  const handleSubmitAddressKyc = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setKycLoading(true);
    try {
      assertReady(onramp, 'Stripe Onramp');
      const collectSensitiveFields = kycTier !== 'L0';
      const { firstName, lastName, ssn, dobDay, dobMonth, dobYear } = kycForm;
      const { line1, line2, city, state, postalCode } = addressForm;
      if (!firstName.trim() || !lastName.trim()) throw new Error('Enter your first and last name.');
      if (!line1.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
        throw new Error('Enter your full home address.');
      }

      const ssnDigits = digitsOnly(ssn, 9);
      const dateOfBirth = parseDateOfBirth(dobMonth, dobDay, dobYear);
      if (collectSensitiveFields && (ssnDigits.length !== 9 || !dateOfBirth)) {
        throw new Error('Enter a valid SSN and date of birth.');
      }

      const info: KycInfo = {
        given_name: firstName.trim(),
        surname: lastName.trim(),
        address: {
          line1: line1.trim(),
          ...(line2.trim() ? { line2: line2.trim() } : {}),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          postal_code: postalCode.trim(),
          country: 'US',
        },
        ...(collectSensitiveFields && dateOfBirth
          ? {
              date_of_birth: dateOfBirth,
              id_number: { type: 'us_ssn' as const, value: ssnDigits },
            }
          : {}),
      };
      await onramp.submitKycInfo(info);

      if (kycTier === 'L2') {
        await onramp.verifyDocuments();
      }

      setKycSubmitted(true);
      await refreshCustomerKyc();
      setStep('payment');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setKycLoading(false);
    }
  };

  const handleKycStepUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setKycLoading(true);
    try {
      assertReady(onramp, 'Stripe Onramp');
      if (kycStepUpFromTier === 'l0') {
        const ssnDigits = digitsOnly(kycForm.ssn, 9);
        const dateOfBirth = parseDateOfBirth(kycForm.dobMonth, kycForm.dobDay, kycForm.dobYear);
        if (ssnDigits.length !== 9 || !dateOfBirth) {
          throw new Error('Enter a valid SSN and date of birth.');
        }
        await onramp.submitKycInfo({
          date_of_birth: dateOfBirth,
          id_number: { type: 'us_ssn' as const, value: ssnDigits },
        });
      } else if (kycStepUpFromTier === 'l1') {
        await onramp.verifyDocuments();
      } else {
        throw new Error('This customer is already at the highest KYC tier.');
      }

      await refreshCustomerKyc();
      setStep('payment');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setKycLoading(false);
    }
  };

  const handlePrepareWallet = async () => {
    setError(null);
    setBusy(true);
    setWalletStage('creating_wallet');
    try {
      assertReady(authToken, 'Privy auth');
      assertReady(privyUser, 'Privy user');
      if (!walletsReady) throw new Error('Privy wallets are still loading.');
      if (!PRIVY_WALLET_SIGNER_ID) {
        throw new Error('VITE_PRIVY_WALLET_SIGNER_ID is not set in web/.env.');
      }

      const signer = {
        signerId: PRIVY_WALLET_SIGNER_ID,
        policyIds: PRIVY_WALLET_POLICY_IDS,
      };
      const connectedWallet = connectedWallets.find(
        (wallet) => wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2',
      );

      let walletIdentity: EmbeddedWalletIdentity;
      if (connectedWallet) {
        const existingWallet = findEmbeddedWallet(privyUser, connectedWallet.address);
        if (!existingWallet) throw new Error('Could not determine the Privy wallet ID.');
        walletIdentity = existingWallet;

        setWalletStage('authorizing_wallet');
        try {
          await addSigners({ address: walletIdentity.address, signers: [signer] });
        } catch (signerError) {
          if (!isDuplicateSignerError(signerError)) throw signerError;
        }
      } else {
        const createdWallet = await createWallet({ signers: [signer] });
        if (!createdWallet.id) throw new Error('Privy did not return a wallet ID.');
        walletIdentity = { id: createdWallet.id, address: createdWallet.address };
      }

      setWalletStage('attaching_wallet');
      const wallet = await attachRemittanceWallet(authToken, {
        walletAddress: walletIdentity.address,
        privyUserId: privyUser.id,
        privyWalletId: walletIdentity.id,
        network: DEFAULT_DEMO_NETWORK,
      });
      if (!wallet.success) throw new Error(wallet.error.message);

      setWalletAddress(wallet.data.walletAddress);
      setWalletNetwork(wallet.data.network);

      setWalletStage('ready');
      setStep('payment');
    } catch (err) {
      setWalletStage('idle');
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePreparePayment = async () => {
    setError(null);
    setBusy(true);
    try {
      assertReady(authToken, 'Privy auth');
      if (customerId) {
        await prepareAuthorizedCustomer(authToken, customerId);
      } else {
        await authorizeWithLink(authToken);
      }
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : String(paymentError));
      setBusy(false);
    }
  };

  const handleCollectPayment = async () => {
    setError(null);
    setBusy(true);
    resetCheckoutDraft();
    setPaymentToken(null);
    setPaymentElement(null);
    try {
      assertReady(onramp, 'Stripe Onramp');
      const options: CollectPaymentMethodOptions = {
        payment_method_types: ['card'],
        wallets: { applePay: 'auto', googlePay: 'auto' },
      };
      const element = await onramp.collectPaymentMethod(options, (request) => {
        setPaymentToken(request.cryptoPaymentToken);
        setPaymentLabel('Selected payment method');
      });
      setPaymentElement(element);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSession = async () => {
    setError(null);
    setBusy(true);
    setQuoteLoading(true);
    try {
      assertReady(authToken, 'App auth');
      assertReady(customerId, 'Link customer');
      assertReady(walletAddress, 'Wallet');
      assertReady(paymentToken, 'Payment method');
      const amount = Number.parseFloat(transfer.amountUsd);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid transfer amount.');
      if (isKycPending) throw new Error('Identity verification is still pending.');
      if (isKycRejected) {
        setStep('kycPrimer');
        return;
      }
      if (exceedsLimit) {
        if (currentTier === 'l2') {
          throw new Error('This transfer exceeds the current transaction limit. Reduce the amount to continue.');
        }
        setKycStepUpFromTier(currentTier);
        setStep('kycStepUp');
        return;
      }

      const created = await createRemittance({
        paymentToken,
        walletAddress,
        customerId,
        authToken,
        destinationNetwork: walletNetwork,
        sourceAmount: amount,
        sourceCurrency: 'usd',
        destinationCurrency,
      });
      if (!created.success) throw new Error(created.error.message);
      setRemittance(created.data);

      const quoteResult = await refreshQuote(created.data.id, authToken);
      if (quoteResult.success) {
        setQuote(quoteResult.data.transaction_details);
      }
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setQuoteLoading(false);
      setBusy(false);
    }
  };

  const pollRemittance = useCallback(
    async (showLoading = false) => {
      if (!remittance?.id || !authToken) return;
      if (showLoading) setStatusLoading(true);
      try {
        const result = await getRemittance(remittance.id, authToken);
        if (result.success) {
          setRemittance(result.data);
          setError(null);
        }
      } finally {
        if (showLoading) setStatusLoading(false);
      }
    },
    [authToken, remittance?.id],
  );

  const handleCheckout = async () => {
    setError(null);
    setCheckoutLoading(true);
    try {
      assertReady(onramp, 'Stripe Onramp');
      assertReady(authToken, 'App auth');
      assertReady(remittance, 'Remittance');

      const result = await onramp.performCheckout(remittance.onrampSessionId, async () => {
        const checkout = await checkoutSession(remittance.id, authToken);
        if (!checkout.success) throw new Error(checkout.error.message);
        return checkout.data.client_secret;
      });

      if (!result.successful) {
        setCheckoutLoading(false);
        return;
      }

      setStep('tracker');
      await pollRemittance(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const runTransfer = useCallback(
    async (showErrors: boolean) => {
      if (!remittance?.id || !authToken || !quote?.destination_amount) return;
      setTransferLoading(true);
      try {
        const result = await triggerRemittanceTransfer({
          remittanceId: remittance.id,
          authToken,
          amount: quote.destination_amount,
          currency: destinationCurrency,
        });
        if (result.success) {
          setRemittance(result.data);
          setError(null);
        } else if (showErrors) {
          setError(result.error.message);
        }
      } finally {
        setTransferLoading(false);
      }
    },
    [authToken, destinationCurrency, quote?.destination_amount, remittance?.id],
  );

  useEffect(() => {
    if (step !== 'tracker' || !remittance?.id || !authToken) return;
    if (remittance.status !== 'onramp_session_created' && remittance.status !== 'transfer_in_progress') return;
    const interval = window.setInterval(() => {
      void pollRemittance(false);
    }, 4000);
    return () => window.clearInterval(interval);
  }, [authToken, pollRemittance, remittance?.id, remittance?.status, step]);

  useEffect(() => {
    if (
      step === 'tracker' &&
      transfer.payoutMode === 'auto_send_to_payout' &&
      remittance?.status === 'onramp_fulfilled' &&
      !autoTransferAttemptedRef.current
    ) {
      autoTransferAttemptedRef.current = true;
      void runTransfer(false);
    }
  }, [remittance?.status, runTransfer, step, transfer.payoutMode]);

  useEffect(() => {
    if (step !== 'payment' || !customerId || !authToken) return;
    void refreshCustomerKyc();
  }, [authToken, customerId, refreshCustomerKyc, step]);

  useEffect(() => {
    if (step !== 'payment' || !authToken || !customerId || !walletAddress || !walletRegistered) return;
    let cancelled = false;
    setLimit(LOCAL_LIMITS[currentTier.toUpperCase() as KycTier].limit);
    getTransactionLimits(authToken, {
      walletAddress,
      destinationNetwork: walletNetwork,
    }).then((result) => {
      if (cancelled || !result.success) return;
      const cardLimits = result.data.limits?.['usd.fiat']?.card ?? [];
      const instantLimit = cardLimits.find((entry) => entry.settlement_speed === 'instant') ?? cardLimits[0];
      if (instantLimit) setLimit(instantLimit.limit / 100);
    });
    return () => {
      cancelled = true;
    };
  }, [authToken, currentTier, customerId, step, walletAddress, walletNetwork, walletRegistered]);

  useEffect(() => {
    if (step !== 'payment' || !isKycPending) return;
    const interval = window.setInterval(() => {
      void refreshCustomerKyc();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [isKycPending, refreshCustomerKyc, step]);

  const isOnrampFulfilled =
    remittance?.status === 'onramp_fulfilled' ||
    remittance?.status === 'transfer_in_progress' ||
    remittance?.status === 'transfer_submitted' ||
    remittance?.status === 'transfer_failed';
  const transferInProgress = remittance?.status === 'transfer_in_progress';
  const transferSubmitted = remittance?.status === 'transfer_submitted';
  const transferFailed = remittance?.status === 'transfer_failed';
  const isHoldMode = transfer.payoutMode === 'hold_in_wallet';
  const canManuallySend = !!(
    isHoldMode &&
    remittance?.status === 'onramp_fulfilled' &&
    quote?.destination_amount &&
    destinationCurrency === 'usdc'
  );

  const trackerSteps: TrackerStep[] = [
    {
      title: 'Payment completed',
      body: 'Stripe accepted the USD payment for this transfer.',
      status: step === 'tracker' ? 'complete' : 'waiting',
    },
    {
      title: `Delivering ${destinationCurrency.toUpperCase()}`,
      body: `Stripe Onramp is delivering ${destinationCurrency.toUpperCase()} to your Privy wallet on ${routeNetworkName}.`,
      status: isOnrampFulfilled ? 'complete' : 'active',
    },
    {
      title: `${destinationCurrency.toUpperCase()} arrived on ${routeNetworkName}`,
      body: 'Funds are in the user-owned Privy wallet prepared for this remittance.',
      status: isOnrampFulfilled ? 'complete' : 'waiting',
    },
    {
      title: isHoldMode && remittance?.status === 'onramp_fulfilled'
        ? 'Held in wallet'
        : 'Sending to payout partner',
      body: isHoldMode && remittance?.status === 'onramp_fulfilled'
        ? `USDC is in your Privy wallet. You can send it to ${DEMO_PAYOUT_PARTNER} when ready.`
        : `The developer backend uses delegated wallet authority to send funds to ${DEMO_PAYOUT_PARTNER}.`,
      status: transferFailed
        ? 'failed'
        : transferSubmitted
          ? 'complete'
          : transferInProgress || transferLoading
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

  const amountText = quote?.destination_amount
    ? `${quote.destination_amount} ${destinationCurrency.toUpperCase()}`
    : `${destinationCurrency.toUpperCase()}`;
  const signedInEmail = privyUser?.email?.address;
  const walletIsReady = walletStage === 'ready' && !!walletAddress;

  const handleJourneySelect = (nextStage: JourneyStage) => {
    if (nextStage === 'transfer') resetCheckoutDraft();
    setStep(nextStage);
  };

  return (
    <>
      <AppShell
        error={error}
        onBack={goBack}
        onJourneySelect={handleJourneySelect}
        sdkError={sdkError}
        step={step}
      >

          {step === 'landing' ? (
            <HomeScreen
              onContinue={() => setStep('auth')}
              onPayoutModeChange={(payoutMode) => updateTransfer({ payoutMode })}
              onramp={onramp}
              payoutMode={transfer.payoutMode}
              privyReady={privyReady}
              sdkError={sdkError}
            />
          ) : null}

          {step === 'auth' ? (
            <AuthScreen
              authenticated={privyAuthenticated}
              busy={busy}
              code={privyCode}
              codeSent={privyCodeSent}
              email={email}
              onCodeChange={setPrivyCode}
              onContinue={() => void handlePrivyContinue()}
              onEmailChange={setEmail}
              onLogout={() => void handlePrivyLogout()}
              onSendCode={() => void handleSendPrivyCode()}
              privyReady={privyReady}
              signedInEmail={signedInEmail}
            />
          ) : null}

          {step === 'kycPrimer' ? (
            <KYCPrimerScreen kycTier={kycTier} onContinue={() => setStep('kyc')} />
          ) : null}

          {step === 'kyc' ? (
            <KYCScreen
              form={kycForm}
              kycTier={kycTier}
              onChange={updateKycForm}
              onContinue={() => setStep('address')}
            />
          ) : null}

          {step === 'address' ? (
            <AddressScreen
              form={addressForm}
              kycLoading={kycLoading}
              kycTier={kycTier}
              onChange={updateAddressForm}
              onSubmit={handleSubmitAddressKyc}
            />
          ) : null}

          {step === 'transfer' ? (
            <TransferSetupScreen
              onChange={updateTransfer}
              onContinue={() => setStep('wallet')}
              transfer={transfer}
            />
          ) : null}

          {step === 'wallet' ? (
            <WalletScreen
              busy={busy}
              isHoldMode={isHoldMode}
              onContinue={() => setStep('payment')}
              onPrepare={() => void handlePrepareWallet()}
              routeNetworkName={routeNetworkName}
              stage={walletStage}
              transfer={transfer}
              walletIsReady={walletIsReady}
            />
          ) : null}

          {step === 'payment' ? (
            <PaymentMethodScreen
              busy={busy}
              currentTier={currentTier}
              exceedsLimit={exceedsLimit}
              isKycPending={isKycPending}
              isKycRejected={isKycRejected}
              needsNewLinkAccount={needsNewLinkAccount}
              onCollectPayment={() => void handleCollectPayment()}
              onPhoneChange={setPhone}
              onPreparePayment={() => void (needsNewLinkAccount ? handleCreateLinkAccount() : handlePreparePayment())}
              onProceed={() => void (remittance && quote ? setStep('review') : handleCreateSession())}
              onrampReady={!!onramp}
              paymentElement={paymentElement}
              paymentToken={paymentToken}
              phone={phone}
              returnToReview={!!remittance && !!quote}
              walletRegistered={walletRegistered}
            />
          ) : null}

          {step === 'kycStepUp' ? (
            <KYCStepUpScreen
              form={kycForm}
              fromTier={kycStepUpFromTier}
              loading={kycLoading}
              onChange={updateKycForm}
              onSubmit={handleKycStepUp}
            />
          ) : null}

          {step === 'review' ? (
            <CheckoutScreen
              checkoutLoading={checkoutLoading}
              destinationCurrency={destinationCurrency}
              onCheckout={() => void handleCheckout()}
              paymentLabel={paymentLabel}
              quote={quote}
              quoteLoading={quoteLoading}
              routeNetworkName={routeNetworkName}
              transfer={transfer}
              walletAddress={walletAddress}
            />
          ) : null}

          {step === 'tracker' ? (
            <SuccessScreen
              amountText={amountText}
              canManuallySend={canManuallySend}
              destinationCurrency={destinationCurrency}
              detailsOpen={detailsOpen}
              isHoldMode={isHoldMode}
              isOnrampFulfilled={isOnrampFulfilled}
              onPoll={() => void pollRemittance(true)}
              onSend={() => void runTransfer(true)}
              onToggleDetails={() => setDetailsOpen((open) => !open)}
              remittance={remittance}
              routeNetworkName={routeNetworkName}
              statusLoading={statusLoading}
              trackerSteps={trackerSteps}
              transfer={transfer}
              transferFailed={transferFailed}
              transferInProgress={transferInProgress}
              transferLoading={transferLoading}
              transferSubmitted={transferSubmitted}
              walletAddress={walletAddress}
            />
          ) : null}
      </AppShell>
      <SdkElementModal
        element={authElement}
        title="Link authentication"
        onClose={() => {
          setAuthElement(null);
          setBusy(false);
        }}
      />
    </>
  );
}
