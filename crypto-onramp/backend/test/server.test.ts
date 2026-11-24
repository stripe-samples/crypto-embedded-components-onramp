import { Server } from 'node:http';

import { describe, expect, it, vi } from 'vitest';

describe('server module', () => {
  it('does not open a listener when imported', async () => {
    const listen = vi.spyOn(Server.prototype, 'listen');

    await import('../src/server.js');

    expect(listen).not.toHaveBeenCalled();
    listen.mockRestore();
  });
});
