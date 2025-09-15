import { strict as assert } from 'assert';
import { ensureTestDb, startEphemeral } from '../testUtils.js';
import flowAppFactory from '../../../NudeFlow/src/app.js';
import fetch from 'node-fetch';
// Correct relative path to shared DB
import { query, getDriver } from '../../server/db/db.js';

// Focus: /tags page populates grid with suggestions

describe('flowTagsPageLoads', () => {
  let server, base, mediaKey;
  beforeAll(async () => {
    await ensureTestDb();
    const spin = await startEphemeral(flowAppFactory);
    base = spin.url; server = spin.server;
    const driver = getDriver();
    mediaKey = 'tags_page_media_'+Date.now();
    const insertMedia = driver==='pg' ? 'INSERT INTO media (media_key, title, active) VALUES ($1,$2,TRUE)' : 'INSERT INTO media (media_key, title, active) VALUES (?,?,1)';
    const mediaIdSql = driver==='pg' ? 'SELECT id FROM media WHERE media_key=$1' : 'SELECT id FROM media WHERE media_key=?';
    const tagInsert = driver==='pg' ? 'INSERT INTO media_tags (media_id, tag) VALUES ($1,$2)' : 'INSERT INTO media_tags (media_id, tag) VALUES (?,?)';

    // Base media row
    await query(insertMedia, [mediaKey, 'Tags Page Media']);
    const { rows: baseRows } = await query(mediaIdSql, [mediaKey]);
    const baseId = baseRows[0].id;
    await query(tagInsert, [baseId, 'epsilon_unique']);

    // Amplify frequency for delta_unique across several distinct media rows
    for(let i=0;i<8;i++){
      const mk = `flow_tag_multi_${Date.now()}_${i}_${Math.random().toString(16).slice(2)}`;
      await query(insertMedia, [mk, 'Title '+i]);
      const { rows: midRows } = await query(mediaIdSql, [mk]);
      const mid = midRows[0].id;
      await query(tagInsert, [mid, 'delta_unique']);
    }
  });
  afterAll(async () => { if(server) await server.close(); });

  test('serves tags page HTML containing container; suggestions endpoint returns seeded tags', async () => {
    const page = await fetch(base + '/tags');
    assert.equal(page.status, 200, 'page 200');
    const html = await page.text();
    assert.ok(html.includes('id="tagsGrid"'), 'has tagsGrid container');
    // Retry loop in case initial aggregation/cache warm takes a tick
    let found = false; let lastNames = [];
    for(let attempt=0; attempt<5 && !found; attempt++){
      const r = await fetch(base + '/api/tags/suggestions?limit=50');
      const j = await r.json();
      const names = j.tags.map(t=> t.tag || t);
      lastNames = names;
      if(names.includes('delta_unique')) { found = true; break; }
      await new Promise(res=> setTimeout(res, 50));
    }
    assert.ok(found, 'contains delta_unique (names='+lastNames.join(',')+')');
  }, 12000);
});
