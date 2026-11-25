import { describe, expect, it } from 'vitest';

import {
  isCryptoCustomerId,
  isLinkAuthIntentId,
  isSafePathSegment,
  parseCryptoCustomerId,
  parseEmail,
  parseLinkAuthIntentId,
  pathSegment,
} from '../src/validation.js';

describe('safe path segments', () => {
  it.each([
    '',
    '../lai_example',
    'lai_example/other',
    'lai_example\\other',
    'lai_example?redirect=true',
    'lai_example#fragment',
    'lai_example%2Fother',
  ])('rejects %j', (value) => {
    expect(isSafePathSegment(value)).toBe(false);
    expect(() => pathSegment(value)).toThrow('The supplied ID is invalid.');
  });

  it('requires expected Link and CryptoCustomer prefixes', () => {
    expect(isLinkAuthIntentId('lai_123ABC')).toBe(true);
    expect(isCryptoCustomerId('crc_123ABC')).toBe(true);
    expect(isLinkAuthIntentId('crc_123ABC')).toBe(false);
    expect(isCryptoCustomerId('lai_123ABC')).toBe(false);
    expect(parseLinkAuthIntentId('lai_123ABC')).toBe('lai_123ABC');
    expect(parseCryptoCustomerId('crc_123ABC')).toBe('crc_123ABC');
    expect(() => parseLinkAuthIntentId('crc_123ABC')).toThrow();
    expect(() => parseCryptoCustomerId('lai_123ABC')).toThrow();
  });

  it('normalizes email input without duplicating Link validation', () => {
    expect(parseEmail(' person@localhost ')).toBe('person@localhost');
    expect(() => parseEmail('   ')).toThrow('email is invalid.');
  });
});
