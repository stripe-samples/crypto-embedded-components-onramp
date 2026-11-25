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
import {
  parseCryptoCustomerId,
  parseOnrampSessionId,
  parseStrictObject,
} from '../validation.js';
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

type ResourceScope = 'customer' | 'session';

function stripeApiError(error: unknown, scope?: ResourceScope): ApiError {
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
      if (scope === 'customer') {
        return new ApiError(
          403,
          'customer_not_authorized',
          'The CryptoCustomer is not authorized for this session.',
        );
      }
      if (scope === 'session') {
        return new ApiError(
          403,
          'session_not_authorized',
          'The onramp session is not authorized for this customer.',
        );
      }
  }
  return upstreamApiError(error);
}

async function stripeRequest<T>(
  request: () => Promise<T>,
  scope?: ResourceScope,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw stripeApiError(error, scope);
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

function requiredString(
  body: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const value = body[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiError(400, 'invalid_request', `${name} is required.`);
  }
  return value;
}

function sourceAmount(body: Readonly<Record<string, unknown>>): string {
  const value = body.source_amount;
  if (
    (typeof value !== 'string' || value.length === 0) &&
    (typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw new ApiError(400, 'invalid_request', 'source_amount is required.');
  }
  return String(value);
}

function optionalString(
  body: Readonly<Record<string, unknown>>,
  name: string,
): string | undefined {
  const value = body[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiError(400, 'invalid_request', `${name} must be a string.`);
  }
  return value;
}

type HeadlessOnrampSessionParams = Stripe.Crypto.OnrampSessionCreateParams & {
  crypto_customer_id: string;
  fee_responsibility?: string;
  payment_token: string;
  ui_mode: 'headless';
  wallet_address: string;
};

type CustomerOnrampSession = Stripe.Crypto.OnrampSession & {
  crypto_customer_id?: string;
};

function assertOwnedOnrampSession(
  onrampSession: CustomerOnrampSession,
  cryptoCustomerId: string,
  mode: Mode,
): void {
  if (
    onrampSession.crypto_customer_id !== cryptoCustomerId ||
    onrampSession.livemode !== (mode === 'live')
  ) {
    throw new ApiError(
      403,
      'session_not_authorized',
      'The onramp session is not authorized for this customer.',
    );
  }
}

async function retrieveOwnedOnrampSession(
  stripe: Stripe,
  sessionId: string,
  cryptoCustomerId: string,
  mode: Mode,
  accessToken: string,
): Promise<CustomerOnrampSession> {
  const onrampSession = await stripeRequest(
    () =>
      stripe.crypto.onrampSessions.retrieve(
        sessionId,
        {},
        requestOptions(accessToken),
      ),
    'session',
  );
  assertOwnedOnrampSession(onrampSession, cryptoCustomerId, mode);
  return onrampSession;
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
  const authorize = (
    authorization: string | undefined,
    expectedCryptoCustomerId?: string,
  ) =>
    authorizeSession(
      config,
      jwt,
      getOAuthCredentials,
      authorization,
      expectedCryptoCustomerId,
    );

  router.get('/limits', async (request, response) => {
    const filters = transactionLimitFilters(request.query);
    const session = await authorize(request.get('Authorization'));
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

  router.post('/sessions', async (request, response) => {
    const body = parseStrictObject(request.body, [
      'crypto_customer_id',
      'destination_currency',
      'destination_network',
      'fee_responsibility',
      'payment_token',
      'settlement_speed',
      'source_amount',
      'source_currency',
      'wallet_address',
    ]);
    const cryptoCustomerId = parseCryptoCustomerId(body.crypto_customer_id);
    const session = await authorize(
      request.get('Authorization'),
      cryptoCustomerId,
    );
    const destinationCurrency = requiredString(body, 'destination_currency');
    const destinationNetwork = requiredString(body, 'destination_network');
    const settlementSpeed = optionalString(body, 'settlement_speed');
    const feeResponsibility = optionalString(body, 'fee_responsibility');
    const params: HeadlessOnrampSessionParams = {
      crypto_customer_id: cryptoCustomerId,
      ...(request.ip === undefined
        ? {}
        : { customer_ip_address: request.ip }),
      destination_currencies: [destinationCurrency],
      destination_currency: destinationCurrency,
      destination_network: destinationNetwork,
      destination_networks: [destinationNetwork],
      payment_token: requiredString(body, 'payment_token'),
      source_amount: sourceAmount(body),
      source_currency: requiredString(body, 'source_currency'),
      ui_mode: 'headless',
      wallet_address: requiredString(body, 'wallet_address'),
      ...(settlementSpeed === undefined
        ? {}
        : { settlement_speed: settlementSpeed }),
      ...(feeResponsibility === undefined
        ? {}
        : { fee_responsibility: feeResponsibility }),
    };
    const stripe = stripeClient(config, session.mode, stripeFactory);
    const onrampSession = await stripeRequest(
      () =>
        stripe.crypto.onrampSessions.create(
          params,
          requestOptions(session.accessToken),
        ),
      'customer',
    );
    assertOwnedOnrampSession(
      onrampSession,
      session.cryptoCustomerId,
      session.mode,
    );
    response.status(200).json(onrampSession);
  });

  router.get('/sessions/:session_id', async (request, response) => {
    const sessionId = parseOnrampSessionId(request.params.session_id);
    const session = await authorize(request.get('Authorization'));
    const stripe = stripeClient(config, session.mode, stripeFactory);
    const onrampSession = await retrieveOwnedOnrampSession(
      stripe,
      sessionId,
      session.cryptoCustomerId,
      session.mode,
      session.accessToken,
    );
    response.status(200).json(onrampSession);
  });

  router.post(
    '/sessions/:session_id/quote',
    async (request, response) => {
      parseStrictObject(request.body ?? {}, []);
      const sessionId = parseOnrampSessionId(request.params.session_id);
      const session = await authorize(request.get('Authorization'));
      const stripe = stripeClient(config, session.mode, stripeFactory);
      await retrieveOwnedOnrampSession(
        stripe,
        sessionId,
        session.cryptoCustomerId,
        session.mode,
        session.accessToken,
      );
      const onrampSession = await stripeRequest(
        () =>
          stripe.crypto.onrampSessions.quote(
            sessionId,
            {},
            requestOptions(session.accessToken),
          ),
        'session',
      );
      assertOwnedOnrampSession(
        onrampSession,
        session.cryptoCustomerId,
        session.mode,
      );
      response.status(200).json(onrampSession);
    },
  );

  router.post(
    '/sessions/:session_id/checkout',
    async (request, response) => {
      parseStrictObject(request.body ?? {}, []);
      const sessionId = parseOnrampSessionId(request.params.session_id);
      const session = await authorize(request.get('Authorization'));
      const stripe = stripeClient(config, session.mode, stripeFactory);
      await retrieveOwnedOnrampSession(
        stripe,
        sessionId,
        session.cryptoCustomerId,
        session.mode,
        session.accessToken,
      );
      const onrampSession = await stripeRequest(
        () =>
          stripe.crypto.onrampSessions.checkout(
            sessionId,
            {
              mandate_data: {
                customer_acceptance: {
                  accepted_at: Math.trunc(Date.now() / 1000),
                  online: {
                    ip_address:
                      request.ip ?? request.socket.remoteAddress ?? '',
                    user_agent: request.get('user-agent') ?? '',
                  },
                  type: 'online',
                },
              },
            },
            requestOptions(session.accessToken),
          ),
        'session',
      );
      assertOwnedOnrampSession(
        onrampSession,
        session.cryptoCustomerId,
        session.mode,
      );
      response.status(200).json(onrampSession);
    },
  );

  return router;
}
