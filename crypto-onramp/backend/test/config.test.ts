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
    expect(config.liveMode).toBeUndefined();
    expect(config.corsAllowedOrigins).toEqual([
      'http://localhost:5173',
      'http://localhost:8081',
    ]);
    expect(FLOW_TOKEN_TTL_SECONDS).toBe(900);
    expect(SESSION_TOKEN_TTL_SECONDS).toBe(86_400);
  });

  it('rejects missing required configuration', () => {
    expect(() => loadConfig({})).toThrowError(ConfigError);
    expect(() => loadConfig({})).toThrowError('STRIPE_PK_TEST_KEY is required');
  });

  it('rejects invalid ports, weak signing secrets, and partial live mode', () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        JWT_SIGNING_SECRET: 'too-short',
        PORT: '70000',
        STRIPE_SK_LIVE_KEY: 'sk_live_example',
      }),
    ).toThrowError(
      /STRIPE_PK_LIVE_KEY and STRIPE_SK_LIVE_KEY must be set together[\s\S]*JWT_SIGNING_SECRET must contain at least 32 bytes[\s\S]*PORT must be an integer between 1 and 65535/,
    );
  });
});
