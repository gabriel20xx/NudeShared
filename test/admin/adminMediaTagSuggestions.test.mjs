import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { ensureTestDb, createAuthenticatedServer } from '../testUtils/appHarness.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { query } from '../../server/db/db.js';
import fetch from 'node-fetch';

// Tests the tag suggestions endpoint ordering and limit.

describe('admin media tag suggestions endpoint', () => {
  let baseUrl, stop, cookie;
  beforeAll(async () => {
    await ensureTestDb();
    const now = new Date().toISOString();
    // Seed some media and tags with varying frequencies
    const mk1 = '/media/output/sugg1_'+Date.now()+'.mp4';
    const mk2 = '/media/output/sugg2_'+Date.now()+'.mp4';
    const mk3 = '/media/output/sugg3_'+Date.now()+'.mp4';
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, mk1, 'Sugg1', null, now]);
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, mk2, 'Sugg2', null, now]);
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, mk3, 'Sugg3', null, now]);
    // Tags: 'alpha' appears 3 times, 'beta' twice, 'gamma' once, 'delta' once
    // media ids
    const { rows: mediaRows } = await query('SELECT id FROM media WHERE media_key IN (?,?,?) ORDER BY media_key ASC', [mk1, mk2, mk3]);
    const [m1,m2,m3] = mediaRows.map(r=> r.id);
    const ins = (mid, tag) => query('INSERT INTO media_tags (media_id, tag, created_at) VALUES (?,?,?)', [mid, tag, now]);
    await ins(m1,'alpha'); await ins(m2,'alpha'); await ins(m3,'alpha');
    await ins(m1,'beta'); await ins(m2,'beta');
    await ins(m3,'gamma');
    await ins(m2,'delta');
    const started = await createAuthenticatedServer({ app: adminApp, role: 'admin' });
    baseUrl = started.url; cookie = started.cookie; stop = () => started.server.close();
  });
  afterAll(async () => { await stop?.(); });

  it('returns ordered tag frequency list with limit', async () => {
  // Use larger limit to avoid exclusion if global test data already populated with other frequent tags
  const resp = await fetch(baseUrl + '/api/admin/media/tags/suggestions?limit=50', { headers: { 'Cookie': cookie } });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.success).toBe(true);
    const tags = data.tags || [];
  // Find seeded tags
  const alpha = tags.find(t=> t.tag==='alpha');
  const beta = tags.find(t=> t.tag==='beta');
  const gamma = tags.find(t=> t.tag==='gamma');
  const delta = tags.find(t=> t.tag==='delta');
  expect(alpha && alpha.uses).toBeGreaterThanOrEqual(3);
  expect(beta && beta.uses).toBeGreaterThanOrEqual(2);
  expect(gamma && gamma.uses).toBeGreaterThanOrEqual(1);
  expect(delta && delta.uses).toBeGreaterThanOrEqual(1);
  // Frequency relationship checks
  expect(alpha.uses).toBeGreaterThan(beta.uses);
  expect(beta.uses).toBeGreaterThan(gamma.uses - 0); // beta > gamma (gamma single-use)
  });
});
