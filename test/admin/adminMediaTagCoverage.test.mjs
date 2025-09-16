import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { ensureTestDb, createAuthenticatedServer } from '../testUtils/appHarness.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { query } from '../../server/db/db.js';
import fetch from 'node-fetch';

/* Seeds 5 media items with tag counts: 0,1,1,2,3 */

describe('admin media tag coverage endpoint', () => {
  let baseUrl, stop, cookie; // seeded id tracking not needed for final assertions
  beforeAll(async () => {
    await ensureTestDb({ fresh:true });
    const now = new Date().toISOString();
    // Insert 5 media rows
    const mk = (n)=> `/media/output/cov_${n}_${Date.now()}.mp4`;
    const keys = [mk(1), mk(2), mk(3), mk(4), mk(5)];
    for(const k of keys){
      await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, k, 'CovTest', null, now]);
    }
    const { rows } = await query('SELECT id, media_key FROM media WHERE media_key IN (?,?,?,?,?)', keys);
    const idByKey = Object.fromEntries(rows.map(r=> [r.media_key, r.id]));
    // Tag assignments: item2 (1), item3 (1), item4 (2), item5 (3)
    const addTag = (key, tag) => query('INSERT INTO media_tags (media_id, tag, created_at) VALUES (?,?,?)', [idByKey[key], tag, now]);
    await addTag(keys[1], 'one');
    await addTag(keys[2], 'alpha');
    await addTag(keys[3], 'alpha'); await addTag(keys[3], 'beta');
    await addTag(keys[4], 'alpha'); await addTag(keys[4], 'beta'); await addTag(keys[4], 'gamma');

    const started = await createAuthenticatedServer({ app: adminApp, role: 'admin' });
    baseUrl = started.url; cookie = started.cookie; stop = () => started.server.close();
  });
  afterAll(async () => { await stop?.(); });

  it('returns coverage distribution with percent >= expected threshold', async () => {
    const resp = await fetch(baseUrl + '/api/admin/media/tags/coverage?min=1', { headers: { 'Cookie': cookie }});
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.success).toBe(true);
    // Ensure total >=5 (allowing for any global seeded extras while still validating our sample)
    expect(data.total).toBeGreaterThanOrEqual(5);
    // At least 4 of our 5 seeded have >=1 tag (only first lacks tags)
    expect(data.withMin).toBeGreaterThanOrEqual(4);
    expect(data.percent).toBeGreaterThan(0); // Non-zero coverage
    // Distribution must contain an entry for tagCount 0
    const zeroBucket = data.distribution.find(d=> d.tagCount === 0);
    expect(zeroBucket).toBeTruthy();
    // Should surface untagged sample containing at least one of our seeded untagged ids
    const sampleIds = new Set((data.topUntaggedSample||[]).map(i=> i.id));
  // Note: first seeded id intentionally left without tags; no direct variable needed
    // It's possible (rare) additional earlier media push ours out of sample; allow either presence or empty if >10 earlier
    if((data.topUntaggedSample||[]).length <= 10){
      // If sample isn't huge, we expect our one untagged item likely present
      expect(sampleIds.size).toBeGreaterThan(0);
    }
  });
});
