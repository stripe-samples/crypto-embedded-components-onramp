import type Stripe from 'stripe';
import { vi } from 'vitest';

import type { AppConfig } from '../src/config.js';

export const testConfig: AppConfig = {
  host: '127.0.0.1',
  jwtSigningSecret: 'a-secure-signing-secret-with-32-bytes',
  oauthClientId: 'ca_test_example',
  oauthClientSecret: 'oauth_secret_example',
  oauthScopes: 'auth.persist_login:read,crypto:ramp,kyc.status:read',
  port: 3001,
  testMode: {
    publishableKey: 'pk_test_example',
    secretKey: 'sk_test_example',
  },
  trustedProxyHops: 1,
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

export function createMockFetch() {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);

    if (url === 'https://login.link.com/v1/link_auth_intent') {
      return jsonResponse({ id: 'lai_example' });
    }
    if (url.endsWith('/v1/link_auth_intent/lai_example/tokens')) {
      return jsonResponse({
        access_token: 'liwltoken_example',
        expires_in: 3600,
      });
    }
    if (url === 'https://login.link.com/auth/token') {
      return jsonResponse({
        access_token: 'liwltoken_refreshed',
        expires_in: 3600,
      });
    }
    if (url === 'https://api.stripe.com/v1/link/auth_token') {
      return jsonResponse({
        expires_in: 900,
        token: 'lat_example_secret_example',
      });
    }

    throw new Error(`Unexpected fetch request: ${url}`);
  });
}

export function createMockStripeFactory() {
  const retrieveCustomer = vi.fn(
    async () =>
      ({
        id: 'crc_example',
        object: 'crypto.customer',
        kyc_region: 'us',
        provided_fields: ['first_name'],
      }),
  );
  const listConsumerWallets = vi.fn(async () => ({
    object: 'list' as const,
    data: [
      {
        id: 'ccw_example',
        object: 'crypto.consumer_wallet' as const,
        verified_ownership: true,
      },
    ],
    has_more: true,
    url: '/v1/crypto/customers/crc_example/crypto_consumer_wallets',
  }));
  const listPaymentTokens = vi.fn(async () => ({
    object: 'list' as const,
    data: [
      {
        id: 'cpt_example',
        object: 'crypto.payment_token' as const,
        type: 'card',
      },
    ],
    has_more: false,
    url: '/v1/crypto/customers/crc_example/payment_tokens',
  }));
  const retrieveTransactionLimits = vi.fn(async () => ({
    object: 'crypto.onramp_transaction_limits' as const,
    crypto_customer_id: 'crc_example',
    limits: {
      'usd.fiat': {
        card: [{ limit: 300_000, settlement_speed: 'instant' }],
      },
    },
    livemode: false,
  }));
  const onrampSession = () => ({
    client_secret: 'cos_example_secret_example',
    created: 1_795_555_200,
    crypto_customer_id: 'crc_example',
    id: 'cos_example',
    kyc_details_provided: true,
    livemode: false,
    metadata: null,
    object: 'crypto.onramp_session' as const,
    redirect_url: null,
    status: 'requires_payment',
    transaction_details: {
      destination_amount: '1.0',
      destination_currencies: ['eth'],
      destination_currency: 'eth',
      destination_network: 'ethereum',
      destination_networks: ['ethereum'],
      fees: null,
      lock_wallet_address: true,
      quote_expiration: 1_795_555_500,
      source_amount: '100',
      source_currency: 'usd',
      transaction_id: null,
      wallet_address: '0x1234',
      wallet_addresses: null,
    },
  });
  const createOnrampSession = vi.fn(async () => onrampSession());
  const retrieveOnrampSession = vi.fn(async () => onrampSession());
  const quoteOnrampSession = vi.fn(async () => onrampSession());
  const checkoutOnrampSession = vi.fn(async () => onrampSession());
  const stripeFactory = vi.fn(
    () =>
      ({
        crypto: {
          customers: {
            listConsumerWallets,
            listPaymentTokens,
            retrieve: retrieveCustomer,
          },
          onrampSessions: {
            checkout: checkoutOnrampSession,
            create: createOnrampSession,
            quote: quoteOnrampSession,
            retrieve: retrieveOnrampSession,
          },
          onrampTransactionLimits: { retrieve: retrieveTransactionLimits },
        },
      }) as unknown as Stripe,
  );

  return {
    checkoutOnrampSession,
    createOnrampSession,
    listConsumerWallets,
    listPaymentTokens,
    quoteOnrampSession,
    retrieveCustomer,
    retrieveOnrampSession,
    retrieveTransactionLimits,
    stripeFactory,
  };
}
