import type Stripe from 'stripe';
import { vi } from 'vitest';

import type { AppConfig } from '../src/config.js';

export const testConfig: AppConfig = {
  corsAllowedOrigins: ['https://example.com'],
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
  const stripeFactory = vi.fn(
    () =>
      ({
        crypto: {
          customers: {
            retrieve: retrieveCustomer,
          },
        },
      }) as unknown as Stripe,
  );

  return {
    retrieveCustomer,
    stripeFactory,
  };
}
