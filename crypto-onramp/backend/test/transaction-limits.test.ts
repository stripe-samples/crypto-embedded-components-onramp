import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { createJwtService } from '../src/jwt.js';
import {
  createMockFetch,
  createMockStripeFactory,
  testConfig,
} from './fixtures.js';

function stripeError(statusCode: number): Error {
  return Object.assign(new Error('Stripe request failed'), { statusCode });
}

describe('transaction limits route', () => {
  const jwt = createJwtService(testConfig.jwtSigningSecret);
  const fetchImplementation = createMockFetch();
  const stripe = createMockStripeFactory();
  const overrides = {
    fetch: fetchImplementation,
    stripeFactory: stripe.stripeFactory,
  };
  const app = createApp(testConfig, overrides);

  async function sessionToken() {
    return jwt.issueSessionToken({
      authIntentId: 'lai_example',
      cryptoCustomerId: 'crc_example',
      mode: 'test',
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns Stripe limits with server-derived context', async () => {
    const response = await request(app)
      .get(
        '/onramp/limits?wallet_address=0x1234&destination_network=ethereum',
      )
      .set('X-Forwarded-For', '203.0.113.10')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.crypto_customer_id).toBe('crc_example');
    expect(stripe.retrieveTransactionLimits).toHaveBeenCalledWith(
      {
        customer_ip_address: '203.0.113.10',
        destination_network: 'ethereum',
        wallet_address: '0x1234',
      },
      { headers: { 'Stripe-OAuth-Token': 'liwltoken_example' } },
    );
  });

  it('ignores forwarded client IPs when no proxy is trusted', async () => {
    const directApp = createApp(
      { ...testConfig, trustedProxyHops: 0 },
      overrides,
    );
    const response = await request(directApp)
      .get('/onramp/limits')
      .set('X-Forwarded-For', '203.0.113.10')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(200);
    expect(stripe.retrieveTransactionLimits).toHaveBeenCalledWith(
      {
        customer_ip_address: expect.not.stringMatching(/^203\.0\.113\.10$/),
      },
      { headers: { 'Stripe-OAuth-Token': 'liwltoken_example' } },
    );
  });

  it('ignores unsupported and server-owned query input', async () => {
    const response = await request(app)
      .get(
        '/onramp/limits?livemode=true&crypto_customer_id=crc_foreign&customer_ip_address=203.0.113.10&api_key=attacker',
      )
      .set('X-Forwarded-For', '198.51.100.10')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(200);
    expect(stripe.retrieveTransactionLimits).toHaveBeenCalledWith(
      { customer_ip_address: '198.51.100.10' },
      { headers: { 'Stripe-OAuth-Token': 'liwltoken_example' } },
    );
  });

  it('lets Stripe validate destination networks', async () => {
    stripe.retrieveTransactionLimits.mockRejectedValueOnce(stripeError(400));
    const response = await request(app)
      .get('/onramp/limits?destination_network=future_network')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_request');
    expect(stripe.retrieveTransactionLimits).toHaveBeenCalledWith(
      expect.objectContaining({ destination_network: 'future_network' }),
      expect.anything(),
    );
  });

  it.each([
    { crypto_customer_id: 'crc_foreign', livemode: false },
    { crypto_customer_id: 'crc_example', livemode: true },
  ])('rejects limits for an unexpected session', async (mismatch) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stripe.retrieveTransactionLimits.mockResolvedValueOnce({
      object: 'crypto.onramp_transaction_limits',
      limits: {
        'usd.fiat': {
          card: [{ limit: 300_000, settlement_speed: 'instant' }],
        },
      },
      ...mismatch,
    });
    const response = await request(app)
      .get('/onramp/limits')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('upstream_error');
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
