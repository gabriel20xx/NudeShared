import { describe, test, expect } from 'vitest';
import { apiJson } from '../utils/httpClient.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';

describe('Admin users/media summary', () => {
  test('stats endpoint requires auth', async () => {
  await ensureTestDb();
  const { server, url: base } = await startEphemeral(adminApp);
    try {
      const { res } = await apiJson('GET', base, '/api/admin/stats');
      expect(res.statusCode).toBe(401);
    } finally { server.close(); }
  });
});
