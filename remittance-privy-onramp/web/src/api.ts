import { API_URL } from './constants';
import type {
  ApiResult,
  AuthIntentResponse,
  CreateRemittanceResponse,
  OnrampCustomerResponse,
  OnrampSessionResponse,
  QuoteResponse,
  RemittanceResponse,
  RemittanceWalletResponse,
  SaveUserResponse,
  TransactionLimitsResponse,
} from './types';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function post<T>(
  path: string,
  body: object,
  authToken?: string,
): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as T & { error?: string; message?: string; code?: string };
    if (!response.ok) {
      return {
        success: false,
        error: {
          code: data.code ?? `HTTP_${response.status}`,
          message: data.error ?? data.message ?? JSON.stringify(data),
        },
      };
    }
    return { success: true, data };
  } catch (error) {
    return { success: false, error: { code: 'NETWORK_ERROR', message: errorMessage(error) } };
  }
}

async function get<T>(
  path: string,
  authToken?: string,
  params?: URLSearchParams,
): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const query = params?.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${API_URL}${path}${query}`, { headers });
    const data = (await response.json()) as T & { error?: string; message?: string };
    if (!response.ok) {
      return {
        success: false,
        error: {
          code: `HTTP_${response.status}`,
          message: data.error ?? data.message ?? JSON.stringify(data),
        },
      };
    }
    return { success: true, data };
  } catch (error) {
    return { success: false, error: { code: 'NETWORK_ERROR', message: errorMessage(error) } };
  }
}

export function createAuthIntent(authToken: string): Promise<ApiResult<AuthIntentResponse>> {
  return post('/v1/auth/create', { oauth_scopes: 'kyc.status:read,crypto:ramp' }, authToken);
}

export function saveUser(
  cryptoCustomerId: string,
  authToken: string,
): Promise<ApiResult<SaveUserResponse>> {
  return post('/v1/auth/save_user', { crypto_customer_id: cryptoCustomerId }, authToken);
}

export function attachRemittanceWallet(
  authToken: string,
  params: {
    walletAddress: string;
    privyUserId: string;
    privyWalletId: string;
    network: string;
  },
): Promise<ApiResult<RemittanceWalletResponse>> {
  return post('/v1/remittance_wallet', {
    wallet_address: params.walletAddress,
    privy_user_id: params.privyUserId,
    privy_wallet_id: params.privyWalletId,
    network: params.network,
  }, authToken);
}

export function getOnrampCustomer(
  customerId: string,
  authToken: string,
): Promise<ApiResult<OnrampCustomerResponse>> {
  return get(`/v1/onramp/customer/${customerId}`, authToken);
}

export function getTransactionLimits(
  authToken: string,
  params: {
    walletAddress?: string;
    destinationNetwork?: string;
  },
): Promise<ApiResult<TransactionLimitsResponse>> {
  const query = new URLSearchParams();
  if (params.walletAddress) query.append('wallet_address', params.walletAddress);
  if (params.destinationNetwork) query.append('destination_network', params.destinationNetwork);
  return get('/v1/onramp/limits', authToken, query);
}

export function createRemittance(params: {
  paymentToken: string;
  walletAddress: string;
  customerId: string;
  authToken: string;
  destinationNetwork: string;
  sourceAmount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  payoutDestinationAddress: string;
}): Promise<ApiResult<CreateRemittanceResponse>> {
  return post(
    '/v1/remittances',
    {
      ui_mode: 'headless',
      payment_token: params.paymentToken,
      source_amount: params.sourceAmount,
      source_currency: params.sourceCurrency,
      destination_currency: params.destinationCurrency,
      destination_network: params.destinationNetwork,
      destination_networks: [params.destinationNetwork],
      wallet_address: params.walletAddress,
      payout_destination_address: params.payoutDestinationAddress,
      crypto_customer_id: params.customerId,
      customer_ip_address: '127.0.0.1',
    },
    params.authToken,
  );
}

export function refreshQuote(
  remittanceId: string,
  authToken: string,
): Promise<ApiResult<QuoteResponse>> {
  return post(`/v1/remittances/${remittanceId}/quote`, {}, authToken);
}

export function checkoutSession(
  remittanceId: string,
  authToken: string,
): Promise<ApiResult<OnrampSessionResponse>> {
  return post(`/v1/remittances/${remittanceId}/checkout`, {}, authToken);
}

export function getRemittance(
  remittanceId: string,
  authToken: string,
): Promise<ApiResult<RemittanceResponse>> {
  return get(`/v1/remittances/${remittanceId}`, authToken, new URLSearchParams({ sync: 'stripe' }));
}

export function triggerRemittanceTransfer(params: {
  remittanceId: string;
  authToken: string;
  amount: string;
  currency: string;
}): Promise<ApiResult<RemittanceResponse>> {
  return post(
    `/v1/remittances/${params.remittanceId}/transfer`,
    {
      amount: params.amount,
      currency: params.currency,
    },
    params.authToken,
  );
}
