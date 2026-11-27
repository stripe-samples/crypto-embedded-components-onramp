/**
 * API client for Crypto Embedded Components Onramp Example
 */

import { Platform } from 'react-native';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_API_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3001'
  : 'http://localhost:3001';

const CONFIGURED_API_URL = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
const API_URL = (CONFIGURED_API_URL || DEFAULT_API_URL).replace(/\/$/, '');

// ============================================================================
// Response Types
// ============================================================================

export interface PublicConfig {
  link_sso_enabled: boolean;
  livemode: boolean;
  publishable_key: string;
  supported_modes: ('test' | 'live')[];
}

export interface AuthIntentResponse {
  authIntentId: string;
  flowToken: string;
}

export interface KycTierEntry {
  tier: 'l0' | 'l1' | 'l2';
  verification_status: 'not_started' | 'pending' | 'rejected' | 'verified' | 'not_available';
  verification_errors?: string[];
}

export interface CryptoCustomerResponse {
  customerId: string;
  livemode: boolean;
  kyc_level: string;
  kyc_region: string | null;
  kycTiers: KycTierEntry[];
  verifications: { name: string; status: string; errors: string[] }[];
  provided_fields: string[];
}

interface RawCryptoCustomerResponse {
  id: string;
  livemode: boolean;
  kyc_region?: string | null;
  kyc_tiers?: KycTierEntry[];
  verifications?: { name: string; status: string; errors: string[] }[];
  provided_fields?: string[];
}

/**
 * Derive the customer's current KYC tier from the authoritative `kyc_tiers`
 * array returned by GET /v1/crypto/customers/{id}.
 *
 * "Current tier" = the highest tier where verification_status is in
 * ['pending', 'rejected', 'verified']. Uses kyc_tiers instead of the
 * verifications array because kyc_verified can be non-not_started even for
 * L0 customers, making verifications unreliable for tier determination.
 *
 * Reference: https://docs.stripe.com/crypto/onramp/kyc-integration-guide
 */
export function deriveCurrentTier(kycTiers: KycTierEntry[]): 'l0' | 'l1' | 'l2' {
  const attempted = ['pending', 'rejected', 'verified'];
  const find = (t: string) => kycTiers.find(k => k.tier === t)?.verification_status ?? 'not_started';
  if (attempted.includes(find('l2'))) return 'l2';
  if (attempted.includes(find('l1'))) return 'l1';
  return 'l0';
}

export interface WalletInfo {
  id: string;
  network: string;
  wallet_address: string;
  verified_ownership?: boolean;
}

export interface WalletsResponse {
  data: WalletInfo[];
}

export interface PaymentTokenInfo {
  id: string;
  type: string;
  card?: { brand?: string; last4?: string; funding: string };
  us_bank_account?: { last4?: string; bank_name?: string };
}

export interface PaymentTokensResponse {
  data: PaymentTokenInfo[];
}

/**
 * A single per-transaction limit entry returned by the Stripe API.
 */
export interface LimitEntry {
  /** Maximum transaction amount in the fiat currency (e.g. USD). */
  limit: number;
  settlement_speed: 'instant' | 'standard';
}

/** Limits for USD fiat — supports card and ACH bank account. */
export interface UsdFiatLimits {
  card?: LimitEntry[];
  us_bank_account?: LimitEntry[];
}

/** Limits for EUR fiat — card only (bank account not supported). */
export interface EurFiatLimits {
  card?: LimitEntry[];
}

/**
 * Returned by GET /v1/crypto/onramp_transaction_limits.
 *
 * Each entry in `limits` is an array because a single payment method can
 * have different limits per settlement speed.
 *
 * Example:
 *   limits["usd.fiat"].card = [{ limit: 3000, settlement_speed: "instant" }]
 *   limits["usd.fiat"].us_bank_account = [
 *     { limit: 5000, settlement_speed: "standard" },
 *     { limit: 1000, settlement_speed: "instant" }
 *   ]
 *
 * These are per-transaction maximums determined by the customer's KYC tier.
 * A user with no KYC will have lower limits; completing L1/L2 increases them.
 */
export interface TransactionLimitsResponse {
  object: string;
  crypto_customer_id?: string;
  livemode: boolean;
  limits: {
    'usd.fiat'?: UsdFiatLimits;
    'eur.fiat'?: EurFiatLimits;
  };
}

