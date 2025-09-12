import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { ensureTestDb, createAuthenticatedServer } from '../testUtils/appHarness.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { query } from '../../server/db/db.js';
import fetch from 'node-fetch';

/* Seeds similar tags to produce typo candidate grouping. */

describe('admin media tag typo candidates endpoint', () => {
  let baseUrl, stop, cookie;
  beforeAll(async () => {
    await ensureTestDb({ fresh:true });
    const now = new Date().toISOString();
    const mk = (n)=> `/media/output/typo_${n}_${Date.now()}.mp4`;
    const mediaKeys = Array.from({ length: 6 }, (_,i)=> mk(i));
    for(const k of mediaKeys){
      await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, k, 'Typo', null, now]);
    }
    const { rows } = await query(`SELECT id, media_key FROM media WHERE media_key IN (${mediaKeys.map(()=> '?').join(',')})`, mediaKeys);
    const idByKey = Object.fromEntries(rows.map(r=> [r.media_key, r.id]));
    const add = (k,t)=> query('INSERT INTO media_tags (media_id, tag, created_at) VALUES (?,?,?)', [idByKey[k], t, now]);
    // Intentionally similar variants: "colour", "color", "colr" plus unrelated anchor
    await add(mediaKeys[0],'colour');
    await add(mediaKeys[1],'color');
    await add(mediaKeys[2],'colr');
    await add(mediaKeys[3],'color'); // increase frequency
    await add(mediaKeys[4],'colors'); // near variant but distance 1 from color(s trimmed?) -> still should appear maybe; distance=2
    await add(mediaKeys[5],'palette'); // unrelated anchor word
    const started = await createAuthenticatedServer({ app: adminApp, role:'admin' });
    baseUrl = started.url; cookie = started.cookie; stop = () => started.server.close();
  });
  afterAll(async () => { await stop?.(); });

  it('returns variant groups with normalized representative', async () => {
    const resp = await fetch(baseUrl + '/api/admin/media/tags/typo-candidates?distance=2&max=10', { headers:{ 'Cookie': cookie }});
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.success).toBe(true);
    const groups = data.groups || [];
    // Find group containing color/colour
    const grp = groups.find(g=> g.variants.some(v=> v.tag==='color') && g.variants.some(v=> v.tag==='colour'));
    expect(grp).toBeTruthy();
    expect(grp.variants.length).toBeGreaterThanOrEqual(3); // color, colour, colr (maybe colors)
    // Normalized should be most frequent variant (color appears twice)
    expect(grp.normalized).toBe('color');
  });
});
