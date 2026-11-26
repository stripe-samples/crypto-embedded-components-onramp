import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/create-app.js';
import { testConfig } from './fixtures.js';

describe('app', () => {
  it('serves the health contract with unrestricted CORS', async () => {
    const app = createApp(testConfig);
    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://preview.example.com');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  it('returns the stable error envelope for malformed JSON', async () => {
    const app = createApp(testConfig);
    const response = await request(app)
      .post('/link/auth_intent')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'invalid_request',
        message: 'The JSON request body is invalid.',
      },
    });
  });

  it('preserves safe body-parser client statuses', async () => {
    const app = createApp(testConfig);
    const response = await request(app)
      .post('/link/auth_intent')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ value: 'x'.repeat(110_000) }));

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: {
        code: 'invalid_request',
        message: 'The request body could not be processed.',
      },
    });
  });

  it('normalizes unsupported body encodings', async () => {
    const app = createApp(testConfig);
    const response = await request(app)
      .post('/link/auth_intent')
      .set('Content-Type', 'application/json; charset=invalid')
      .send('{}');

    expect(response.status).toBe(415);
    expect(response.body).toEqual({
      error: {
        code: 'invalid_request',
        message: 'The request body could not be processed.',
      },
    });
  });
});
