import assert from 'assert';
import { test } from 'vitest';
import { ensureTestDb } from '../testUtils.js';
import { createApp } from '../../../NudeFlow/src/app.js';
import fetch from 'node-fetch';
import { query } from '../../server/db/db.js';

// Focus: /api/media/state returns counts after seeding events

test('media state returns seeded counts', async () => {
  await ensureTestDb({ memory: true, fresh: true });
  // Start app once (no extra DB init) via manual server
  const express = await import('express');
  const http = await import('http');
  const app = await createApp();
  const server = http.createServer(app);
  await new Promise(r=> server.listen(0,r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const mediaKey = 'media_' + Date.now();
    const now = new Date().toISOString();
    await query('INSERT INTO media (media_key, title, active, created_at) VALUES ($1,$2,1,$3)', [mediaKey, 'Title', now]);
    await query('INSERT INTO media_views (media_key, user_id, created_at) VALUES ($1,$2,$3)', [mediaKey, null, now]);
    await query('INSERT INTO media_likes (media_key, user_id, created_at) VALUES ($1,$2,$3)', [mediaKey, null, now]);
    await query('INSERT INTO media_saves (media_key, user_id, created_at) VALUES ($1,$2,$3)', [mediaKey, null, now]);
    await query('INSERT INTO media_downloads (media_key, user_id, created_at) VALUES ($1,$2,$3)', [mediaKey, null, now]);
    const res = await fetch(base + `/api/media/state?mediaKey=${encodeURIComponent(mediaKey)}`);
    assert.strictEqual(res.status, 200, 'state endpoint 200');
  const json = await res.json();
  // Debug edge case: log response shape when ok flag missing
  if(!json.ok){ console.log('MEDIA_STATE_TEST_DEBUG', json); }
    if(json.ok){
      assert.strictEqual(json.counts.views, 1);
      assert.strictEqual(json.counts.likes, 1);
      assert.strictEqual(json.counts.saves, 1);
      assert.strictEqual(json.counts.downloads, 1);
    } else if(json.success){
      // Legacy/alternative shape from media interaction router
      assert(json.data, 'data present');
      assert.strictEqual(json.data.likeCount, 1, 'likeCount matches seeded like');
    } else {
      assert.fail('Unexpected response shape');
    }
  } finally { server.close(); }
}, 15000);
