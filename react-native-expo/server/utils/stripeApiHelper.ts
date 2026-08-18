import Stripe from 'stripe';
import fetch from 'node-fetch';
import { UserRecord } from '../db/store';
import { SERVICE_TIMEOUT_ERROR, QUOTE_EXPIRED_ERROR } from '../constants';

const RETRY_COUNT = 6;
const RETRY_DELAY_MS = 3000;

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
export const LINK_API = 'https://login.link.com/v1';

export const stripe: Stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: `${Stripe.API_VERSION};crypto_onramp_beta=v2` as Stripe.LatestApiVersion,
});

// Login.link.com isn't a Stripe API host, so it has no stripe-node bindings —
// these calls stay on fetch.
export function requestOptions(oauthToken: string | null): Stripe.RequestOptions {
  return oauthToken ? { headers: { 'Stripe-OAuth-Token': oauthToken } } : {};
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function toUserError(error: any): string {
  return error?.message ?? String(error);
}

function isRetryableError(error: any): boolean {
  const msg = error?.message ?? '';
  if (typeof msg !== 'string') return false;
  return msg.includes(SERVICE_TIMEOUT_ERROR) || msg.includes(QUOTE_EXPIRED_ERROR);
}

async function callWithRefresh<T>(
  call: (oauthToken: string | null) => Promise<T>,
  record: UserRecord,
): Promise<T> {
  try {
    return await call(record.accessToken);
  } catch (error: any) {
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.statusCode === 403 &&
      record.refreshToken
    ) {
      console.log('[oauth] got 403 invalid_request_error, attempting token refresh');
      try {
        const secretKey = STRIPE_SECRET_KEY!;
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
        const refreshData: any = await refreshRes.json();
        if (refreshData.access_token) {
          record.accessToken = refreshData.access_token;
          if (refreshData.refresh?.refresh_token) record.refreshToken = refreshData.refresh.refresh_token;
          console.log('[oauth] token refreshed successfully, retrying request');
          return await call(record.accessToken);
        }
      } catch (refreshError) {
        console.error('[oauth] token refresh failed:', refreshError);
      }
    }
    throw error;
  }
}

// Retry on timeout and quote-expired errors — the service in test mode is not
// stable and timeouts can happen often. Quote expiry can also occur mid-retry.
export async function callWithRetry<T>(
  call: (oauthToken: string | null) => Promise<T>,
  record: UserRecord,
  onBeforeRetry?: () => Promise<void>,
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      return await callWithRefresh(call, record);
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_COUNT || !isRetryableError(error)) throw error;
      console.warn(`[stripe] retryable error, retrying (${attempt + 1}/${RETRY_COUNT})...`);
      await sleep(RETRY_DELAY_MS);
      if (onBeforeRetry) await onBeforeRetry();
    }
  }
  throw lastError;
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
