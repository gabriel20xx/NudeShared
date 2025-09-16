import { describe, test, expect } from 'vitest';
import { createAuthenticatedServer } from '../utils/serverHelpers.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { resetTableReadiness } from '../../server/readiness/tableReadiness.js';
import { ensureTestDb } from '../utils/testDb.mjs';

// This test simulates a delayed settings table readiness for an authenticated admin.
// Strategy: ensure DB is fresh, drop settings table if exists, issue request (should 503),
// then create table and re-issue (should 200).

async function dropSettingsIfExists(query){
  try { await query('DROP TABLE IF EXISTS settings'); } catch { /* ignore */ }
}
async function createSettings(query){
  await query('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
  await query("INSERT OR REPLACE INTO settings(key,value) VALUES ('site_name','TestSite')");
}

describe('Admin settings readiness (authenticated, artificial delay)', () => {
  test('responds 503 before table exists then 200 after creation', async () => {
    process.env.NODE_ENV = 'test';
    await ensureTestDb({ memory: true, fresh: true });
    // Import query after DB ready
    const { query } = await import('../../server/db/db.js');
    await dropSettingsIfExists(query);
    resetTableReadiness('settings');
    const { server, url, cookie } = await createAuthenticatedServer({ app: adminApp, role: 'admin' });
    try {
      const res1 = await fetch(url + '/api/admin/settings', { headers: { Cookie: cookie } });
      expect([503]).toContain(res1.status); // must be 503 since table missing
      // Now create table
      await createSettings(query);
      resetTableReadiness('settings'); // ensure new readiness check
      const res2 = await fetch(url + '/api/admin/settings', { headers: { Cookie: cookie } });
      expect(res2.status).toBe(200);
      const json = await res2.json();
      expect(json.success).toBe(true);
      expect(json.settings.site_name).toBe('TestSite');
    } finally {
      server.close();
    }
  }, 10000);
});
