import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { ensureTestDb, createAuthenticatedServer } from '../testUtils/appHarness.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { query } from '../../server/db/db.js';
import fetch from 'node-fetch';

/* Verifies caching mechanism with cached:true on second call (no nocache). */

describe('admin media tag suggestions caching', () => {
  let baseUrl, stop, cookie;
  beforeAll(async () => {
    await ensureTestDb({ fresh:true });
    const now = new Date().toISOString();
    const mk = (n)=> `/media/output/cache_${n}_${Date.now()}.mp4`;
    const mediaKeys = [mk(1), mk(2)];
    for(const k of mediaKeys){
      await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, k, 'Cache', null, now]);
    }
    const { rows } = await query('SELECT id, media_key FROM media WHERE media_key IN (?,?)', mediaKeys);
    const idByKey = Object.fromEntries(rows.map(r=> [r.media_key, r.id]));
    const add = (key, tag)=> query('INSERT INTO media_tags (media_id, tag, created_at) VALUES (?,?,?)', [idByKey[key], tag, now]);
    await add(mediaKeys[0], 'cachetag');
    await add(mediaKeys[1], 'cachetag');
    const started = await createAuthenticatedServer({ app: adminApp, role:'admin' });
    baseUrl = started.url; cookie = started.cookie; stop = () => started.server.close();
  });
  afterAll(async () => { await stop?.(); });

  it('returns cached flag on second request', async () => {
    const first = await fetch(baseUrl + '/api/admin/media/tags/suggestions?limit=10', { headers:{ 'Cookie': cookie }});
    expect(first.status).toBe(200); const d1 = await first.json();
    expect(d1.success).toBe(true); expect(d1.cached||false).toBe(false);
    // Second call should be cached
    const second = await fetch(baseUrl + '/api/admin/media/tags/suggestions?limit=10', { headers:{ 'Cookie': cookie }});
    expect(second.status).toBe(200); const d2 = await second.json();
    expect(d2.success).toBe(true); expect(d2.cached).toBe(true);
    // nocache bypass
    const third = await fetch(baseUrl + '/api/admin/media/tags/suggestions?limit=10&nocache=1', { headers:{ 'Cookie': cookie }});
    const d3 = await third.json();
    expect(d3.success).toBe(true); expect(d3.cached||false).toBe(false);
  });
});
