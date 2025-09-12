import { strict as assert } from 'assert';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { ensureTestDb, createAuthenticatedServer } from '../testUtils/appHarness.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { query } from '../../server/db/db.js';
import fetch from 'node-fetch';

describe('admin media category backfill to tags', () => {
  let baseUrl, stop, cookie;
  beforeAll(async () => {
    await ensureTestDb();
    // Insert media rows with legacy categories then manually run backfill SQL (mirrors migration logic).
    const now = new Date().toISOString();
    const mkA = '/media/output/backfillA_'+Date.now()+'.mp4';
    const mkB = '/media/output/backfillB_'+Date.now()+'.mp4';
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, mkA, 'BF A', 'legacycat', now]);
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, mkB, 'BF B', 'legacycat', now]);
    // Backfill logic (idempotent)
    await query(`INSERT INTO media_tags (media_id, tag, created_at)
      SELECT m.id, lower(m.category), ?
      FROM media m
      WHERE m.category IS NOT NULL AND m.category != ''
        AND NOT EXISTS (SELECT 1 FROM media_tags mt WHERE mt.media_id = m.id AND mt.tag = lower(m.category))
    `, [now]);
    const started = await createAuthenticatedServer({ app: adminApp, role: 'admin' });
    baseUrl = started.url;
    cookie = started.cookie;
    stop = () => started.server.close();
  });
  afterAll(async () => { await stop?.(); });

  it('backfills legacy category as tag rows once', async () => {
  const resp = await fetch(baseUrl + '/api/admin/media?tag=legacycat&tagMode=all', { headers: { 'Cookie': cookie } });
    assert.equal(resp.status, 200, 'status ok');
    const data = await resp.json();
    const items = data.media || [];
  expect(items.length).toBeGreaterThanOrEqual(2);
    // Ensure no duplicate tag rows for a single media
    const { rows } = await query('SELECT media_id, tag, COUNT(*) as c FROM media_tags WHERE tag = ? GROUP BY media_id, tag', ['legacycat']);
    for(const r of rows){
      expect(Number(r.c)).toBe(1);
    }
  });
});
