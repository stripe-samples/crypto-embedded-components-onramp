import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/create-app.js';
import { createJwtService } from '../src/jwt.js';
import {
  createMockFetch,
  createMockStripeFactory,
  jsonResponse,
  testConfig,
} from './fixtures.js';

function stripeError(statusCode: number, rawMessage?: string): Error {
  return Object.assign(new Error('Stripe request failed'), {
    ...(rawMessage === undefined ? {} : { raw: { message: rawMessage } }),
    statusCode,
  });
}

describe('customer routes', () => {
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

  it('returns the Stripe customer for the signed session', async () => {
    const response = await request(app)
      .get('/customers/crc_example')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 'crc_example',
      kyc_region: 'us',
      provided_fields: ['first_name'],
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(stripe.stripeFactory).toHaveBeenCalledWith('sk_test_example');
    expect(stripe.retrieveCustomer).toHaveBeenCalledWith(
      'crc_example',
      {},
      { headers: { 'Stripe-OAuth-Token': 'liwltoken_example' } },
    );
  });

  it('forwards pagination to wallet and payment-token reads', async () => {
    const token = await sessionToken();
    const wallets = await request(app)
      .get('/customers/crc_example/wallets?limit=25&starting_after=ccw_previous')
      .set('Authorization', `Bearer ${token}`);
    const paymentTokens = await request(app)
      .get(
        '/customers/crc_example/payment_tokens?limit=10&starting_after=cpt_previous',
      )
      .set('Authorization', `Bearer ${token}`);

    expect(wallets.status).toBe(200);
    expect(wallets.body.data[0].id).toBe('ccw_example');
    expect(paymentTokens.status).toBe(200);
    expect(paymentTokens.body.data[0].id).toBe('cpt_example');
    expect(stripe.listConsumerWallets).toHaveBeenCalledWith(
      'crc_example',
      { limit: 25, starting_after: 'ccw_previous' },
      { headers: { 'Stripe-OAuth-Token': 'liwltoken_example' } },
    );
    expect(stripe.listPaymentTokens).toHaveBeenCalledWith(
      'crc_example',
      { limit: 10, starting_after: 'cpt_previous' },
      { headers: { 'Stripe-OAuth-Token': 'liwltoken_example' } },
    );
  });

  it('rejects a foreign customer before retrieving Link credentials', async () => {
    const response = await request(app)
      .get('/customers/crc_foreign')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('customer_not_authorized');
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(stripe.retrieveCustomer).not.toHaveBeenCalled();
  });

  it('rejects an invalid customer ID', async () => {
    const response = await request(app)
      .get('/customers/crc_example%2Fother')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(400);
    expect(stripe.stripeFactory).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric pagination limit', async () => {
    const response = await request(app)
      .get('/customers/crc_example/wallets?limit=not-a-number')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(400);
    expect(stripe.stripeFactory).not.toHaveBeenCalled();
  });

  it('lets Stripe validate pagination bounds', async () => {
    stripe.listConsumerWallets.mockRejectedValueOnce(stripeError(400));
    const response = await request(app)
      .get('/customers/crc_example/wallets?limit=0')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_request');
    expect(stripe.listConsumerWallets).toHaveBeenCalledWith(
      'crc_example',
      { limit: 0 },
      expect.anything(),
    );
  });

  it('ignores unsupported query input', async () => {
    const response = await request(app)
      .get('/customers/crc_example/wallets?livemode=true&api_key=attacker')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(200);
    expect(stripe.listConsumerWallets).toHaveBeenCalledWith(
      'crc_example',
      {},
      { headers: { 'Stripe-OAuth-Token': 'liwltoken_example' } },
    );
  });

  it('requires a session credential', async () => {
    const flowToken = await jwt.issueFlowToken({
      authIntentId: 'lai_example',
      mode: 'test',
    });
    const response = await request(app)
      .get('/customers/crc_example')
      .set('Authorization', `Bearer ${flowToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('invalid_session_token');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('requires current Link authorization', async () => {
    fetchImplementation.mockResolvedValueOnce(jsonResponse({}, 404));
    const response = await request(app)
      .get('/customers/crc_example')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('link_authorization_required');
    expect(stripe.retrieveCustomer).not.toHaveBeenCalled();
  });

  it('maps Stripe customer and authorization failures', async () => {
    stripe.retrieveCustomer.mockRejectedValueOnce(stripeError(404));
    const foreignCustomer = await request(app)
      .get('/customers/crc_example')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    stripe.listConsumerWallets.mockRejectedValueOnce(
      stripeError(403, 'The OAuth access token is invalid.'),
    );
    const expiredAccess = await request(app)
      .get('/customers/crc_example/wallets')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(foreignCustomer.status).toBe(403);
    expect(foreignCustomer.body.error.code).toBe('customer_not_authorized');
    expect(expiredAccess.status).toBe(401);
    expect(expiredAccess.body.error.code).toBe('link_reauthorization_required');
  });

  it('forces reauthorization when the test header is sent', async () => {
    const forced = await request(app)
      .get('/customers/crc_example')
      .set('Authorization', `Bearer ${await sessionToken()}`)
      .set('X-Test-Link-Reauthorization-Required', 'true');

    expect(forced.status).toBe(401);
    expect(forced.body.error.code).toBe('link_reauthorization_required');
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(stripe.retrieveCustomer).not.toHaveBeenCalled();

    const invalidSession = await request(app)
      .get('/customers/crc_example')
      .set('Authorization', 'Bearer invalid')
      .set('X-Test-Link-Reauthorization-Required', 'true');

    expect(invalidSession.status).toBe(401);
    expect(invalidSession.body.error.code).toBe('invalid_session_token');
  });

  it('does not expose unexpected Stripe errors', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stripe.listPaymentTokens.mockRejectedValueOnce(
      new Error('private upstream details'),
    );
    const response = await request(app)
      .get('/customers/crc_example/payment_tokens')
      .set('Authorization', `Bearer ${await sessionToken()}`);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('upstream_error');
    expect(JSON.stringify(response.body)).not.toContain('private upstream details');
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
