export const FLOW_TOKEN_TTL_SECONDS = 15 * 60;
export const SESSION_TOKEN_TTL_SECONDS = 24 * 60 * 60;
export const JWT_ISSUER = 'crypto-onramp-backend';
export const JWT_AUDIENCE = 'crypto-onramp-clients';

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3001;

type Environment = Readonly<Record<string, string | undefined>>;

export interface ModeConfig {
  publishableKey: string;
  secretKey: string;
}

export interface AppConfig {
  host: string;
  jwtSigningSecret: string;
  liveMode?: ModeConfig;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthScopes: string;
  port: number;
  testMode: ModeConfig;
  trustedProxyHops: number;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

function readRequired(
  environment: Environment,
  name: string,
  errors: string[],
): string {
  const value = environment[name]?.trim();
  if (!value) {
    errors.push(`${name} is required`);
    return '';
  }
  return value;
}

function readOptional(environment: Environment, name: string): string | undefined {
  const value = environment[name]?.trim();
  return value || undefined;
}

function readPort(environment: Environment, errors: string[]): number {
  const rawPort = readOptional(environment, 'PORT');
  if (!rawPort) {
    return DEFAULT_PORT;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    errors.push('PORT must be an integer between 1 and 65535');
    return DEFAULT_PORT;
  }
  return port;
}

function readTrustedProxyHops(
  environment: Environment,
  errors: string[],
): number {
  const rawHops = readOptional(environment, 'TRUSTED_PROXY_HOPS');
  if (!rawHops) {
    return readOptional(environment, 'VERCEL') === '1' ? 1 : 0;
  }

  const hops = Number(rawHops);
  if (!Number.isInteger(hops) || hops < 0 || hops > 10) {
    errors.push('TRUSTED_PROXY_HOPS must be an integer between 0 and 10');
    return 0;
  }
  return hops;
}

export function loadConfig(environment: Environment = process.env): AppConfig {
  const errors: string[] = [];
  const testMode = {
    publishableKey: readRequired(environment, 'STRIPE_PK_TEST_KEY', errors),
    secretKey: readRequired(environment, 'STRIPE_SK_TEST_KEY', errors),
  };
  const livePublishableKey = readOptional(environment, 'STRIPE_PK_LIVE_KEY');
  const liveSecretKey = readOptional(environment, 'STRIPE_SK_LIVE_KEY');

  if (Boolean(livePublishableKey) !== Boolean(liveSecretKey)) {
    errors.push('STRIPE_PK_LIVE_KEY and STRIPE_SK_LIVE_KEY must be set together');
  }

  const jwtSigningSecret = readRequired(environment, 'JWT_SIGNING_SECRET', errors);
  if (jwtSigningSecret && Buffer.byteLength(jwtSigningSecret, 'utf8') < 32) {
    errors.push('JWT_SIGNING_SECRET must contain at least 32 bytes');
  }

  const config: AppConfig = {
    host: readOptional(environment, 'HOST') ?? DEFAULT_HOST,
    jwtSigningSecret,
    oauthClientId: readRequired(environment, 'OAUTH_CLIENT_ID', errors),
    oauthClientSecret: readRequired(environment, 'OAUTH_CLIENT_SECRET', errors),
    oauthScopes: readRequired(environment, 'OAUTH_SCOPES', errors),
    port: readPort(environment, errors),
    testMode,
    trustedProxyHops: readTrustedProxyHops(environment, errors),
  };

  if (livePublishableKey && liveSecretKey) {
    config.liveMode = {
      publishableKey: livePublishableKey,
      secretKey: liveSecretKey,
    };
  }

  if (errors.length > 0) {
    throw new ConfigError(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }

  return config;
}