export const WALLET_OWNERSHIP_VERIFICATION_REQUIRED = 'wallet_ownership_verification_required';

export interface OnrampSessionResponse {
  id: string;
  client_secret: string;
  status?: string;
  transaction_details?: {
    last_error?: string;
    wallet_address?: string;
    destination_network?: string;
  };
  /**
   * Present when the session requires additional verification before the
   * transaction can be processed.
   *
   * Merchant note: check `next_action.required_verifications` after creating
   * a session. If it is non-empty the user must complete the listed step-up
   * verifications before checkout can proceed.
   *
   * See: https://docs.stripe.com/crypto/onramp/kyc-integration-guide#interpret-limit-errors-from-cryptoonrampsession
   */
  next_action?: {
    type?: string;
    required_verifications?: ('kyc_verified' | 'id_document_verified')[];
  };
}

export interface QuoteResponse {
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
      // Present only when the session's fee_responsibility != "consumer".
      subsidy?: {
        original_fee: string;
        total_fee_after_subsidization: string;
      };
    } | null;
  };
}

// ============================================================================
// Error Types
// ============================================================================

export interface APIError {
  code: string;
  message: string;
}

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: APIError };

const authorizationErrorCodes = new Set([
  'invalid_session_token',
  'link_authorization_required',
  'link_reauthorization_required',
]);

let authorizationRequiredHandler: (() => void) | undefined;

export function isAuthorizationRequiredError(error: APIError): boolean {
  return authorizationErrorCodes.has(error.code);
}

export function setAuthorizationRequiredHandler(handler: () => void): () => void {
  authorizationRequiredHandler = handler;
  return () => {
    if (authorizationRequiredHandler === handler) {
      authorizationRequiredHandler = undefined;
    }
  };
}

function apiFailure(code: string, message: string): { success: false; error: APIError } {
  const error = { code, message };
  if (isAuthorizationRequiredError(error)) {
    authorizationRequiredHandler?.();
  }
  return { success: false, error };
}

// ============================================================================
// HTTP Helpers
// ============================================================================

async function post<T>(
  path: string,
  body: object,
  bearerToken?: string,
): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = data?.error?.message ?? `Request failed with status ${res.status}.`;
      const code = data?.error?.code ?? 'request_failed';
      console.error(`[API] ${path} failed (${res.status}):`, JSON.stringify(data));
      return apiFailure(code, message);
    }
    return { success: true, data };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'The request failed.';
    return { success: false, error: { code: 'network_error', message } };
  }
}

async function get<T>(
  path: string,
  sessionToken?: string,
  params?: URLSearchParams,
): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = {};
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
    const query = params?.toString() ? `?${params.toString()}` : '';

    const res = await fetch(`${API_URL}${path}${query}`, { method: 'GET', headers });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = data?.error?.message ?? `Request failed with status ${res.status}.`;
      const code = data?.error?.code ?? 'request_failed';
      console.error(`[API] ${path} failed (${res.status}):`, JSON.stringify(data));
      return apiFailure(code, message);
    }
    return { success: true, data };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'The request failed.';
    return { success: false, error: { code: 'network_error', message } };
  }
}

// ============================================================================
// Auth API
// ============================================================================

export function getPublicConfig(): Promise<ApiResult<PublicConfig>> {
  return get('/config', undefined, new URLSearchParams({ livemode: 'false' }));
}

export async function createAuthIntent(
  email: string,
): Promise<ApiResult<AuthIntentResponse>> {
  const result = await post<{ auth_intent_id: string; flow_token: string }>(
    '/link/auth_intent',
    { email, livemode: false },
  );
  if (!result.success) return result;
  return {
    success: true,
    data: {
      authIntentId: result.data.auth_intent_id,
      flowToken: result.data.flow_token,
    },
  };
}

export async function completeAuthIntent(
  flowToken: string,
  cryptoCustomerId: string,
): Promise<ApiResult<{ sessionToken: string }>> {
  const result = await post<{ session_token: string }>(
    '/link/auth_intent/complete',
    { crypto_customer_id: cryptoCustomerId },
    flowToken,
  );
  if (!result.success) return result;
  return { success: true, data: { sessionToken: result.data.session_token } };
}

// ============================================================================
// Crypto Customer API
// ============================================================================

