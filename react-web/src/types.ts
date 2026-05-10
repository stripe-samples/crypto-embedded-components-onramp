export type AccountStatus = "idle" | "exists" | "not_found";

export type KycLevel = "REQUIRES_KYC" | "L0" | "L1" | "L2" | "REJECTED" | "PENDING";

export type Wallet = {
  id: string;
  network: string;
  wallet_address: string;
};

export type OnrampSession = {
  id: string;
  livemode: boolean;
  source_total_amount: string;
  transaction_details: {
    destination_amount: string;
    destination_currency: string;
    destination_network: string;
    wallet_address: string;
    quote_expiration?: string;
    fees: {
      network_fee_amount: string;
      transaction_fee_amount: string;
    };
  };
};
