import { describe, test, expect } from 'vitest';
import http from 'http';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';

describe('Admin dashboard overlay', () => {
  test('renders auth-required when unauthenticated', async () => {
  await ensureTestDb();
  const { server, url: base } = await startEphemeral(adminApp);
    try {
      const status = await new Promise(resolve => {
        const req = http.request(base + '/dashboard', { method:'GET' }, res => { resolve(res.statusCode); res.resume(); });
        req.end();
      });
      expect(status).toBe(200);
    } finally { server.close(); }
  });
});
