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
import { parseCryptoCustomerId } from '../validation.js';
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

function customerApiError(error: unknown): ApiError {
  if (isInvalidLinkAccessTokenError(error)) {
    return new ApiError(
      401,
      'link_reauthorization_required',
      'Link authorization must be renewed.',
    );
  }

  switch (stripeStatusCode(error)) {
    case 400:
      return new ApiError(
        400,
        stripeErrorCode(error) ?? 'invalid_request',
        'The request parameters were rejected.',
      );
    case 403:
    case 404:
      return new ApiError(
        403,
        'customer_not_authorized',
        'The CryptoCustomer is not authorized for this session.',
      );
    default:
      return upstreamApiError(error);
  }
}

async function stripeRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw customerApiError(error);
  }
}

function requestOptions(accessToken: string): Stripe.RequestOptions {
  return { headers: { 'Stripe-OAuth-Token': accessToken } };
}

function pagination(query: Request['query']) {
  const limit = query.limit === undefined ? undefined : Number(query.limit);
  if (
    limit !== undefined &&
    (typeof query.limit !== 'string' ||
      !Number.isFinite(limit) ||
      !Number.isInteger(limit))
  ) {
    throw new ApiError(400, 'invalid_request', 'limit must be an integer.');
  }

  return {
    ...(limit === undefined ? {} : { limit }),
    ...(typeof query.starting_after === 'string'
      ? { starting_after: query.starting_after }
      : {}),
  };
}

export function createCustomersRouter(
  config: AppConfig,
  fetchImplementation: typeof globalThis.fetch,
  stripeFactory: StripeFactory,
): Router {
  const router = Router();
  const jwt = createJwtService(config.jwtSigningSecret);
  const getOAuthCredentials = (input: OAuthCredentialsInput) =>
    retrieveOAuthCredentials(config, input, fetchImplementation);
  const authorize = (
    authorization: string | undefined,
    expectedCryptoCustomerId: string,
  ) =>
    authorizeSession(
      config,
      jwt,
      getOAuthCredentials,
      authorization,
      expectedCryptoCustomerId,
    );

  router.get('/:customer_id', async (request, response) => {
    const cryptoCustomerId = parseCryptoCustomerId(request.params.customer_id);
    const session = await authorize(
      request.get('Authorization'),
      cryptoCustomerId,
    );
    const stripe = stripeClient(config, session.mode, stripeFactory);
    const customer = await stripeRequest(() =>
      stripe.crypto.customers.retrieve(
        cryptoCustomerId,
        {},
        requestOptions(session.accessToken),
      ),
    );
    if (customer.id !== session.cryptoCustomerId) {
      throw upstreamApiError(
        new Error('Stripe returned an unexpected CryptoCustomer.'),
      );
    }
    response.status(200).json(customer);
  });

  router.get('/:customer_id/wallets', async (request, response) => {
    const cryptoCustomerId = parseCryptoCustomerId(request.params.customer_id);
    const page = pagination(request.query);
    const session = await authorize(
      request.get('Authorization'),
      cryptoCustomerId,
    );
    const stripe = stripeClient(config, session.mode, stripeFactory);
    const wallets = await stripeRequest(() =>
      stripe.crypto.customers.listConsumerWallets(
        cryptoCustomerId,
        page,
        requestOptions(session.accessToken),
      ),
    );
    response.status(200).json(wallets);
  });

  router.get('/:customer_id/payment_tokens', async (request, response) => {
    const cryptoCustomerId = parseCryptoCustomerId(request.params.customer_id);
    const page = pagination(request.query);
    const session = await authorize(
      request.get('Authorization'),
      cryptoCustomerId,
    );
    const stripe = stripeClient(config, session.mode, stripeFactory);
    const paymentTokens = await stripeRequest(() =>
      stripe.crypto.customers.listPaymentTokens(
        cryptoCustomerId,
        page,
        requestOptions(session.accessToken),
      ),
    );
    response.status(200).json(paymentTokens);
  });

  return router;
}
