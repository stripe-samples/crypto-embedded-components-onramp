import Stripe from 'stripe';

import type { AppConfig } from './config.js';
import { upstreamApiError } from './errors.js';
import type { Mode } from './jwt.js';

export const STRIPE_API_VERSION = `${Stripe.API_VERSION};crypto_onramp_beta=v2` as Stripe.LatestApiVersion;

export type StripeFactory = (secretKey: string) => Stripe;

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}

export function stripeClientForMode(
  config: AppConfig,
  mode: Mode,
  stripeFactory: StripeFactory,
): Stripe {
  const selectedMode = mode === 'live' ? config.liveMode : config.testMode;
  if (!selectedMode) {
    throw upstreamApiError(new Error('Upstream mode is not configured.'));
  }
  return stripeFactory(selectedMode.secretKey);
}

export function stripeStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  return 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined;
}

export function stripeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  if ('code' in error && typeof error.code === 'string') {
    return error.code;
  }
  if (
    'raw' in error &&
    typeof error.raw === 'object' &&
    error.raw !== null &&
    'code' in error.raw &&
    typeof error.raw.code === 'string'
  ) {
    return error.raw.code;
  }
  return undefined;
}

export function isInvalidLinkAccessTokenError(error: unknown): boolean {
  if (
    stripeStatusCode(error) !== 403 ||
    typeof error !== 'object' ||
    error === null ||
    !('raw' in error) ||
    typeof error.raw !== 'object' ||
    error.raw === null
  ) {
    return false;
  }

  return (
    'message' in error.raw &&
    error.raw.message === 'The OAuth access token is invalid.'
  );
}
