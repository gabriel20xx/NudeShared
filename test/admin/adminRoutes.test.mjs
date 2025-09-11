import { describe, test, expect } from 'vitest';
import http from 'http';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';

describe('Admin routes basic', () => {
  test('dashboard auth gate', async () => {
  await ensureTestDb();
  const { server, url: base } = await startEphemeral(adminApp);
    try {
      const req = http.request(base + '/dashboard', { method:'GET' });
      const status = await new Promise(r=>{ req.on('response', resp=>{ r(resp.statusCode); resp.resume(); }); req.end(); });
      expect(status).toBe(200); // renders auth-required overlay when unauth
    } finally { server.close(); }
  });
});
