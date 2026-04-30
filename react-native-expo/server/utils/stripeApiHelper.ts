import fetch, { Response } from 'node-fetch';
import { UserRecord } from '../db/store';
import { SERVICE_TIMEOUT_ERROR, QUOTE_EXPIRED_ERROR } from '../constants';

const RETRY_COUNT = 6;
const RETRY_DELAY_MS = 3000;

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const STRIPE_API = 'https://api.stripe.com/v1';
export const LINK_API = 'https://login.link.com/v1';
const STRIPE_VERSION = '2025-05-28.preview;crypto_onramp_beta=v2';

export async function stripeCallWithRefresh(
  path: string,
  bodyParams: URLSearchParams,
  record: UserRecord,
  method: string = 'POST',
): Promise<{ response: Response; data: any }> {
  const secretKey = STRIPE_SECRET_KEY!;
  const body = method === 'GET' ? undefined : bodyParams;

  const makeRequest = (oauthToken: string | null) => {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${secretKey}`,
      'Stripe-Version': STRIPE_VERSION,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (oauthToken) headers['Stripe-OAuth-Token'] = oauthToken;
    return fetch(`${STRIPE_API}${path}`, { method, headers, body: body?.toString() });
  };

  let response = await makeRequest(record.accessToken);
  let data = await response.json();

  if (response.status === 403 && data.error?.type === 'invalid_request_error' && record.refreshToken) {
    console.log(`[oauth] got 403 invalid_request_error, attempting token refresh for ${path}`);
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: record.refreshToken,
        client_id: OAUTH_CLIENT_ID!,
        client_secret: OAUTH_CLIENT_SECRET!,
      });
      const refreshRes = await fetch('https://login.link.com/auth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const refreshData = await refreshRes.json();
      if (refreshData.access_token) {
        record.accessToken = refreshData.access_token;
        if (refreshData.refresh?.refresh_token) record.refreshToken = refreshData.refresh.refresh_token;
        console.log(`[oauth] token refreshed successfully, retrying ${path}`);
        response = await makeRequest(record.accessToken);
        data = await response.json();
      }
    } catch (refreshError) {
      console.error('[oauth] token refresh failed:', refreshError);
    }
  }

  return { response, data };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function toUserError(data: any): string {
  return data?.error?.message ?? JSON.stringify(data);
}

function isRetryableError(data: any): boolean {
  const msg = data?.error?.message ?? '';
  if (typeof msg !== 'string') return false;
  return msg.includes(SERVICE_TIMEOUT_ERROR) || msg.includes(QUOTE_EXPIRED_ERROR);
}

// Retry on timeout and quote-expired errors — the service in test mode is not
// stable and timeouts can happen often. Quote expiry can also occur mid-retry.
export async function stripeCallWithRetry(
  path: string,
  bodyParams: URLSearchParams,
  record: UserRecord,
  method: string = 'POST',
  onBeforeRetry?: () => Promise<void>,
): Promise<{ response: Response; data: any }> {
  let result = await stripeCallWithRefresh(path, bodyParams, record, method);

  for (let attempt = 1; attempt <= RETRY_COUNT && !result.response.ok && isRetryableError(result.data); attempt++) {
    console.warn(`[stripe] ${path} retryable error, retrying (${attempt}/${RETRY_COUNT})...`);
    await sleep(RETRY_DELAY_MS);
    if (onBeforeRetry) await onBeforeRetry();
    result = await stripeCallWithRefresh(path, bodyParams, record, method);
  }

  return result;
}

export async function linkPost(path: string, body: object = {}): Promise<any> {
  const secretKey = STRIPE_SECRET_KEY!;
  const res = await fetch(`${LINK_API}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}
