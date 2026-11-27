import type { Request } from 'express';

import type { AppConfig } from './config.js';
import { ApiError } from './errors.js';
import {
  type JwtService,
  JwtValidationError,
  type Mode,
  type SessionTokenClaims,
} from './jwt.js';

// Link refresh tokens last a year, so clients can send this header to exercise
// reauthorization recovery on demand. It only fails the request that sends it;
// Link credentials are not invalidated.
const LINK_REAUTHORIZATION_TEST_HEADER =
  'X-Test-Link-Reauthorization-Required';

export interface OAuthCredentials {
  accessToken: string;
}

export interface OAuthCredentialsInput {
  authIntentId: string;
  mode: Mode;
}

export type RetrieveOAuthCredentials = (
  input: OAuthCredentialsInput,
) => Promise<OAuthCredentials>;

export interface AuthorizedSession extends SessionTokenClaims {
  accessToken: string;
}

export function requireBearerToken(
  authorization: string | undefined,
  tokenType: 'flow' | 'session',
): string {
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match?.[1]) {
    throw new ApiError(
      401,
      `invalid_${tokenType}_token`,
      `A valid ${tokenType} bearer token is required.`,
    );
  }
  return match[1];
}

export async function authorizeSession(
  config: AppConfig,
  jwt: JwtService,
  retrieveOAuthCredentials: RetrieveOAuthCredentials,
  request: Pick<Request, 'get'>,
  expectedCryptoCustomerId?: string,
): Promise<AuthorizedSession> {
  let claims: SessionTokenClaims;
  try {
    claims = await jwt.verifySessionToken(
      requireBearerToken(request.get('Authorization'), 'session'),
    );
  } catch (error) {
    if (error instanceof JwtValidationError) {
      throw new ApiError(
        401,
        'invalid_session_token',
        'The session token is invalid or expired.',
      );
    }
    throw error;
  }

  if (claims.mode === 'live' && !config.liveMode) {
    throw new ApiError(400, 'mode_not_available', 'Live mode is not configured.');
  }
  if (
    expectedCryptoCustomerId !== undefined &&
    claims.cryptoCustomerId !== expectedCryptoCustomerId
  ) {
    throw new ApiError(
      403,
      'customer_not_authorized',
      'The CryptoCustomer is not authorized for this session.',
    );
  }

  if (request.get(LINK_REAUTHORIZATION_TEST_HEADER) === 'true') {
    throw new ApiError(
      401,
      'link_reauthorization_required',
      'Link authorization must be renewed.',
    );
  }

  const credentials = await retrieveOAuthCredentials({
    authIntentId: claims.authIntentId,
    mode: claims.mode,
  });
  return { ...claims, accessToken: credentials.accessToken };
}
