import { describe, test, expect } from 'vitest';
import http from 'http';
import { createApp } from '../../../NudeFlow/src/app.js';
import { startEphemeral } from '../utils/serverHelpers.mjs';

describe('Flow auth & health', () => {
  test('health endpoint', async () => {
    const { server, port } = await startEphemeral(createApp);
    const base = `http://127.0.0.1:${port}`;
    try {
      const status = await new Promise(resolve => { http.get(base + '/health', res => { resolve(res.statusCode); res.resume(); }); });
      expect(status).toBe(200);
    } finally { server.close(); }
  });
});
