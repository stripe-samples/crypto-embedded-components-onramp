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

export interface CryptoCustomerResponse {
  customerId: string;
  providedFields: string[];
  kycStatus: string;
  idDocStatus: string;
}

export interface WalletInfo {
  id: string;
  network: string;
  wallet_address: string;
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

export interface OnrampSessionResponse {
  id: string;
  client_secret: string;
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
      console.error(`[API] ${path} failed (${res.status}):`, JSON.stringify(data));
      return { success: false, error: { code: `HTTP_${res.status}`, message } };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: { code: 'NETWORK_ERROR', message: err.message } };
  }
}

async function get<T>(
  path: string,
  authToken?: string,
): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(`${API_URL}${path}`, { method: 'GET', headers });
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
