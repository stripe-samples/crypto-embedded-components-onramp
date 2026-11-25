import Stripe from 'stripe';

export const STRIPE_API_VERSION = `${Stripe.API_VERSION};crypto_onramp_beta=v2` as Stripe.LatestApiVersion;

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}
