import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import {
  createLinkAuthIntent,
  createLinkAuthToken,
  retrieveCryptoCustomer,
  retrieveOAuthCredentials,
} from '../src/routes/link.js';
import { testConfig } from './fixtures.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('upstream auth requests', () => {
  it('uses the fixed Link origin and server-owned creation parameters', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({ id: 'lai_example' }),
    );
    await expect(
      createLinkAuthIntent(
        testConfig,
        { email: 'person@example.com', mode: 'test' },
        fetchImplementation,
      ),
    ).resolves.toEqual({ authIntentId: 'lai_example' });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, options] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBe('https://login.link.com/v1/link_auth_intent');
    expect(options).toMatchObject({
      headers: {
        Authorization: 'Bearer sk_test_example',
        'Content-Type': 'application/json',
      },
      method: 'POST',
      redirect: 'error',
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(options?.body))).toEqual({
      email: 'person@example.com',
      oauth_client_id: 'ca_test_example',
      oauth_scopes: 'auth.persist_login:read,crypto:ramp,kyc.status:read',
    });
  });

  it.each([
    [400, 403, 'link_sso_unavailable'],
    [404, 404, 'link_account_not_found'],
    [409, 409, 'link_reauthorization_required'],
    [500, 502, 'upstream_error'],
  ])(
    'maps Link auth-intent status %s to %s %s',
    async (upstreamStatus, statusCode, code) => {
      const fetchImplementation = vi.fn<typeof fetch>(async () =>
        jsonResponse({}, upstreamStatus),
      );

      await expect(
        createLinkAuthIntent(
          testConfig,
          { email: 'person@example.com', mode: 'test' },
          fetchImplementation,
        ),
      ).rejects.toMatchObject({ code, statusCode });
    },
  );

  it('keeps ordinary auth-intent errors when optional SSO is disabled', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({}, 400),
    );

    await expect(
      createLinkAuthIntent(
        { ...testConfig, oauthScopes: 'crypto:ramp,kyc.status:read' },
        { email: 'person@example.com', mode: 'test' },
        fetchImplementation,
      ),
    ).rejects.toMatchObject({ code: 'invalid_request', statusCode: 400 });
  });

  it('validates LAI path segments before credentialed token requests', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        access_token: 'liwltoken_example',
        expires_in: 3600,
        refresh: {
          expires_in: 7_776_000,
          refresh_token: 'liwlrefresh_example',
        },
      }),
    );
    await expect(
      retrieveOAuthCredentials(
        testConfig,
        { authIntentId: 'lai_example', mode: 'test' },
        fetchImplementation,
      ),
    ).resolves.toEqual({
      accessToken: 'liwltoken_example',
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://login.link.com/v1/link_auth_intent/lai_example/tokens',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk_test_example' },
        method: 'POST',
        redirect: 'error',
      }),
    );

    await expect(
      retrieveOAuthCredentials(
        testConfig,
        { authIntentId: 'lai_example/other', mode: 'test' },
        fetchImplementation,
      ),
    ).rejects.toThrow();
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expired access token once with server-owned OAuth credentials', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'liwltoken_expired',
          expires_in: 0,
          refresh: { refresh_token: 'liwlrefresh_example' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'liwltoken_refreshed',
          expires_in: 3600,
          refresh_token: 'liwlrefresh_rotated',
        }),
      );

    await expect(
      retrieveOAuthCredentials(
        testConfig,
        { authIntentId: 'lai_example', mode: 'test' },
        fetchImplementation,
      ),
    ).resolves.toEqual({
      accessToken: 'liwltoken_refreshed',
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    const [url, options] = fetchImplementation.mock.calls[1] ?? [];
    expect(url).toBe('https://login.link.com/auth/token');
    expect(options).toMatchObject({
      headers: {
        Authorization: 'Bearer sk_test_example',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
      redirect: 'error',
    });
    expect(String(options?.body)).toBe(
      new URLSearchParams({
        client_id: 'ca_test_example',
        client_secret: 'oauth_secret_example',
        grant_type: 'refresh_token',
        refresh_token: 'liwlrefresh_example',
        scope: 'auth.persist_login:read,crypto:ramp,kyc.status:read',
      }).toString(),
    );
  });

  it('requires reauthorization when the single refresh attempt is rejected', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'liwltoken_expired',
          expires_in: 0,
          refresh: { refresh_token: 'liwlrefresh_example' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, 400));

    await expect(
      retrieveOAuthCredentials(
        testConfig,
        { authIntentId: 'lai_example', mode: 'test' },
        fetchImplementation,
      ),
    ).rejects.toMatchObject({
      code: 'link_reauthorization_required',
      statusCode: 401,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it.each([
    [403, 401, 'link_authorization_required'],
    [404, 401, 'link_authorization_required'],
    [429, 502, 'upstream_error'],
  ])(
    'maps Link token status %s to %s %s',
    async (upstreamStatus, statusCode, code) => {
      const fetchImplementation = vi.fn<typeof fetch>(async () =>
        jsonResponse({}, upstreamStatus),
      );

      await expect(
        retrieveOAuthCredentials(
          testConfig,
          { authIntentId: 'lai_example', mode: 'test' },
          fetchImplementation,
        ),
      ).rejects.toMatchObject({ code, statusCode });
    },
  );

  it('passes OAuth access only in Stripe request options', async () => {
    const retrieve = vi.fn(async () => ({ id: 'crc_example' }));
    const stripeFactory = vi.fn(
      () =>
        ({
          crypto: { customers: { retrieve } },
        }) as unknown as Stripe,
    );
    await expect(
      retrieveCryptoCustomer(
        testConfig,
        {
          accessToken: 'liwltoken_example',
          cryptoCustomerId: 'crc_example',
          mode: 'test',
        },
        stripeFactory,
      ),
    ).resolves.toEqual({ cryptoCustomerId: 'crc_example' });

    expect(stripeFactory).toHaveBeenCalledWith('sk_test_example');
    expect(retrieve).toHaveBeenCalledWith('crc_example', {}, {
      headers: { 'Stripe-OAuth-Token': 'liwltoken_example' },
    });
  });

  it('creates Link auth tokens at the fixed Stripe origin', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        expires_in: 900,
        object: 'link.auth_token',
        token: 'lat_example_secret_example',
      }),
    );

    await expect(
      createLinkAuthToken(
        testConfig,
        { accessToken: 'liwltoken_example', mode: 'test' },
        fetchImplementation,
      ),
    ).resolves.toEqual({
      clientSecret: 'lat_example_secret_example',
      expiresIn: 900,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/link/auth_token',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer sk_test_example',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Stripe-OAuth-Token': 'liwltoken_example',
        },
        method: 'POST',
        redirect: 'error',
      }),
    );
  });

  it('reports when Stripe refuses seamless sign-in', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { code: 'oauth_access_token_invalid' } }, 403),
    );

    await expect(
      createLinkAuthToken(
        testConfig,
        { accessToken: 'liwltoken_example', mode: 'test' },
        fetchImplementation,
      ),
    ).rejects.toMatchObject({
      code: 'link_sso_unavailable',
      statusCode: 403,
    });
  });

  it.each([
    {
      code: 'invalid_request',
      rawMessage: undefined,
      statusCode: 400,
      upstreamStatus: 400,
    },
    {
      code: 'link_reauthorization_required',
      rawMessage: 'The OAuth access token is invalid.',
      statusCode: 401,
      upstreamStatus: 403,
    },
    {
      code: 'customer_not_authorized',
      rawMessage: undefined,
      statusCode: 403,
      upstreamStatus: 403,
    },
    {
      code: 'customer_not_authorized',
      rawMessage: undefined,
      statusCode: 403,
      upstreamStatus: 404,
    },
    {
      code: 'upstream_error',
      rawMessage: undefined,
      statusCode: 502,
      upstreamStatus: 401,
    },
    {
      code: 'upstream_error',
      rawMessage: undefined,
      statusCode: 502,
      upstreamStatus: 500,
    },
  ])(
    'maps Stripe customer status $upstreamStatus to $statusCode $code',
    async ({ upstreamStatus, rawMessage, statusCode, code }) => {
      const retrieve = vi.fn(async () => {
        throw Object.assign(new Error('Stripe request failed'), {
          ...(rawMessage === undefined ? {} : { raw: { message: rawMessage } }),
          statusCode: upstreamStatus,
        });
      });
      const stripeFactory = vi.fn(
        () =>
          ({
            crypto: { customers: { retrieve } },
          }) as unknown as Stripe,
      );

      await expect(
        retrieveCryptoCustomer(
          testConfig,
          {
            accessToken: 'liwltoken_example',
            cryptoCustomerId: 'crc_example',
            mode: 'test',
          },
          stripeFactory,
        ),
      ).rejects.toMatchObject({ code, statusCode });
    },
  );

  it('rejects malformed Link responses without exposing their contents', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({ refresh_token: 'should-not-be-returned' }),
    );
    await expect(
      retrieveOAuthCredentials(
        testConfig,
        { authIntentId: 'lai_example', mode: 'test' },
        fetchImplementation,
      ),
    ).rejects.toMatchObject({
      code: 'upstream_error',
      statusCode: 502,
    });
  });

  it('normalizes Link transport failures', async () => {
    const transportError = new Error('internal network details');
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      throw transportError;
    });
    await expect(
      createLinkAuthIntent(
        testConfig,
        { email: 'person@example.com', mode: 'test' },
        fetchImplementation,
      ),
    ).rejects.toMatchObject({
      cause: transportError,
      code: 'upstream_error',
      message: 'The upstream service could not complete the request.',
      statusCode: 502,
    });
  });
});
