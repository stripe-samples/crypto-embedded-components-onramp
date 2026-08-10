export type PayoutMode = 'hold_in_wallet' | 'auto_send_to_payout';

export type AppStep =
  | 'landing'
  | 'auth'
  | 'kycPrimer'
  | 'kyc'
  | 'address'
  | 'transfer'
  | 'wallet'
  | 'payment'
  | 'kycStepUp'
  | 'review'
  | 'tracker';

export type KycTier = 'L0' | 'L1' | 'L2';

export type KycTierEntry = {
  tier: 'l0' | 'l1' | 'l2';
  verification_status: 'not_started' | 'pending' | 'rejected' | 'verified' | 'not_available';
  verification_errors?: string[];
};

export type OnrampCustomerResponse = {
  customerId: string;
  providedFields: string[];
  kycStatus: string;
  idDocStatus: string;
  kycTiers: KycTierEntry[];
};

export type TransactionLimitsResponse = {
  object: string;
  crypto_customer_id?: string;
  livemode: boolean;
  limits: {
    'usd.fiat'?: {
      card?: Array<{
        limit: number;
        settlement_speed: 'instant' | 'standard';
      }>;
    };
  };
};

export type KycForm = {
  firstName: string;
  lastName: string;
  ssn: string;
  dobMonth: string;
  dobDay: string;
  dobYear: string;
};

export type AddressForm = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
};

export type TransferIntent = {
  amountUsd: string;
  recipientName: string;
  recipientDestination: string;
  payoutCountry: string;
  payoutMode: PayoutMode;
};

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

export type ApiError = {
  code: string;
  message: string;
};

export type AuthIntentResponse = {
  authIntentId: string;
};

export type SaveUserResponse = {
  success: boolean;
};

export type RemittanceWalletResponse = {
  walletAddress: string;
  network: string;
  status: 'ready';
};

export type OnrampSessionResponse = {
  id: string;
  client_secret: string;
  status?: string;
};

export type RemittanceStatus =
  | 'onramp_session_created'
  | 'onramp_fulfilled'
  | 'transfer_submitted'
  | 'transfer_failed';

export type RemittanceResponse = {
  id: string;
  onrampSessionId: string;
  status: RemittanceStatus;
  walletAddress: string;
  network: string;
  transferHash?: string;
  error?: string;
  stripeStatus?: string;
};

export type CreateRemittanceResponse = RemittanceResponse & {
  onrampSession: OnrampSessionResponse;
};

export type QuoteResponse = {
  id: string;
  status: string;
  transaction_details: {
    source_amount: string;
    source_currency: string;
    destination_amount: string;
    destination_currency: string;
    destination_network: string;
    wallet_address: string;
    quote_expiration: number;
    fees: {
      network_fee_amount: string | null;
      transaction_fee_amount: string | null;
    } | null;
  };
};
