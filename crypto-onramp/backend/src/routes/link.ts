import { Router } from 'express';
import type Stripe from 'stripe';

import type { AppConfig, ModeConfig } from '../config.js';
import { ApiError, upstreamApiError } from '../errors.js';
import {
  createStripeClient,
  isInvalidLinkAccessTokenError,
  stripeStatusCode,
  type StripeFactory,
} from '../stripe.js';
import {
  isLinkAuthIntentId,
  parseCryptoCustomerId,
  parseEmail,
  parseLinkAuthIntentId,
  parseLivemode,
  parseStrictObject,
  pathSegment,
} from '../validation.js';
import {
  createJwtService,
  type JwtService,
  JwtValidationError,
  type Mode,
} from '../jwt.js';
import {
  authorizeSession,
  type OAuthCredentials,
  type OAuthCredentialsInput,
  requireBearerToken,
} from '../session-auth.js';

const LINK_ORIGIN = 'https://login.link.com';
const CREATE_AUTH_INTENT_URL = `${LINK_ORIGIN}/v1/link_auth_intent`;
const CREATE_LINK_AUTH_TOKEN_URL = 'https://api.stripe.com/v1/link/auth_token';
const LINK_SSO_SCOPE = 'auth.persist_login:read';
const UPSTREAM_REQUEST_TIMEOUT_MS = 10_000;

interface AuthIntentInput {
  email: string;
  mode: Mode;
}

interface CryptoCustomerInput {
  accessToken: string;
  cryptoCustomerId: string;
  mode: Mode;
}

interface LinkAuthTokenInput {
  accessToken: string;
  mode: Mode;
}

interface LinkAuthToken {
  clientSecret: string;
  expiresIn: number;
}

type Fetch = typeof globalThis.fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function modeConfig(config: AppConfig, mode: Mode): ModeConfig | undefined {
  return mode === 'live' ? config.liveMode : config.testMode;
}

function configuredMode(config: AppConfig, mode: Mode): ModeConfig {
  const selectedMode = modeConfig(config, mode);
  if (!selectedMode) {
    throw new ApiError(400, 'mode_not_available', 'Live mode is not configured.');
  }
  return selectedMode;
}

function upstreamMode(config: AppConfig, mode: Mode) {
  const selectedMode = modeConfig(config, mode);
  if (!selectedMode) {
    throw upstreamApiError(new Error('Upstream mode is not configured.'));
  }
  return selectedMode;
}

function linkSsoEnabled(config: AppConfig): boolean {
  return config.oauthScopes
    .split(',')
    .some((scope) => scope.trim() === LINK_SSO_SCOPE);
}

function linkSsoUnavailable(): ApiError {
  return new ApiError(
    403,
    'link_sso_unavailable',
    'Seamless Link sign-in is not available for this integration or authorization. Use the regular Link authorization flow.',
  );
}

