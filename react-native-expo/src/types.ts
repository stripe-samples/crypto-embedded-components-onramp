export interface Verification {
  name: 'phone_verified' | 'kyc_verified' | 'id_document_verified';
  status: 'not_started' | 'pending' | 'rejected' | 'verified';
  errors: string[];
}

export interface CryptoCustomer {
  id: string;
  provided_fields: string[];
  verifications: Verification[];
}

export interface ConsumerWallet {
  id: string;
  livemode: boolean;
  network: string;
  wallet_address: string;
}

export interface PaymentTokenCard {
  brand?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
  funding: string;
}

export interface PaymentToken {
  id: string;
  type: 'card' | 'us_bank_account';
  card?: PaymentTokenCard;
}

export type RootStackParamList = {
  Home: undefined;
  /** Demo configuration: KYC tier and limit source. */
  Settings: undefined;
  Auth: undefined;
  Register: { email: string; authToken: string };
  KYCPrimer: { customerId: string; authToken: string; registrationCountry?: string };
  KYC: { customerId: string; authToken: string };
  EuKyc: { customerId: string; authToken: string; country?: string };
  Address: {
    customerId: string;
    authToken: string;
    firstName: string;
    lastName: string;
    /** Present for L1/L2 only — L0 skips SSN collection. */
    idNumber?: string;
    /** Present for L1/L2 only — L0 skips DOB collection. */
    dobDay?: number;
    dobMonth?: number;
    dobYear?: number;
  };
  Wallet: {
    customerId: string;
    authToken: string;
  };
  PaymentMethod: {
    customerId: string;
    authToken: string;
    walletAddress: string;
    network: string;
    /**
     * Pre-filled when returning from KYCStepUpScreen. Carrying these params
     * back lets PaymentMethod re-check limits for the new tier without asking
     * the user to re-enter their card or amount.
     */
    paymentToken?: string;
    paymentLabel?: string;
    sourceAmount?: string;
    destinationCurrency?: string;
  };
  /**
   * KYC step-up screen. Reached from PaymentMethodScreen when the entered
   * amount exceeds the current tier's transaction limit. Collects only the
   * incremental fields needed for the next tier:
   *
   *   missing_identity_verification  + currentTier=L0 → collect SSN + DOB → attachKycInfo
   *   missing_document_verification  + currentTier=L0 → collect SSN + DOB → attachKycInfo → verifyIdentity
   *   missing_document_verification  + currentTier=L1 → verifyIdentity only
   *
   * After SDK calls succeed, navigates back to PaymentMethodScreen with the
   * original payment params pre-filled. PaymentMethodScreen polls until the
   * new tier is verified, then re-checks limits and either steps up again or
   * proceeds to createOnrampSession().
   */
  KYCStepUp: {
    customerId: string;
    authToken: string;
    /** Stripe error code from the failed session creation. */
    errorCode:
      | 'crypto_onramp_missing_minimum_identity_verification'
      | 'crypto_onramp_missing_identity_verification'
      | 'crypto_onramp_missing_document_verification';
    /**
     * Customer's current KYC tier, derived from kyc_tiers via deriveCurrentTier().
     * Using kyc_tiers (not verifications) is authoritative — kyc_verified can
     * be non-not_started for L0 users, making verifications unreliable.
     */
    currentTier: 'l0' | 'l1' | 'l2';
    // Payment details carried forward so PaymentMethodScreen can pre-fill
    // amount, currency, and card after returning from the step-up flow.
    walletAddress: string;
    network: string;
    sourceAmount: string;
    sourceCurrency: string;
    destinationCurrency: string;
    paymentToken: string;
    paymentLabel: string;
  };
  Checkout: {
    customerId: string;
    authToken: string;
    walletAddress: string;
    network: string;
    sessionId: string;
    sourceAmount: string;
    sourceCurrency: string;
    destinationCurrency: string;
    paymentLabel: string;
  };
  Success: {
    transactionId?: string;
    destinationAmount?: string;
    destinationCurrency?: string;
    /** Passed from CheckoutScreen so the user can start another purchase
     *  without going through sign-in or KYC again. */
    customerId?: string;
    authToken?: string;
    walletAddress?: string;
    network?: string;
  };
};
