import { Router, type Request } from 'express';
import type Stripe from 'stripe';

import type { AppConfig } from '../config.js';
import { ApiError, upstreamApiError } from '../errors.js';
import { createJwtService, type Mode } from '../jwt.js';
import {
  authorizeSession,
  type OAuthCredentialsInput,
} from '../session-auth.js';
import {
  isInvalidLinkAccessTokenError,
  stripeErrorCode,
  stripeStatusCode,
  type StripeFactory,
} from '../stripe.js';
import { retrieveOAuthCredentials } from './link.js';

function stripeClient(
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

function stripeApiError(error: unknown): ApiError {
  if (isInvalidLinkAccessTokenError(error)) {
    return new ApiError(
      401,
      'link_reauthorization_required',
      'Link authorization must be renewed.',
    );
  }
  if (stripeStatusCode(error) === 400) {
    return new ApiError(
      400,
      stripeErrorCode(error) ?? 'invalid_request',
      'The request parameters were rejected.',
    );
  }
  return upstreamApiError(error);
}

async function stripeRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw stripeApiError(error);
  }
}

function requestOptions(accessToken: string): Stripe.RequestOptions {
  return { headers: { 'Stripe-OAuth-Token': accessToken } };
}

function transactionLimitFilters(query: Request['query']) {
  return {
    ...(typeof query.destination_network === 'string'
      ? { destination_network: query.destination_network }
      : {}),
    ...(typeof query.wallet_address === 'string'
      ? { wallet_address: query.wallet_address }
      : {}),
  };
}

export function createOnrampRouter(
  config: AppConfig,
  fetchImplementation: typeof globalThis.fetch,
  stripeFactory: StripeFactory,
): Router {
  const router = Router();
  const jwt = createJwtService(config.jwtSigningSecret);
  const getOAuthCredentials = (input: OAuthCredentialsInput) =>
    retrieveOAuthCredentials(config, input, fetchImplementation);

  router.get('/limits', async (request, response) => {
    const filters = transactionLimitFilters(request.query);
    const session = await authorizeSession(
      config,
      jwt,
      getOAuthCredentials,
      request.get('Authorization'),
    );
    const stripe = stripeClient(config, session.mode, stripeFactory);
    const limits = await stripeRequest(() =>
      stripe.crypto.onrampTransactionLimits.retrieve(
        {
          ...(request.ip === undefined
            ? {}
            : { customer_ip_address: request.ip }),
          ...filters,
        },
        requestOptions(session.accessToken),
      ),
    );
    if (
      limits.crypto_customer_id !== session.cryptoCustomerId ||
      limits.livemode !== (session.mode === 'live')
    ) {
      throw upstreamApiError(
        new Error('Stripe returned transaction limits for an unexpected session.'),
      );
    }
    response.status(200).json(limits);
  });

  return router;
}
