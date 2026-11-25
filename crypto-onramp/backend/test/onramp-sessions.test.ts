import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/create-app.js';
import { createJwtService } from '../src/jwt.js';
import {
  createMockFetch,
  createMockStripeFactory,
  testConfig,
} from './fixtures.js';

describe('onramp session routes', () => {
  const jwt = createJwtService(testConfig.jwtSigningSecret);
  const fetchImplementation = createMockFetch();
  const stripe = createMockStripeFactory();
  const app = createApp(testConfig, {
    fetch: fetchImplementation,
    stripeFactory: stripe.stripeFactory,
  });

  async function sessionToken(cryptoCustomerId = 'crc_example') {
    return jwt.issueSessionToken({
      authIntentId: 'lai_example',
      cryptoCustomerId,
      mode: 'test',
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a headless session with signed identity and server context', async () => {
    const response = await request(app)
      .post('/onramp/sessions')
      .set('Authorization', `Bearer ${await sessionToken()}`)
      .set('X-Forwarded-For', '203.0.113.10')
      .send({
        crypto_customer_id: 'crc_example',
        destination_currency: 'eth',
        destination_network: 'ethereum',
        fee_responsibility: 'merchant',
        payment_token: 'cpt_example',
        settlement_speed: 'instant',
        source_amount: 100,
        source_currency: 'usd',
        wallet_address: '0x1234',
      });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('cos_example');
    expect(stripe.createOnrampSession).toHaveBeenCalledWith(
      {
        crypto_customer_id: 'crc_example',
        customer_ip_address: '203.0.113.10',
        destination_currencies: ['eth'],
        destination_currency: 'eth',
        destination_network: 'ethereum',
        destination_networks: ['ethereum'],
        fee_responsibility: 'merchant',
        payment_token: 'cpt_example',
        settlement_speed: 'instant',
        source_amount: '100',
        source_currency: 'usd',
        ui_mode: 'headless',
        wallet_address: '0x1234',
      },
      { headers: { 'Stripe-OAuth-Token': 'liwltoken_example' } },
    );
  });

  it('rejects customer and server-context overrides', async () => {
    const response = await request(app)
      .post('/onramp/sessions')
      .set('Authorization', `Bearer ${await sessionToken()}`)
      .send({
        crypto_customer_id: 'crc_foreign',
        customer_ip_address: '203.0.113.50',
        destination_currency: 'eth',
        destination_network: 'ethereum',
        livemode: true,
        payment_token: 'cpt_example',
        source_amount: '100',
        source_currency: 'usd',
        ui_mode: 'hosted',
        wallet_address: '0x1234',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_request');
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(stripe.createOnrampSession).not.toHaveBeenCalled();
  });

  it('preserves actionable Stripe error codes with a safe message', async () => {
    stripe.createOnrampSession.mockRejectedValueOnce(
      Object.assign(new Error('private upstream details'), {
        code: 'crypto_onramp_missing_document_verification',
        statusCode: 400,
      }),
    );
    const response = await request(app)
      .post('/onramp/sessions')
      .set('Authorization', `Bearer ${await sessionToken()}`)
      .send({
        crypto_customer_id: 'crc_example',
        destination_currency: 'eth',
        destination_network: 'ethereum',
        payment_token: 'cpt_example',
        source_amount: '100',
        source_currency: 'usd',
        wallet_address: '0x1234',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'crypto_onramp_missing_document_verification',
      message: 'The request parameters were rejected.',
    });
    expect(JSON.stringify(response.body)).not.toContain('private upstream details');
  });

  it('retrieves only sessions owned by the signed customer', async () => {
    const response = await request(app)
      .get('/onramp/sessions/cos_example')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('cos_example');
    expect(stripe.retrieveOnrampSession).toHaveBeenCalledWith(
      'cos_example',
      {},
      { headers: { 'Stripe-OAuth-Token': 'liwltoken_example' } },
    );
  });

  it.each(['quote', 'checkout'])(
    'blocks %s before mutation when the session belongs to another customer',
    async (operation) => {
      stripe.retrieveOnrampSession.mockResolvedValueOnce({
        ...await stripe.retrieveOnrampSession(),
        crypto_customer_id: 'crc_foreign',
      });
      stripe.retrieveOnrampSession.mockClear();
      const response = await request(app)
        .post(`/onramp/sessions/cos_example/${operation}`)
        .set('Authorization', `Bearer ${await sessionToken()}`)
        .send({});

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('session_not_authorized');
      expect(stripe.quoteOnrampSession).not.toHaveBeenCalled();
      expect(stripe.checkoutOnrampSession).not.toHaveBeenCalled();
    },
  );

  it('preflights ownership before refreshing a quote', async () => {
    const response = await request(app)
      .post('/onramp/sessions/cos_example/quote')
      .set('Authorization', `Bearer ${await sessionToken()}`)
      .send({});

    expect(response.status).toBe(200);
    expect(stripe.retrieveOnrampSession.mock.invocationCallOrder[0]).toBeLessThan(
      stripe.quoteOnrampSession.mock.invocationCallOrder[0] ?? 0,
    );
    expect(stripe.quoteOnrampSession).toHaveBeenCalledWith(
      'cos_example',
      {},
      { headers: { 'Stripe-OAuth-Token': 'liwltoken_example' } },
    );
  });

  it('preflights ownership and returns the checkout session', async () => {
    const response = await request(app)
      .post('/onramp/sessions/cos_example/checkout')
      .set('Authorization', `Bearer ${await sessionToken()}`)
      .set('X-Forwarded-For', '198.51.100.10')
      .set('User-Agent', 'example-client/1.0')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual(await stripe.checkoutOnrampSession());
    expect(stripe.checkoutOnrampSession).toHaveBeenCalledWith(
      'cos_example',
      {
        mandate_data: {
          customer_acceptance: {
            accepted_at: expect.any(Number),
            online: {
              ip_address: '198.51.100.10',
              user_agent: 'example-client/1.0',
            },
            type: 'online',
          },
        },
      },
      { headers: { 'Stripe-OAuth-Token': 'liwltoken_example' } },
    );
  });

  it.each([
    'cos_example/other',
    'cos_example\\other',
    'cos_example?admin=true',
    'cos_example#fragment',
    'cos_example%2Fother',
    '../cos_example',
  ])('rejects hostile session ID %j before outbound requests', async (sessionId) => {
    const response = await request(app)
      .get(`/onramp/sessions/${encodeURIComponent(sessionId)}`)
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(400);
    expect(stripe.retrieveOnrampSession).not.toHaveBeenCalled();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
