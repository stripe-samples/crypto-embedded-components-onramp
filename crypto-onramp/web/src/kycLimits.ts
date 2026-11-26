/**
 * Hardcoded transaction limits used when Settings → Limit Source is set to
 * "Local Config". These exist so merchants can explore the KYC step-up flow
 * without needing a live Stripe account.
 *
 * Mirrors src/kycLimits.ts in react-native-expo.
 *
 *   L0 — $300  → triggers step-up when buying more than $300
 *   L1 — $800  → triggers step-up when buying more than $800
 *   L2 — $1500 → highest tier, no step-up available
 *
 * To use real limits: set "Limit Source → API" in Settings.
 */

export const LOCAL_LIMITS: Record<"L0" | "L1" | "L2", { limit: number }> = {
  L0: { limit: 300 },
  L1: { limit: 800 },
  L2: { limit: 1500 },
};
