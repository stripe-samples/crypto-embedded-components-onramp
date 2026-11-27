import type { CustomerKycData, KycLevel, KycTier } from "./types";

type RawCustomer = Omit<CustomerKycData, "kyc_level">;

const inactiveStatuses = new Set(["not_available", "not_started"]);
const attemptedStatuses = new Set(["pending", "rejected", "verified"]);

export function customerKycData(customer: RawCustomer): CustomerKycData {
  const tiers = customer.kyc_tiers ?? [];
  const statusOf = (tier: string) =>
    tiers.find((candidate: KycTier) => candidate.tier === tier)
      ?.verification_status ?? "not_started";

  let kycLevel: KycLevel;
  if (tiers.some((tier) => tier.verification_status === "pending")) {
    kycLevel = "PENDING";
  } else if (
    tiers.every((tier) => inactiveStatuses.has(tier.verification_status))
  ) {
    kycLevel = "REQUIRES_KYC";
  } else {
    const currentTier = attemptedStatuses.has(statusOf("l2"))
      ? "l2"
      : attemptedStatuses.has(statusOf("l1"))
        ? "l1"
        : "l0";
    const currentStatus = statusOf(currentTier);
    if (currentStatus === "verified") {
      kycLevel = currentTier.toUpperCase() as "L0" | "L1" | "L2";
    } else if (currentStatus === "rejected") {
      kycLevel = "REJECTED";
    } else {
      kycLevel = "REQUIRES_KYC";
    }
  }

  return {
    ...customer,
    kyc_level: kycLevel,
    kyc_region: customer.kyc_region ?? null,
    kyc_tiers: tiers,
    provided_fields: customer.provided_fields ?? [],
    verifications: customer.verifications ?? [],
  };
}
