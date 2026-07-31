/**
 * API client for Crypto Embedded Components Onramp Example
 */

import { Platform } from 'react-native';

// ============================================================================
// Configuration
// ============================================================================

const API_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3001'
  : 'http://localhost:3001';

// ============================================================================
// Response Types
// ============================================================================

export interface AuthResponse {
  token: string;
}

export interface AuthIntentResponse {
  authIntentId: string;
  token?: string;
}

export interface SaveUserResponse {
  success: boolean;
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
  verifications: Array<{ name: string; status: string; errors: string[] }>;
  provided_fields: string[];
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
    required_verifications?: Array<'kyc_verified' | 'id_document_verified'>;
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

// ============================================================================
// HTTP Helpers
// ============================================================================

async function post<T>(
  path: string,
  body: object,
  authToken?: string,
): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      const message = data.error ?? data.message ?? JSON.stringify(data);
      const code = data.code ?? `HTTP_${res.status}`;
      console.error(`[API] ${path} failed (${res.status}):`, JSON.stringify(data));
      return { success: false, error: { code, message } };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: { code: 'NETWORK_ERROR', message: err.message } };
  }
}

async function get<T>(
  path: string,
  authToken?: string,
  params?: URLSearchParams,
): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const query = params?.toString() ? `?${params.toString()}` : '';

    const res = await fetch(`${API_URL}${path}${query}`, { method: 'GET', headers });
    const data = await res.json();
    if (!res.ok) {
      const message = data.error ?? data.message ?? JSON.stringify(data);
      console.error(`[API] ${path} failed (${res.status}):`, JSON.stringify(data));
      return { success: false, error: { code: `HTTP_${res.status}`, message } };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: { code: 'NETWORK_ERROR', message: err.message } };
  }
}

// ============================================================================
// Auth API
// ============================================================================

export async function signup(
  email: string,
  password: string,
): Promise<ApiResult<AuthResponse>> {
  return post('/v1/auth/signup', { email, password });
}

export async function login(
  email: string,
  password: string,
): Promise<ApiResult<AuthResponse>> {
  return post('/v1/auth/login', { email, password });
}

export async function createAuthIntent(
  authToken: string,
  oauthScopes = 'kyc.status:read,crypto:ramp',
): Promise<ApiResult<AuthIntentResponse>> {
  const res = await post<any>('/v1/auth/create', { oauth_scopes: oauthScopes }, authToken);
  if (!res.success) return res;
  return { success: true, data: { authIntentId: res.data.authIntentId, token: res.data.token } };
}

export async function saveUser(
  cryptoCustomerId: string,
  authToken: string,
): Promise<ApiResult<SaveUserResponse>> {
  return post('/v1/auth/save_user', { crypto_customer_id: cryptoCustomerId }, authToken);
}

// ============================================================================
// Crypto Customer API
// ============================================================================

export async function getCryptoCustomer(
  customerId: string,
  authToken: string,
): Promise<ApiResult<CryptoCustomerResponse>> {
  return get(`/v1/crypto_customer/${customerId}`, authToken);
}

export async function getCustomerWallets(
  customerId: string,
  authToken: string,
): Promise<ApiResult<WalletsResponse>> {
  return get(`/v1/crypto_customer/${customerId}/wallets`, authToken);
}

export async function getPaymentTokens(
  customerId: string,
  authToken: string,
): Promise<ApiResult<PaymentTokensResponse>> {
  return get(`/v1/crypto_customer/${customerId}/payment_tokens`, authToken);
}

// ============================================================================
// Onramp API
// ============================================================================

export async function createOnrampSession(params: {
  paymentToken: string;
  walletAddress: string;
  customerId: string;
  authToken: string;
  destinationNetwork: string;
  sourceAmount: number;
  sourceCurrency: string;
  destinationCurrency: string;
}): Promise<ApiResult<OnrampSessionResponse>> {
  return post(
    '/v1/create_onramp_session',
    {
      ui_mode: 'headless',
      payment_token: params.paymentToken,
      source_amount: params.sourceAmount,
      source_currency: params.sourceCurrency,
      destination_currency: params.destinationCurrency,
      destination_network: params.destinationNetwork,
      destination_networks: [params.destinationNetwork],
      wallet_address: params.walletAddress,
      crypto_customer_id: params.customerId,
      customer_ip_address: '127.0.0.1',
    },
    params.authToken,
  );
}

export async function refreshQuote(
  sessionId: string,
  authToken: string,
): Promise<ApiResult<QuoteResponse>> {
  return post('/v1/refresh_quote', { cos_id: sessionId }, authToken);
}

export async function checkoutSession(
  sessionId: string,
  authToken: string,
): Promise<ApiResult<OnrampSessionResponse>> {
  return post('/v1/checkout', { cos_id: sessionId }, authToken);
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
  authToken: string,
  params?: {
    walletAddress?: string;
    destinationNetwork?: string;
  },
): Promise<ApiResult<TransactionLimitsResponse>> {
  const qs = new URLSearchParams();
  if (params?.walletAddress) qs.append('wallet_address', params.walletAddress);
  if (params?.destinationNetwork) qs.append('destination_network', params.destinationNetwork);
  return get('/v1/crypto/onramp_transaction_limits', authToken, qs);
}
