import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../src/app.js';

describe('app', () => {
  it('serves the health contract without external dependencies', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
