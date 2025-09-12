import { describe, test, expect } from 'vitest';
import http from 'http';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { createAdminUser } from '../utils/authFactory.mjs';

// This test ensures the media admin page includes per-row checkbox inputs and a global select-all checkbox.
// We only verify the presence of the markup (not interactive behavior) since JS runs client-side.

describe('Admin media view checkboxes', () => {
  test('media page contains selection checkboxes', async () => {
    await ensureTestDb();
    const { server, url: base } = await startEphemeral(adminApp);
    try {
      // authenticate (bootstrap first admin)
      const { cookie } = await createAdminUser(base, {});
      const body = await new Promise((resolve, reject) => {
        const req = http.request(base + '/media', { method: 'GET', headers:{ Cookie: cookie } }, (res) => {
          let data = '';
          res.on('data', (c) => data += c);
          res.on('end', () => resolve(data));
        });
        req.on('error', reject); req.end();
      });
      // Check for the select-all checkbox id placeholder and row checkbox class
      expect(body).toMatch(/mediaSelectAllGlobal/);
      expect(body).toMatch(/mediaRowChk/);
    } finally { server.close(); }
  });
});
