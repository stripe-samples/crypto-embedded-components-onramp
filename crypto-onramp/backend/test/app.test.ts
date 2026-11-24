import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

describe('app', () => {
  it('serves the health contract without external dependencies', async () => {
    const app = createApp({
      corsAllowedOrigins: ['https://example.com'],
    });
    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://example.com');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://example.com',
    );
  });
});
