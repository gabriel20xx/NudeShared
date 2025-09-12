import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { ensureTestDb, createAuthenticatedServer } from '../testUtils/appHarness.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { query } from '../../server/db/db.js';
import fetch from 'node-fetch';

/* Verifies coverage endpoint limit vs full scan semantics. */

describe('admin media tag coverage endpoint (limit/full)', () => {
  let baseUrl, stop, cookie;
  beforeAll(async () => {
    await ensureTestDb({ fresh:true });
    const now = new Date().toISOString();
    // Create > 5 media rows to exercise limit truncation
    const keys = Array.from({ length: 30 }, (_,i)=> `/media/output/covlim_${i}_${Date.now()}.mp4`);
    for(const k of keys){
      await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, k, 'CovLim', null, now]);
    }
    // Tag only first 10 to produce mix
    const { rows } = await query(`SELECT id, media_key FROM media WHERE media_key IN (${keys.map(()=> '?').join(',')})`, keys);
    for(let i=0;i<10;i++){
      await query('INSERT INTO media_tags (media_id, tag, created_at) VALUES (?,?,?)', [rows[i].id, 'limtag', now]);
    }
    const started = await createAuthenticatedServer({ app: adminApp, role:'admin' });
    baseUrl = started.url; cookie = started.cookie; stop = () => started.server.close();
  });
  afterAll(async () => { await stop?.(); });

  it('respects limit parameter and returns full flag', async () => {
    const resp = await fetch(baseUrl + '/api/admin/media/tags/coverage?min=1&limit=5', { headers:{ 'Cookie': cookie }});
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(data.full).toBe(false);
    expect(data.limit).toBe(5);
    expect(data.total).toBeLessThanOrEqual(5);
  });

  it('full=1 overrides limit', async () => {
    const resp = await fetch(baseUrl + '/api/admin/media/tags/coverage?min=1&limit=5&full=1', { headers:{ 'Cookie': cookie }});
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.success).toBe(true);
    expect(data.full).toBe(true);
    // Should scan more than 5 (we inserted 30)
    expect(data.total).toBeGreaterThan(5);
  });
});