export async function getCryptoCustomer(
  customerId: string,
  sessionToken: string,
): Promise<ApiResult<CryptoCustomerResponse>> {
  const result = await get<RawCryptoCustomerResponse>(
    `/customers/${customerId}`,
    sessionToken,
  );
  if (!result.success) return result;

  const kycTiers = result.data.kyc_tiers ?? [];
  const inactiveStatuses = ['not_available', 'not_started'];
  const statusOf = (tier: string) =>
    kycTiers.find(candidate => candidate.tier === tier)?.verification_status ?? 'not_started';

  let kycLevel: CryptoCustomerResponse['kyc_level'];
  if (kycTiers.some(tier => tier.verification_status === 'pending')) {
    kycLevel = 'PENDING';
  } else if (kycTiers.every(tier => inactiveStatuses.includes(tier.verification_status))) {
    kycLevel = 'REQUIRES_KYC';
  } else {
    const currentTier = deriveCurrentTier(kycTiers);
    const currentStatus = statusOf(currentTier);
    kycLevel = currentStatus === 'verified'
      ? currentTier.toUpperCase()
      : currentStatus === 'rejected'
        ? 'REJECTED'
        : 'REQUIRES_KYC';
  }

  return {
    success: true,
    data: {
      customerId: result.data.id,
      livemode: result.data.livemode,
      kyc_level: kycLevel,
      kyc_region: result.data.kyc_region ?? null,
      kycTiers,
      verifications: result.data.verifications ?? [],
      provided_fields: result.data.provided_fields ?? [],
    },
  };
}

export async function getCustomerWallets(
  customerId: string,
  sessionToken: string,
): Promise<ApiResult<WalletsResponse>> {
  return get(`/customers/${customerId}/wallets`, sessionToken);
}

export async function getPaymentTokens(
  customerId: string,
  sessionToken: string,
): Promise<ApiResult<PaymentTokensResponse>> {
  return get(`/customers/${customerId}/payment_tokens`, sessionToken);
}

// ============================================================================
// Onramp API
// ============================================================================

export async function createOnrampSession(params: {
  paymentToken: string;
  walletAddress: string;
  customerId: string;
  sessionToken: string;
  destinationNetwork: string;
  sourceAmount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  /** Who bears the transaction fees for this session. Defaults to 'consumer'. */
  feeResponsibility?: 'consumer' | 'merchant';
}): Promise<ApiResult<OnrampSessionResponse>> {
  return post(
    '/onramp/sessions',
    {
      payment_token: params.paymentToken,
      source_amount: params.sourceAmount,
      source_currency: params.sourceCurrency,
      destination_currency: params.destinationCurrency,
      destination_network: params.destinationNetwork,
      wallet_address: params.walletAddress,
      crypto_customer_id: params.customerId,
      ...(params.feeResponsibility === 'merchant' ? { fee_responsibility: 'merchant' } : {}),
    },
    params.sessionToken,
  );
}

export async function refreshQuote(
  sessionId: string,
  sessionToken: string,
): Promise<ApiResult<QuoteResponse>> {
  return post(`/onramp/sessions/${sessionId}/quote`, {}, sessionToken);
}

export async function checkoutSession(
  sessionId: string,
  sessionToken: string,
): Promise<ApiResult<OnrampSessionResponse>> {
  return post(`/onramp/sessions/${sessionId}/checkout`, {}, sessionToken);
}

/**
 * Fetch the customer's per-transaction limits from Stripe.
 *
 * Stripe API: GET /v1/crypto/onramp_transaction_limits
 *
 * Returns the maximum amounts the customer is allowed to transact per payment
 * method and settlement speed, based on their current KYC tier. These are
 * NOT rolling-period balances — they are the ceiling for any single
 * transaction at the customer's current verification level.
 *
 * Pass wallet_address and destination_network for more accurate limits
 * (some networks or wallet types have different ceilings).
 *
 * Compare the card instant limit against the user's requested source amount
 * before creating a session to detect step-up requirements proactively.
 */
export async function getTransactionLimits(
  sessionToken: string,
  params?: {
    walletAddress?: string;
    destinationNetwork?: string;
  },
): Promise<ApiResult<TransactionLimitsResponse>> {
  const qs = new URLSearchParams();
  if (params?.walletAddress) qs.append('wallet_address', params.walletAddress);
  if (params?.destinationNetwork) qs.append('destination_network', params.destinationNetwork);
  return get('/onramp/limits', sessionToken, qs);
}
