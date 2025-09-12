import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { ensureTestDb, createAuthenticatedServer } from '../testUtils/appHarness.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { query } from '../../server/db/db.js';
import fetch from 'node-fetch';

/*
  Co-occurrence test seeds media with overlapping tags:
   M1: alpha, beta
   M2: alpha, beta, gamma
   M3: alpha, gamma
   M4: beta, gamma
  Counts (media-level):
   alpha-beta: appears on M1,M2 => 2
   alpha-gamma: M2,M3 => 2
   beta-gamma: M2,M4 => 2
  All pairs equal count => ordering falls back to alphabetical pair ordering (a asc, b asc).
*/

describe('admin media tag cooccurrence endpoint', () => {
  let baseUrl, stop, cookie;
  beforeAll(async () => {
    await ensureTestDb({ fresh:true });
    const now = new Date().toISOString();
    const mk = (n)=> '/media/output/co_'+n+'_'+Date.now()+'.mp4';
    const mediaKeys = [mk(1), mk(2), mk(3), mk(4)];
    for(const k of mediaKeys){
      await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, k, 'CoTest', null, now]);
    }
    const { rows } = await query('SELECT id, media_key FROM media WHERE media_key IN (?,?,?,?)', mediaKeys);
    const idByKey = Object.fromEntries(rows.map(r=> [r.media_key, r.id]));
    const addTag = (key, tag) => query('INSERT INTO media_tags (media_id, tag, created_at) VALUES (?,?,?)', [idByKey[key], tag, now]);
    // M1
    await addTag(mediaKeys[0],'alpha'); await addTag(mediaKeys[0],'beta');
    // M2
    await addTag(mediaKeys[1],'alpha'); await addTag(mediaKeys[1],'beta'); await addTag(mediaKeys[1],'gamma');
    // M3
    await addTag(mediaKeys[2],'alpha'); await addTag(mediaKeys[2],'gamma');
    // M4
    await addTag(mediaKeys[3],'beta'); await addTag(mediaKeys[3],'gamma');

    const started = await createAuthenticatedServer({ app: adminApp, role: 'admin' });
    baseUrl = started.url; cookie = started.cookie; stop = () => started.server.close();
  });
  afterAll(async () => { await stop?.(); });

  it('returns tag pairs with association metrics', async () => {
    const resp = await fetch(baseUrl + '/api/admin/media/tags/cooccurrence?limit=10', { headers: { 'Cookie': cookie }});
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.success).toBe(true);
    const pairs = data.pairs || [];
    // Expect at least the three pairs we seeded (alpha-beta, alpha-gamma, beta-gamma)
    const needed = ['alpha|beta','alpha|gamma','beta|gamma'];
    const present = new Set(pairs.map(p=> `${p.a}|${p.b}`));
    needed.forEach(n=> expect(present.has(n)).toBe(true));
    // Each pair count should be >=2 based on seeding
    needed.forEach(n=> {
      const pr = pairs.find(p=> `${p.a}|${p.b}`===n);
      expect(pr.count).toBeGreaterThanOrEqual(2);
      expect(pr.jaccard).toBeGreaterThan(0);
      expect(pr.lift).toBeGreaterThan(0);
    });
    // Alphabetical ordering fallback (counts equal) => alpha|beta first, alpha|gamma second (since beta < gamma), beta|gamma later
    const order = pairs.filter(p=> needed.includes(`${p.a}|${p.b}`)).map(p=> `${p.a}|${p.b}`);
    expect(order[0]).toBe('alpha|beta');
  });
});
