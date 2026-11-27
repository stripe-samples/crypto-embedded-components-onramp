/**
 * Hardcoded transaction limits used when Settings → Limit Source is set to
 * "Local Config". These exist so merchants can explore the KYC step-up flow
 * without needing a live Stripe account.
 *
 * The Stripe transaction limits API (GET /v1/crypto/onramp_transaction_limits) returns
 * per-transaction maximums for each payment method and settlement speed, e.g.:
 *
 *   {
 *     limits: {
 *       "usd.fiat": {
 *         card: [{ limit: 3000, settlement_speed: "instant" }],
 *         us_bank_account: [{ limit: 5000, settlement_speed: "standard" }]
 *       }
 *     }
 *   }
 *
 * These are NOT rolling-period balances — they are the ceiling for any single
 * transaction at the customer's current KYC tier. Higher tiers mean higher
 * ceilings. The local limits below simulate that behaviour:
 *
 *   L0 — low ceiling ($300) → triggers step-up when buying more than $300
 *   L1 — medium ceiling ($800)
 *   L2 — high ceiling ($1500)
 *
 * To trigger the step-up demo: set tier to L0 and try purchasing > $300.
 * To use real limits: toggle "Limit Source → API" in the Settings screen.
 */

import { KycTier } from './context/SettingsContext';

export interface TransactionLimits {
  /** Per-transaction maximum for card instant settlement in USD. */
  limit: number;
}

export const LOCAL_LIMITS: Record<KycTier, TransactionLimits> = {
  // Try buying > $300 to see the L0 → L1 step-up flow.
  L0: { limit: 300 },
  // Try buying > $800 to see the L1 → L2 step-up flow.
  L1: { limit: 800 },
  // Highest tier — no step-up available.
  L2: { limit: 1500 },
};
