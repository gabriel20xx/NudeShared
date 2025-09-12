import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { ensureTestDb, createAuthenticatedServer } from '../testUtils/appHarness.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { query } from '../../server/db/db.js';
import fetch from 'node-fetch';

// Test the legacy category usage audit endpoint. This helps ensure deprecation readiness metrics are exposed.
// Scenario seeds some media with categories and others without; asserts counts and distinct list.

describe('admin media category usage audit endpoint', () => {
  let baseUrl, stop, cookie;
  beforeAll(async () => {
    await ensureTestDb({ fresh: true });
    const now = new Date().toISOString();
    // Seed categories (legacy) & some null category rows
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, '/media/output/auditA_'+Date.now()+'.mp4', 'AuditA', 'legacyone', now]);
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, '/media/output/auditB_'+Date.now()+'.mp4', 'AuditB', 'legacyone', now]);
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, '/media/output/auditC_'+Date.now()+'.mp4', 'AuditC', 'legacytwo', now]);
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, '/media/output/auditD_'+Date.now()+'.mp4', 'AuditD', null, now]);
    const started = await createAuthenticatedServer({ app: adminApp, role: 'admin' });
    baseUrl = started.url; cookie = started.cookie; stop = () => started.server.close();
  });
  afterAll(async () => { await stop?.(); });

  it('returns remaining count and distinct categories list', async () => {
    const resp = await fetch(baseUrl + '/api/admin/schema/category-usage', { headers: { 'Cookie': cookie } });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.success).toBe(true);
  // remaining should be at least 3 (two legacyone + one legacytwo) but may be higher if other tests seeded legacy categories earlier in shared DB lifecycle
  expect(data.remaining).toBeGreaterThanOrEqual(3);
    const cats = data.distinct || [];
    // Should contain legacyone (uses 2) and legacytwo (uses 1)
    const one = cats.find(c=> c.category === 'legacyone');
    const two = cats.find(c=> c.category === 'legacytwo');
  expect(one && one.uses).toBeGreaterThanOrEqual(2);
  expect(two && two.uses).toBeGreaterThanOrEqual(1);
  });
});
