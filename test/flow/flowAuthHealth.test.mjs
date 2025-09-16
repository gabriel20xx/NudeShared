import { describe, test, expect } from 'vitest';
import http from 'http';
import { createApp } from '../../../NudeFlow/src/app.js';
import { startEphemeral } from '../utils/serverHelpers.mjs';

describe('Flow auth & health', () => {
  test('health endpoint (legacy redirect compatible)', async () => {
    const { server, port } = await startEphemeral(createApp);
    const base = `http://127.0.0.1:${port}`;
    try {
      const { status, location } = await new Promise(resolve => { http.get(base + '/health', res => { const out = { status: res.statusCode, location: res.headers.location }; res.resume(); resolve(out); }); });
      // New standardized behavior: /health is a 302 redirect to /healthz unless an app
      // defines its own legacy JSON. Accept either 200 (legacy) or 302 (alias redirect).
      expect([200, 302]).toContain(status);
      if (status === 302) {
        expect(location).toBe('/healthz');
        const statusHealthz = await new Promise(r => { http.get(base + '/healthz', res => { r(res.statusCode); res.resume(); }); });
        expect(statusHealthz).toBe(200); // liveness must succeed
      }
    } finally { server.close(); }
  });
});
