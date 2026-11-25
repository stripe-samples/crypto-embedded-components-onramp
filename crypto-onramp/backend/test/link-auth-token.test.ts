import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { createJwtService } from '../src/jwt.js';
import { createMockFetch, jsonResponse, testConfig } from './fixtures.js';

describe('Link auth-token route', () => {
  const jwt = createJwtService(testConfig.jwtSigningSecret);

  async function sessionToken() {
    return jwt.issueSessionToken({
      authIntentId: 'lai_example',
      cryptoCustomerId: 'crc_example',
      mode: 'test',
    });
  }

  it('returns only the SDK client secret and Stripe expiry', async () => {
    const fetchImplementation = createMockFetch();
    const app = createApp(testConfig, { fetch: fetchImplementation });

    const response = await request(app)
      .post('/link/auth_token')
      .set('Authorization', `Bearer ${await sessionToken()}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      expires_in: 900,
      link_auth_token_client_secret: 'lat_example_secret_example',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchImplementation.mock.calls.map(([url]) => String(url))).toEqual([
      'https://login.link.com/v1/link_auth_intent/lai_example/tokens',
      'https://api.stripe.com/v1/link/auth_token',
    ]);
    expect(fetchImplementation.mock.calls[1]?.[1]?.headers).toMatchObject({
      'Stripe-OAuth-Token': 'liwltoken_example',
    });
    expect(JSON.stringify(response.body)).not.toContain('liwltoken_example');
  });

  it('rejects flow tokens before retrieving OAuth credentials', async () => {
    const fetchImplementation = createMockFetch();
    const app = createApp(testConfig, { fetch: fetchImplementation });
    const flowToken = await jwt.issueFlowToken({
      authIntentId: 'lai_example',
      mode: 'test',
    });

    const response = await request(app)
      .post('/link/auth_token')
      .set('Authorization', `Bearer ${flowToken}`)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('invalid_session_token');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects SSO locally when its optional scope is not configured', async () => {
    const fetchImplementation = createMockFetch();
    const app = createApp(
      { ...testConfig, oauthScopes: 'crypto:ramp,kyc.status:read' },
      { fetch: fetchImplementation },
    );

    const response = await request(app)
      .post('/link/auth_token')
      .set('Authorization', `Bearer ${await sessionToken()}`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('link_sso_unavailable');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('requires reauthorization when OAuth retrieval cannot refresh access', async () => {
    const fetchImplementation = createMockFetch();
    fetchImplementation.mockResolvedValueOnce(
      jsonResponse({ access_token: 'expired', expires_in: 0 }),
    );
    const app = createApp(testConfig, { fetch: fetchImplementation });

    const response = await request(app)
      .post('/link/auth_token')
      .set('Authorization', `Bearer ${await sessionToken()}`)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('link_reauthorization_required');
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });
});
