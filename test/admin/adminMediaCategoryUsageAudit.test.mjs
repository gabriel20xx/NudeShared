import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { ensureTestDb, createAuthenticatedServer } from '../testUtils/appHarness.mjs';
import { resetMigrationFlag } from '../utils/testDb.mjs';
import path from 'path';
import fs from 'fs';
import { query } from '../../server/db/db.js';
import fetch from 'node-fetch';

// NOTE: This test asserts the legacy category values are still present (not soft-nulled).
// Other tests (adminMediaCategorySoftNull) intentionally enable ENABLE_SOFT_NULL_CATEGORY to exercise Phase 3.
// If that test ran earlier in the same process it will have mutated the environment variable before migrations
// causing softNullLegacyCategory() to run and NULL out category values, making remaining=0 here.
// To ensure correctness and isolation, we explicitly UNSET the flag before ensuring the fresh test DB so that
// migrations run WITHOUT soft-null behavior for this audit endpoint test.
delete process.env.ENABLE_SOFT_NULL_CATEGORY;

// Test the legacy category usage audit endpoint. This helps ensure deprecation readiness metrics are exposed.
// Scenario seeds some media with categories and others without; asserts counts and distinct list.

describe('admin media category usage audit endpoint', () => {
  let baseUrl, stop, cookie;
  beforeAll(async () => {
  // Use a unique file-based SQLite DB so the admin app (which will initialize its own connection)
  // sees the seeded data. In-memory would create separate isolated instances.
  const uniqueDb = path.resolve(process.cwd(), 'database', 'audit_usage_'+Date.now()+'.db');
  try { fs.mkdirSync(path.dirname(uniqueDb), { recursive: true }); } catch {}
  process.env.SQLITE_PATH = uniqueDb;
  resetMigrationFlag();
  await ensureTestDb({ fresh: true });
    const now = new Date().toISOString();
    // Seed categories (legacy) & some null category rows
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, '/media/output/auditA_'+Date.now()+'.mp4', 'AuditA', 'legacyone', now]);
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, '/media/output/auditB_'+Date.now()+'.mp4', 'AuditB', 'legacyone', now]);
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, '/media/output/auditC_'+Date.now()+'.mp4', 'AuditC', 'legacytwo', now]);
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, '/media/output/auditD_'+Date.now()+'.mp4', 'AuditD', null, now]);
  // (Removed verbose debug logging previously used for diagnosing SQLite isolation)
  await query('SELECT id, category FROM media ORDER BY id ASC');
    // Dynamically import the admin app AFTER seeding to avoid any premature migration side-effects
    const { app: adminApp } = await import('../../../NudeAdmin/src/app.js');
    const started = await createAuthenticatedServer({ app: adminApp, role: 'admin' });
    baseUrl = started.url; cookie = started.cookie; stop = () => started.server.close();
  });
  afterAll(async () => { await stop?.(); });

  it('returns remaining count and distinct categories list', async () => {
    const resp = await fetch(baseUrl + '/api/admin/schema/category-usage', { headers: { 'Cookie': cookie } });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.success).toBe(true);
  // Expect at least the 3 seeded non-null category rows (two legacyone + one legacytwo)
  expect(data.remaining).toBeGreaterThanOrEqual(3);
    const cats = data.distinct || [];
    // Should contain legacyone (uses 2) and legacytwo (uses 1)
    const one = cats.find(c=> c.category === 'legacyone');
    const two = cats.find(c=> c.category === 'legacytwo');
  expect(one && one.uses).toBeGreaterThanOrEqual(2);
  expect(two && two.uses).toBeGreaterThanOrEqual(1);
  });
});
