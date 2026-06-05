export type AccountStatus = "idle" | "exists" | "not_found";

export type KycLevel = "REQUIRES_KYC" | "L0" | "L1" | "L2" | "REJECTED" | "PENDING";

export type KycRegion = "us" | "eu" | null;

export type Verification = {
  name: string;
  status: "verified" | "pending" | "not_started" | "rejected";
};

export type CustomerKycData = {
  kyc_level: KycLevel;
  kyc_region: KycRegion;
  kyc_tiers: Array<{ tier: string; verification_status: string }>;
  verifications: Verification[];
  provided_fields: string[];
};

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

export type MissingIdentifier = {
  type: string;
  regulation: string;
};

export type IdentifierAlternative = {
  original_missing_identifiers: string[];
  alternative_missing_identifiers: string[];
};

export type MissingIdentifiersResult = {
  carf_tin_required: boolean;
  identifiers: MissingIdentifier[];
  alternatives: IdentifierAlternative[];
};

export type UpdateKycInfoResult = {
  completed: boolean;
  carf_tin_required: boolean;
  identifiers: MissingIdentifier[];
  alternatives: IdentifierAlternative[];
  invalid_identifiers: string[];
};
