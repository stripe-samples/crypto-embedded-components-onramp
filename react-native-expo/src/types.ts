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
  Auth: undefined;
  Register: { email: string; authToken: string };
  KYCPrimer: { customerId: string; authToken: string };
  KYC: { customerId: string; authToken: string };
  Address: {
    customerId: string;
    authToken: string;
    firstName: string;
    lastName: string;
    idNumber: string;
    dobDay: number;
    dobMonth: number;
    dobYear: number;
  };
  Wallet: { customerId: string; authToken: string };
  PaymentMethod: {
    customerId: string;
    authToken: string;
    walletAddress: string;
    network: string;
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
  };
};
