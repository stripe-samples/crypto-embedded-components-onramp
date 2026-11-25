import { decodeJwt } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { createJwtService } from '../src/jwt.js';
import {
  createMockFetch,
  createMockStripeFactory,
  jsonResponse,
  testConfig,
} from './fixtures.js';

describe('Link routes', () => {
  const jwt = createJwtService(testConfig.jwtSigningSecret);
  const fetchImplementation = createMockFetch();
  const stripe = createMockStripeFactory();
  const overrides = {
    fetch: fetchImplementation,
    stripeFactory: stripe.stripeFactory,
  };
  const app = createApp(testConfig, overrides);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes only the selected publishable key and supported modes', async () => {
    const response = await request(app).get('/config?livemode=false');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      link_sso_enabled: true,
      livemode: false,
      publishable_key: 'pk_test_example',
      supported_modes: ['test'],
    });
    expect(JSON.stringify(response.body)).not.toContain('sk_test');
    expect(JSON.stringify(response.body)).not.toContain('oauth_secret');
  });

  it('publishes the live key only when live mode is selected', async () => {
    const liveConfig = {
      ...testConfig,
      liveMode: {
        publishableKey: 'pk_live_example',
        secretKey: 'sk_live_example',
      },
    };
    const liveApp = createApp(liveConfig, overrides);
    const response = await request(liveApp).get('/config?livemode=true');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      link_sso_enabled: true,
      livemode: true,
      publishable_key: 'pk_live_example',
      supported_modes: ['test', 'live'],
    });
    expect(JSON.stringify(response.body)).not.toContain('sk_live');
  });

  it('publishes when optional Link SSO is unavailable', async () => {
    const appWithoutSso = createApp(
      { ...testConfig, oauthScopes: 'crypto:ramp,kyc.status:read' },
      overrides,
    );
    const response = await request(appWithoutSso).get('/config');

    expect(response.status).toBe(200);
    expect(response.body.link_sso_enabled).toBe(false);
  });

  it('creates a backend-bound flow for the API-required email lookup', async () => {
    const response = await request(app).post('/link/auth_intent').send({
      email: ' person@example.com ',
      livemode: false,
    });

    expect(response.status).toBe(200);
    expect(response.body.auth_intent_id).toBe('lai_example');
    await expect(jwt.verifyFlowToken(response.body.flow_token)).resolves.toEqual({
      authIntentId: 'lai_example',
      mode: 'test',
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body))).toEqual(
      expect.objectContaining({ email: 'person@example.com' }),
    );
    expect(decodeJwt(response.body.flow_token)).not.toHaveProperty('email');
  });

  it('does not issue a flow token when Link creation fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const upstreamFailure = new Error('Link creation failed');
    fetchImplementation.mockRejectedValueOnce(upstreamFailure);
    const response = await request(app).post('/link/auth_intent').send({
      email: 'person@example.com',
      livemode: false,
    });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('upstream_error');
    expect(response.body).not.toHaveProperty('flow_token');
    expect(log).toHaveBeenCalledWith('Request failed', upstreamFailure);
    log.mockRestore();
  });

  it('rejects client-controlled scopes, LAIs, and invalid mode values', async () => {
    const response = await request(app).post('/link/auth_intent').send({
      auth_intent_id: 'lai_attacker',
      email: 'person@example.com',
      livemode: 'true',
      oauth_scopes: 'admin',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_request');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects live mode before outbound requests when it is not configured', async () => {
    const response = await request(app).post('/link/auth_intent').send({
      email: 'person@example.com',
      livemode: true,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('mode_not_available');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('completes and safely repeats verification within the bounded flow', async () => {
    const flowToken = await jwt.issueFlowToken({
      authIntentId: 'lai_example',
      mode: 'test',
    });

    const complete = () =>
      request(app)
        .post('/link/auth_intent/complete')
        .set('Authorization', `Bearer ${flowToken}`)
        .send({ crypto_customer_id: 'crc_example' });
    const firstResponse = await complete();
    const secondResponse = await complete();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    await expect(
      jwt.verifySessionToken(firstResponse.body.session_token),
    ).resolves.toMatchObject({
      authIntentId: 'lai_example',
      cryptoCustomerId: 'crc_example',
      mode: 'test',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(stripe.retrieveCustomer).toHaveBeenCalledTimes(2);
    const payload = decodeJwt(firstResponse.body.session_token);
    expect(payload).not.toHaveProperty('access_token');
    expect(payload).not.toHaveProperty('refresh_token');
  });

  it.each([
    'crc_example/other',
    'crc_example\\other',
    'crc_example?admin=true',
    'crc_example#fragment',
    'crc_example%2Fother',
    '../crc_example',
  ])('rejects hostile customer ID %j before outbound requests', async (cryptoCustomerId) => {
    const flowToken = await jwt.issueFlowToken({
      authIntentId: 'lai_example',
      mode: 'test',
    });
    const response = await request(app)
      .post('/link/auth_intent/complete')
      .set('Authorization', `Bearer ${flowToken}`)
      .send({ crypto_customer_id: cryptoCustomerId });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_id');
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(stripe.retrieveCustomer).not.toHaveBeenCalled();
  });

  it('rejects arbitrary LAI and mode imports before outbound requests', async () => {
    const flowToken = await jwt.issueFlowToken({
      authIntentId: 'lai_example',
      mode: 'test',
    });
    const response = await request(app)
      .post('/link/auth_intent/complete')
      .set('Authorization', `Bearer ${flowToken}`)
      .send({
        auth_intent_id: 'lai_attacker',
        crypto_customer_id: 'crc_example',
        livemode: true,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_request');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects session credentials on the flow completion route', async () => {
    const sessionToken = await jwt.issueSessionToken({
      authIntentId: 'lai_example',
      cryptoCustomerId: 'crc_example',
      mode: 'test',
    });
    const response = await request(app)
      .post('/link/auth_intent/complete')
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({ crypto_customer_id: 'crc_example' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('invalid_flow_token');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects an unavailable mode bound into a valid flow token', async () => {
    const flowToken = await jwt.issueFlowToken({
      authIntentId: 'lai_example',
      mode: 'live',
    });
    const response = await request(app)
      .post('/link/auth_intent/complete')
      .set('Authorization', `Bearer ${flowToken}`)
      .send({ crypto_customer_id: 'crc_example' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('mode_not_available');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('stops completion when Link reauthorization is required', async () => {
    fetchImplementation.mockResolvedValueOnce(jsonResponse({}, 404));
    const flowToken = await jwt.issueFlowToken({
      authIntentId: 'lai_example',
      mode: 'test',
    });
    const response = await request(app)
      .post('/link/auth_intent/complete')
      .set('Authorization', `Bearer ${flowToken}`)
      .send({ crypto_customer_id: 'crc_example' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('link_authorization_required');
    expect(stripe.retrieveCustomer).not.toHaveBeenCalled();
  });

  it('rejects a customer that is not associated with the Link grant', async () => {
    stripe.retrieveCustomer.mockResolvedValueOnce({
      id: 'crc_other',
      kyc_region: 'us',
      object: 'crypto.customer',
      provided_fields: ['first_name'],
    });
    const flowToken = await jwt.issueFlowToken({
      authIntentId: 'lai_example',
      mode: 'test',
    });
    const response = await request(app)
      .post('/link/auth_intent/complete')
      .set('Authorization', `Bearer ${flowToken}`)
      .send({ crypto_customer_id: 'crc_example' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('customer_not_authorized');
    expect(response.body).not.toHaveProperty('session_token');
  });

});
