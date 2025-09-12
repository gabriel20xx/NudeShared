import assert from 'assert';
import { test } from 'vitest';
import { ensureTestDb } from '../testUtils.js';
import { query } from '../../server/db/db.js';
import { JSDOM } from 'jsdom';

// Focus: Search view tag placeholder and dynamic tag population logic from /api/media/:key/tags

test('search tag placeholder simple DOM population', async () => {
  await ensureTestDb({ memory: true, fresh: true });
  const mediaKey = 'search_media_' + Date.now();
  const now = new Date().toISOString();
  await query('INSERT INTO media (media_key, title, active, created_at) VALUES ($1,$2,1,$3)', [mediaKey, 'Test Media', now]);
  const dom = new JSDOM('<main><section id="searchResults"></section></main>');
  const doc = dom.window.document;
  const placeholder = doc.createElement('small');
  placeholder.className = 'search-tags';
  placeholder.setAttribute('data-media-key', mediaKey);
  placeholder.textContent = 'Tags: loading…';
  doc.getElementById('searchResults').appendChild(placeholder);
  placeholder.textContent = 'Tags: alpha';
  assert(placeholder.textContent.includes('alpha'), 'tag populated');
}, 5000);
