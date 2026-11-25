import { jwtVerify, SignJWT, type JWTPayload } from 'jose';

import {
  FLOW_TOKEN_TTL_SECONDS,
  JWT_AUDIENCE,
  JWT_ISSUER,
  SESSION_TOKEN_TTL_SECONDS,
} from './config.js';
import {
  isCryptoCustomerId,
  isLinkAuthIntentId,
} from './validation.js';

const JWT_ALGORITHM = 'HS256';
const TOKEN_VERSION = 1;

export type Mode = 'test' | 'live';

export interface FlowTokenClaims {
  authIntentId: string;
  mode: Mode;
}

export interface SessionTokenClaims extends FlowTokenClaims {
  cryptoCustomerId: string;
}

export interface JwtService {
  issueFlowToken(claims: FlowTokenClaims): Promise<string>;
  issueSessionToken(
    claims: FlowTokenClaims & { cryptoCustomerId: string },
  ): Promise<string>;
  verifyFlowToken(token: string): Promise<FlowTokenClaims>;
  verifySessionToken(token: string): Promise<SessionTokenClaims>;
}

export class JwtValidationError extends Error {
  override readonly name = 'JwtValidationError';
}

type Clock = () => Date;

function parseMode(value: unknown): Mode {
  if (value !== 'test' && value !== 'live') {
    throw new JwtValidationError();
  }
  return value;
}

function parseJwtIdentifier(
  value: unknown,
  isValid: (candidate: unknown) => candidate is string,
): string {
  if (!isValid(value)) {
    throw new JwtValidationError();
  }
  return value;
}

function assertCommonClaims(
  payload: JWTPayload,
  protectedHeader: Readonly<Record<string, unknown>>,
  tokenType: 'flow' | 'session',
): FlowTokenClaims {
  if (
    protectedHeader.alg !== JWT_ALGORITHM ||
    protectedHeader.typ !== 'JWT' ||
    payload.token_type !== tokenType ||
    payload.version !== TOKEN_VERSION
  ) {
    throw new JwtValidationError();
  }

  return {
    authIntentId: parseJwtIdentifier(payload.auth_intent_id, isLinkAuthIntentId),
    mode: parseMode(payload.mode),
  };
}

export function createJwtService(
  signingSecret: string,
  clock: Clock = () => new Date(),
): JwtService {
  const secret = new TextEncoder().encode(signingSecret);

  async function issueToken(
    tokenType: 'flow' | 'session',
    claims: FlowTokenClaims & { cryptoCustomerId?: string },
    ttlSeconds: number,
  ): Promise<string> {
    const issuedAt = Math.floor(clock().getTime() / 1000);
    const payload: JWTPayload = {
      auth_intent_id: parseJwtIdentifier(claims.authIntentId, isLinkAuthIntentId),
      mode: parseMode(claims.mode),
      token_type: tokenType,
      version: TOKEN_VERSION,
    };

    if (tokenType === 'session') {
      payload.crypto_customer_id = parseJwtIdentifier(
        claims.cryptoCustomerId,
        isCryptoCustomerId,
      );
    }

    return new SignJWT(payload)
      .setProtectedHeader({ alg: JWT_ALGORITHM, typ: 'JWT' })
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ttlSeconds)
      .sign(secret);
  }

  async function verifyToken(token: string, tokenType: 'flow' | 'session') {
    let result;
    try {
      result = await jwtVerify(token, secret, {
        algorithms: [JWT_ALGORITHM],
        audience: JWT_AUDIENCE,
        currentDate: clock(),
        issuer: JWT_ISSUER,
      });
    } catch {
      throw new JwtValidationError();
    }
    return {
      claims: assertCommonClaims(result.payload, result.protectedHeader, tokenType),
      payload: result.payload,
    };
  }

  return {
    issueFlowToken: (claims) => issueToken('flow', claims, FLOW_TOKEN_TTL_SECONDS),
    issueSessionToken: (claims) =>
      issueToken('session', claims, SESSION_TOKEN_TTL_SECONDS),
    async verifyFlowToken(token) {
      const result = await verifyToken(token, 'flow');
      return result.claims;
    },
    async verifySessionToken(token) {
      const { claims, payload } = await verifyToken(token, 'session');
      return {
        ...claims,
        cryptoCustomerId: parseJwtIdentifier(
          payload.crypto_customer_id,
          isCryptoCustomerId,
        ),
      };
    },
  };
}
