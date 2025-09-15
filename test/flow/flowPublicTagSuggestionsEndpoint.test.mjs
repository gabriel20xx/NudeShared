import { strict as assert } from 'assert';
import { ensureTestDb, startEphemeral } from '../testUtils.js';
import flowAppFactory from '../../../NudeFlow/src/app.js';
import fetch from 'node-fetch';
// Correct relative path to shared db helpers: test/flow/... -> server/db/db.js is ../../server/db/db.js
import { query, getDriver } from '../../server/db/db.js';

// Focus: public /api/tags/suggestions endpoint works unauthenticated

describe('flowPublicTagSuggestionsEndpoint', () => {
  let server, base;
  beforeAll(async () => {
    await ensureTestDb();
    const started = await startEphemeral(flowAppFactory);
    base = started.url; server = started.server;
    // Seed some tags (insert media + tags)
    const driver = getDriver();
    const mediaKey = 'test_media_'+Date.now();
    // Insert media record
    if(driver==='pg') {
      await query('INSERT INTO media (media_key, title, active) VALUES ($1,$2,TRUE)', [mediaKey, 'Test Media']);
    } else {
      await query('INSERT INTO media (media_key, title, active) VALUES (?,?,1)', [mediaKey, 'Test Media']);
    }
    // Resolve id and insert tags
    const sqlMedia = driver==='pg' ? 'SELECT id FROM media WHERE media_key=$1' : 'SELECT id FROM media WHERE media_key=?';
    const { rows } = await query(sqlMedia, [mediaKey]);
    const id = rows[0].id;
    const tagInsert = driver==='pg'
      ? 'INSERT INTO media_tags (media_id, tag) VALUES ($1,$2)'
      : 'INSERT INTO media_tags (media_id, tag) VALUES (?,?)';
    for(const t of ['alpha','beta','gamma']){
      await query(tagInsert, [id, t]);
    }
  });
  afterAll(async () => { if(server) await server.close(); });

  test('returns tag suggestions without auth', async () => {
    const r = await fetch(base + '/api/tags/suggestions?limit=5');
    assert.equal(r.status, 200, 'status 200');
    const j = await r.json();
    assert.ok(Array.isArray(j.tags), 'tags array');
    const names = j.tags.map(t=> t.tag || t);
    assert.ok(names.includes('alpha'), 'contains seeded tag');
  }, 10000);
});
