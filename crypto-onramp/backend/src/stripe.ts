import Stripe from 'stripe';

export const STRIPE_API_VERSION = `${Stripe.API_VERSION};crypto_onramp_beta=v2` as Stripe.LatestApiVersion;

export type StripeFactory = (secretKey: string) => Stripe;

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
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