async function upstreamRequest(
  url: string,
  options: RequestInit,
  fetchImplementation: Fetch,
): Promise<Response> {
  try {
    return await fetchImplementation(url, {
      ...options,
      signal: AbortSignal.timeout(UPSTREAM_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw upstreamApiError(error);
  }
}

export async function createLinkAuthIntent(
  config: AppConfig,
  { email, mode }: AuthIntentInput,
  fetchImplementation: Fetch = globalThis.fetch,
): Promise<{ authIntentId: string }> {
  const response = await upstreamRequest(
    CREATE_AUTH_INTENT_URL,
    {
      body: JSON.stringify({
        email,
        oauth_client_id: config.oauthClientId,
        oauth_scopes: config.oauthScopes,
      }),
      headers: {
        Authorization: `Bearer ${upstreamMode(config, mode).secretKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      redirect: 'error',
    },
    fetchImplementation,
  );
  const data = await responseJson(response);
  if (!response.ok) {
    switch (response.status) {
      case 400:
        if (linkSsoEnabled(config)) {
          throw linkSsoUnavailable();
        }
        throw new ApiError(
          400,
          'invalid_request',
          'The Link request was rejected.',
        );
      case 404:
        throw new ApiError(
          404,
          'link_account_not_found',
          'No active Link account was found for that email.',
        );
      case 409:
        throw new ApiError(
          409,
          'link_reauthorization_required',
          'Link authorization must be renewed.',
        );
      default:
        throw upstreamApiError(
          new Error(
            `Link auth-intent request failed with status ${response.status}.`,
          ),
        );
    }
  }

  if (!isLinkAuthIntentId(data.id)) {
    throw upstreamApiError(new Error('Link auth-intent response was invalid.'));
  }
  return { authIntentId: data.id };
}

export async function retrieveOAuthCredentials(
  config: AppConfig,
  { authIntentId, mode }: OAuthCredentialsInput,
  fetchImplementation: Fetch = globalThis.fetch,
): Promise<OAuthCredentials> {
  const safeAuthIntentId = parseLinkAuthIntentId(authIntentId);
  const response = await upstreamRequest(
    `${LINK_ORIGIN}/v1/link_auth_intent/${pathSegment(safeAuthIntentId)}/tokens`,
    {
      headers: {
        Authorization: `Bearer ${upstreamMode(config, mode).secretKey}`,
      },
      method: 'POST',
      redirect: 'error',
    },
    fetchImplementation,
  );
  const data = await responseJson(response);
  if (!response.ok) {
    if (response.status === 403 || response.status === 404) {
      throw new ApiError(
        401,
        'link_authorization_required',
        'Complete Link authorization and try again.',
      );
    }
    throw upstreamApiError(
      new Error(`Link token request failed with status ${response.status}.`),
    );
  }

  if (
    typeof data.access_token !== 'string' ||
    data.access_token.length === 0 ||
    typeof data.expires_in !== 'number' ||
    !Number.isFinite(data.expires_in)
  ) {
    throw upstreamApiError(new Error('Link token response was invalid.'));
  }

  if (Math.trunc(data.expires_in) > 0) {
    return { accessToken: data.access_token };
  }

  const refresh = isRecord(data.refresh) ? data.refresh : {};
  if (
    typeof refresh.refresh_token !== 'string' ||
    refresh.refresh_token.length === 0
  ) {
    throw new ApiError(
      401,
      'link_reauthorization_required',
      'Link authorization must be renewed.',
    );
  }

  return refreshOAuthCredentials(
    config,
    mode,
    refresh.refresh_token,
    fetchImplementation,
  );
}

async function refreshOAuthCredentials(
  config: AppConfig,
  mode: Mode,
  refreshToken: string,
  fetchImplementation: Fetch,
): Promise<OAuthCredentials> {
  const response = await upstreamRequest(
    `${LINK_ORIGIN}/auth/token`,
    {
      body: new URLSearchParams({
        client_id: config.oauthClientId,
        client_secret: config.oauthClientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: config.oauthScopes,
      }),
      headers: {
        Authorization: `Bearer ${upstreamMode(config, mode).secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
      redirect: 'error',
    },
    fetchImplementation,
  );
  const data = await responseJson(response);
  if (!response.ok) {
    if (response.status === 400) {
      throw new ApiError(
        401,
        'link_reauthorization_required',
        'Link authorization must be renewed.',
      );
    }
    throw upstreamApiError(
      new Error(`Link token refresh failed with status ${response.status}.`),
    );
  }
  if (
    typeof data.access_token !== 'string' ||
    data.access_token.length === 0
  ) {
    throw upstreamApiError(new Error('Link token refresh response was invalid.'));
  }
  return { accessToken: data.access_token };
}

export async function createLinkAuthToken(
  config: AppConfig,
  { accessToken, mode }: LinkAuthTokenInput,
  fetchImplementation: Fetch = globalThis.fetch,
): Promise<LinkAuthToken> {
  if (!linkSsoEnabled(config)) {
    throw linkSsoUnavailable();
  }
  const response = await upstreamRequest(
    CREATE_LINK_AUTH_TOKEN_URL,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${upstreamMode(config, mode).secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Stripe-OAuth-Token': accessToken,
      },
      method: 'POST',
      redirect: 'error',
    },
    fetchImplementation,
  );
  const data = await responseJson(response);
  if (!response.ok) {
    if (response.status === 403) {
      throw linkSsoUnavailable();
    }
    throw upstreamApiError(
      new Error(`Stripe Link auth-token request failed with status ${response.status}.`),
    );
  }
  if (
    typeof data.token !== 'string' ||
    data.token.length === 0 ||
    typeof data.expires_in !== 'number' ||
    !Number.isFinite(data.expires_in)
  ) {
    throw upstreamApiError(new Error('Stripe Link auth-token response was invalid.'));
  }
  return {
    clientSecret: data.token,
    expiresIn: Math.trunc(data.expires_in),
  };
}

export async function retrieveCryptoCustomer(
  config: AppConfig,
  { accessToken, cryptoCustomerId, mode }: CryptoCustomerInput,
  stripeFactory: StripeFactory = createStripeClient,
): Promise<{ cryptoCustomerId: string }> {
  const secretKey = upstreamMode(config, mode).secretKey;
  try {
    const stripe = stripeFactory(secretKey);
    const customer = await stripe.crypto.customers.retrieve(
      cryptoCustomerId,
      {},
      { headers: { 'Stripe-OAuth-Token': accessToken } },
    );
    return { cryptoCustomerId: customer.id };
  } catch (error) {
    if (isInvalidLinkAccessTokenError(error)) {
      throw new ApiError(
        401,
        'link_reauthorization_required',
        'Link authorization must be renewed.',
      );
    }

    switch (stripeStatusCode(error)) {
      case 400:
        throw new ApiError(
          400,
          'invalid_request',
          'The request parameters were rejected.',
        );
      case 403:
      case 404:
        throw new ApiError(
          403,
          'customer_not_authorized',
          'The CryptoCustomer is not authorized for this session.',
        );
      default:
        throw upstreamApiError(error);
    }
  }
}

function modeFromLivemode(livemode: boolean): Mode {
  return livemode ? 'live' : 'test';
}

function supportedModes(config: AppConfig): readonly Mode[] {
  return config.liveMode ? ['test', 'live'] : ['test'];
}

export function getPublicConfig(config: AppConfig, livemode: boolean) {
  const mode = modeFromLivemode(livemode);
  return {
    link_sso_enabled: linkSsoEnabled(config),
    livemode,
    publishable_key: configuredMode(config, mode).publishableKey,
    supported_modes: supportedModes(config),
  };
}

async function verifyFlowToken(jwt: JwtService, token: string) {
  try {
    return await jwt.verifyFlowToken(token);
  } catch (error) {
    if (error instanceof JwtValidationError) {
      throw new ApiError(
        401,
        'invalid_flow_token',
        'The flow token is invalid or expired.',
      );
    }
    throw error;
  }
}

export function createLinkRouter(
  config: AppConfig,
  fetchImplementation: Fetch,
  stripeFactory: StripeFactory,
): Router {
  const router = Router();
  const jwt = createJwtService(config.jwtSigningSecret);
  const getOAuthCredentials = (input: OAuthCredentialsInput) =>
    retrieveOAuthCredentials(config, input, fetchImplementation);

  router.post('/auth_intent', async (request, response) => {
    const body = parseStrictObject(request.body, ['email', 'livemode']);
    const email = parseEmail(body.email);
    const mode = modeFromLivemode(parseLivemode(body.livemode));
    configuredMode(config, mode);

    const { authIntentId } = await createLinkAuthIntent(
      config,
      { email, mode },
      fetchImplementation,
    );
    response.status(200).json({
      auth_intent_id: authIntentId,
      flow_token: await jwt.issueFlowToken({ authIntentId, mode }),
    });
  });

  router.post('/auth_intent/complete', async (request, response) => {
    const body = parseStrictObject(request.body, ['crypto_customer_id']);
    const cryptoCustomerId = parseCryptoCustomerId(body.crypto_customer_id);
    const token = requireBearerToken(request.get('Authorization'), 'flow');
    const flowClaims = await verifyFlowToken(jwt, token);

    configuredMode(config, flowClaims.mode);

    const credentials = await getOAuthCredentials({
      authIntentId: flowClaims.authIntentId,
      mode: flowClaims.mode,
    });
    const customer = await retrieveCryptoCustomer(
      config,
      {
        accessToken: credentials.accessToken,
        cryptoCustomerId,
        mode: flowClaims.mode,
      },
      stripeFactory,
    );
    if (customer.cryptoCustomerId !== cryptoCustomerId) {
      throw new ApiError(
        403,
        'customer_not_authorized',
        'The CryptoCustomer is not authorized for this session.',
      );
    }

    response.status(200).json({
      session_token: await jwt.issueSessionToken({
        ...flowClaims,
        cryptoCustomerId,
      }),
    });
  });

  router.post('/auth_token', async (request, response) => {
    parseStrictObject(request.body ?? {}, []);
    if (!linkSsoEnabled(config)) {
      throw linkSsoUnavailable();
    }
    const session = await authorizeSession(
      config,
      jwt,
      getOAuthCredentials,
      request.get('Authorization'),
    );
    const authToken = await createLinkAuthToken(
      config,
      {
        accessToken: session.accessToken,
        mode: session.mode,
      },
      fetchImplementation,
    );
    response.status(200).json({
      expires_in: authToken.expiresIn,
      link_auth_token_client_secret: authToken.clientSecret,
    });
  });
  return router;
}
