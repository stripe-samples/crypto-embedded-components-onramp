import { describe, expect, it } from 'vitest';

import {
  ConfigError,
  FLOW_TOKEN_TTL_SECONDS,
  SESSION_TOKEN_TTL_SECONDS,
  loadConfig,
} from '../src/config.js';

const validEnvironment = {
  JWT_SIGNING_SECRET: 'a-secure-signing-secret-with-32-bytes',
  OAUTH_CLIENT_ID: 'ca_test_example',
  OAUTH_CLIENT_SECRET: 'oauth_secret_example',
  OAUTH_SCOPES: 'crypto:ramp,kyc.status:read',
  STRIPE_PK_TEST_KEY: 'pk_test_example',
  STRIPE_SK_TEST_KEY: 'sk_test_example',
};

describe('loadConfig', () => {
  it('loads safe defaults and fixed token lifetimes', () => {
    const config = loadConfig(validEnvironment);

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(3001);
    expect(config.trustedProxyHops).toBe(0);
    expect(config.liveMode).toBeUndefined();
    expect(FLOW_TOKEN_TTL_SECONDS).toBe(900);
    expect(SESSION_TOKEN_TTL_SECONDS).toBe(86_400);
  });

  it('rejects missing required configuration', () => {
    expect(() => loadConfig({})).toThrowError(ConfigError);
    expect(() => loadConfig({})).toThrowError('STRIPE_PK_TEST_KEY is required');
  });

  it('loads an explicit trusted proxy hop count', () => {
    expect(
      loadConfig({ ...validEnvironment, TRUSTED_PROXY_HOPS: '1' })
        .trustedProxyHops,
    ).toBe(1);
  });

  it('trusts one proxy hop on Vercel unless explicitly overridden', () => {
    expect(loadConfig({ ...validEnvironment, VERCEL: '1' }).trustedProxyHops).toBe(
      1,
    );
    expect(
      loadConfig({
        ...validEnvironment,
        TRUSTED_PROXY_HOPS: '0',
        VERCEL: '1',
      }).trustedProxyHops,
    ).toBe(0);
  });

  it('rejects invalid ports, proxy hops, weak secrets, and partial live mode', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        JWT_SIGNING_SECRET: 'too-short',
        PORT: '70000',
        STRIPE_SK_LIVE_KEY: 'sk_live_example',
        TRUSTED_PROXY_HOPS: '-1',
      }),
    ).toThrowError(
      /STRIPE_PK_LIVE_KEY and STRIPE_SK_LIVE_KEY must be set together[\s\S]*JWT_SIGNING_SECRET must contain at least 32 bytes[\s\S]*PORT must be an integer between 1 and 65535[\s\S]*TRUSTED_PROXY_HOPS must be an integer between 0 and 10/,
    );
  });
});
