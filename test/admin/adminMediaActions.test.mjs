import { describe, test, expect } from 'vitest';
import { apiJson } from '../utils/httpClient.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';

describe('Admin media actions', () => {
  test('batch action unauthenticated rejected', async () => {
  await ensureTestDb();
  const { server, url: base } = await startEphemeral(adminApp);
    try {
      const { res } = await apiJson('POST', base, '/api/admin/media/actions', { action:'delete', ids:[1] });
      expect(res.statusCode).toBe(401);
    } finally { server.close(); }
  });
});
