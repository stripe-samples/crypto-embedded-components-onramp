import { decodeJwt, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import {
  JWT_AUDIENCE,
  JWT_ISSUER,
} from '../src/config.js';
import {
  createJwtService,
  JwtValidationError,
} from '../src/jwt.js';

const signingSecret = 'a-secure-signing-secret-with-32-bytes';

describe('backend JWTs', () => {
  it('issues distinct typed flow and verified session credentials', async () => {
    const now = new Date('2026-11-24T20:00:00Z');
    const jwt = createJwtService(signingSecret, () => now);
    const flowToken = await jwt.issueFlowToken({
      authIntentId: 'lai_example',
      mode: 'test',
    });
    const sessionToken = await jwt.issueSessionToken({
      authIntentId: 'lai_example',
      cryptoCustomerId: 'crc_example',
      mode: 'test',
    });

    await expect(jwt.verifyFlowToken(flowToken)).resolves.toEqual({
      authIntentId: 'lai_example',
      mode: 'test',
    });
    await expect(jwt.verifySessionToken(sessionToken)).resolves.toEqual({
      authIntentId: 'lai_example',
      cryptoCustomerId: 'crc_example',
      mode: 'test',
    });
    await expect(jwt.verifyFlowToken(sessionToken)).rejects.toBeInstanceOf(
      JwtValidationError,
    );

    const sessionPayload = decodeJwt(sessionToken);
    const flowPayload = decodeJwt(flowToken);
    expect(flowPayload.exp! - flowPayload.iat!).toBe(900);
    expect(sessionPayload.exp! - sessionPayload.iat!).toBe(86_400);
    expect(sessionPayload).not.toHaveProperty('email');
    expect(sessionPayload).not.toHaveProperty('access_token');
    expect(sessionPayload).not.toHaveProperty('refresh_token');
    expect(sessionPayload).not.toHaveProperty('customer_ownership_verified');
    expect(sessionPayload).not.toHaveProperty('link_consent_verified');
    expect(sessionPayload).not.toHaveProperty('verified_at');
  });

  it('rejects expired and tampered flow tokens', async () => {
    let now = new Date('2026-11-24T20:00:00Z');
    const jwt = createJwtService(signingSecret, () => now);
    const flowToken = await jwt.issueFlowToken({
      authIntentId: 'lai_example',
      mode: 'test',
    });

    const tampered = `${flowToken.slice(0, -1)}${flowToken.endsWith('a') ? 'b' : 'a'}`;
    await expect(jwt.verifyFlowToken(tampered)).rejects.toBeInstanceOf(
      JwtValidationError,
    );

    now = new Date('2026-11-24T20:15:01Z');
    await expect(jwt.verifyFlowToken(flowToken)).rejects.toBeInstanceOf(
      JwtValidationError,
    );
  });

  it.each([
    { audience: 'wrong-audience', label: 'audience' },
    { issuer: 'wrong-issuer', label: 'issuer' },
    { mode: 'staging', label: 'mode' },
    { tokenVersion: 2, label: 'version' },
    { typ: 'NOT-JWT', label: 'header type' },
  ])('rejects an invalid $label', async (overrides) => {
    const now = new Date('2026-11-24T20:00:00Z');
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const jwt = createJwtService(signingSecret, () => now);
    const invalidToken = await new SignJWT({
      auth_intent_id: 'lai_example',
      mode: overrides.mode ?? 'test',
      token_type: 'flow',
      version: overrides.tokenVersion ?? 1,
    })
      .setProtectedHeader({ alg: 'HS256', typ: overrides.typ ?? 'JWT' })
      .setIssuer(overrides.issuer ?? JWT_ISSUER)
      .setAudience(overrides.audience ?? JWT_AUDIENCE)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 900)
      .sign(new TextEncoder().encode(signingSecret));

    await expect(jwt.verifyFlowToken(invalidToken)).rejects.toBeInstanceOf(
      JwtValidationError,
    );
  });

  it('rejects algorithms outside the allowlist', async () => {
    const now = new Date('2026-11-24T20:00:00Z');
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const jwt = createJwtService(signingSecret, () => now);
    const invalidToken = await new SignJWT({
      auth_intent_id: 'lai_example',
      mode: 'test',
      token_type: 'flow',
      version: 1,
    })
      .setProtectedHeader({ alg: 'HS384', typ: 'JWT' })
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 900)
      .sign(new TextEncoder().encode(signingSecret));

    await expect(jwt.verifyFlowToken(invalidToken)).rejects.toBeInstanceOf(
      JwtValidationError,
    );
  });

  it('refuses to sign unsafe identifiers', async () => {
    const jwt = createJwtService(signingSecret);

    await expect(
      jwt.issueFlowToken({
        authIntentId: 'lai_example/other',
        mode: 'test',
      }),
    ).rejects.toThrow();
    await expect(
      jwt.issueFlowToken({
        authIntentId: 'lai_example',
        mode: 'staging' as 'test',
      }),
    ).rejects.toBeInstanceOf(JwtValidationError);
  });
});
