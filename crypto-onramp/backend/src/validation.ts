import { ApiError } from './errors.js';

const UNSAFE_PATH_SEGMENT = /[/?#%\\]|\.\./;
const LINK_AUTH_INTENT_ID = /^lai_[A-Za-z0-9]+$/;
const CRYPTO_CUSTOMER_ID = /^crc_[A-Za-z0-9]+$/;
const ONRAMP_SESSION_ID = /^cos_[A-Za-z0-9]+$/;
const MAX_ID_LENGTH = 255;
const MAX_EMAIL_LENGTH = 800;

export function isSafePathSegment(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !UNSAFE_PATH_SEGMENT.test(value)
  );
}

export function pathSegment(value: unknown): string {
  if (!isSafePathSegment(value)) {
    throw new ApiError(400, 'invalid_id', 'The supplied ID is invalid.');
  }
  return encodeURIComponent(value);
}

function parseIdentifier(
  value: unknown,
  pattern: RegExp,
  fieldName: string,
): string {
  if (!isIdentifier(value, pattern)) {
    throw new ApiError(400, 'invalid_id', `${fieldName} is invalid.`);
  }
  return value;
}

function isIdentifier(value: unknown, pattern: RegExp): value is string {
  return isSafePathSegment(value) && pattern.test(value);
}

export function isLinkAuthIntentId(value: unknown): value is string {
  return isIdentifier(value, LINK_AUTH_INTENT_ID);
}

export function isCryptoCustomerId(value: unknown): value is string {
  return isIdentifier(value, CRYPTO_CUSTOMER_ID);
}

export function parseLinkAuthIntentId(value: unknown): string {
  return parseIdentifier(value, LINK_AUTH_INTENT_ID, 'auth_intent_id');
}

export function parseCryptoCustomerId(value: unknown): string {
  return parseIdentifier(value, CRYPTO_CUSTOMER_ID, 'crypto_customer_id');
}

export function parseOnrampSessionId(value: unknown): string {
  return parseIdentifier(value, ONRAMP_SESSION_ID, 'session_id');
}

export function parseEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'invalid_request', 'email is required.');
  }

  const email = value.trim();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) {
    throw new ApiError(400, 'invalid_request', 'email is invalid.');
  }
  return email;
}

export function parseLivemode(value: unknown, defaultValue = false): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== 'boolean') {
    throw new ApiError(400, 'invalid_request', 'livemode must be a boolean.');
  }
  return value;
}

export function parseLivemodeQuery(value: unknown): boolean {
  if (value === undefined || value === 'false') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  throw new ApiError(400, 'invalid_request', 'livemode must be true or false.');
}

export function parseStrictObject(
  value: unknown,
  allowedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError(400, 'invalid_request', 'A JSON object is required.');
  }

  const body = value as Record<string, unknown>;
  const unexpectedKey = Object.keys(body).find((key) => !allowedKeys.includes(key));
  if (unexpectedKey) {
    throw new ApiError(400, 'invalid_request', `${unexpectedKey} is not allowed.`);
  }
  return body;
}
