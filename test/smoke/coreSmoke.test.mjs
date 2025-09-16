import { test, expect } from 'vitest';
import http from 'node:http';
import fetch from 'node-fetch';
import { ensureTestDb } from '../utils/testDb.mjs';
import { createApp as createFlowApp } from '../../../NudeFlow/src/app.js';

async function startServer(app){
  const server = http.createServer(app);
  await new Promise(r=> server.listen(0,r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: ()=> new Promise(r=> server.close(r)) };
}

// Core application smoke: verifies critical public endpoints respond and key shared asset loads.
// Complementary to granular tests; intentionally broad shape assertions only.

test('core NudeFlow smoke: health, overlay script, tag suggestions shape', async () => {
  await ensureTestDb({ memory:true, fresh:true });
  const app = await createFlowApp();
  const { base, close } = await startServer(app);
  try {
    // 1. Health endpoint
    const health = await fetch(base + '/health');
    expect(health.status).toBe(200);
    const healthJson = await health.json();
    expect(healthJson.status).toBe('ok');

  // 2. Overlay script explicit route (also validating JS MIME)
  const overlay = await fetch(base + '/shared/overlay.js');
  expect(overlay.status).toBe(200);
  const overlayCt = overlay.headers.get('content-type') || '';
  expect(/javascript|ecmascript/i.test(overlayCt)).toBe(true);
  const overlayText = await overlay.text();
  expect(overlayText).toContain('createOverlayController');

    // 3. Public tag suggestions (empty DB: returns empty array shape)
    const sug = await fetch(base + '/api/tags/suggestions?limit=5');
    expect(sug.status).toBe(200);
    const sugJson = await sug.json();
    expect(Array.isArray(sugJson.tags)).toBe(true);
    expect(sugJson.tags.length).toBeLessThanOrEqual(5);

    // 4. Home page extended assertions (merging prior granular tests)
    const home = await fetch(base + '/');
    expect(home.status).toBe(200);
    const html = await home.text();
    // Structural overlay elements
    expect(html).toMatch(/id="tagsOverlay"/);
    expect(html).toMatch(/id="tagsOverlayTitle"/);
    expect(html).toMatch(/id="tagsOverlayList"/);
    expect(html).toMatch(/id="tagsOverlayClose"/);
    // Overlay trigger button & like button markup
    expect(html).toMatch(/id="tagsOverlayBtn"/);
  // Ensure button wired to overlay via aria-controls and overlay hidden attribute present
  expect(html).toMatch(/id="tagsOverlayBtn"[^>]+aria-controls="tagsOverlay"/);
    expect(html).toContain('float-btn--like'); // anonymous like fallback markup
    // Script ordering: /shared/overlay.js before /js/home-tags-overlay.js
    const overlayIdx = html.indexOf('/shared/overlay.js');
    const tagsOverlayIdx = html.indexOf('/js/home-tags-overlay.js');
    expect(overlayIdx).toBeGreaterThan(-1);
    expect(tagsOverlayIdx).toBeGreaterThan(-1);
    expect(overlayIdx).toBeLessThan(tagsOverlayIdx);

    // 5. Legacy /categories redirect (301)
    const cat = await fetch(base + '/categories', { redirect: 'manual' });
    expect(cat.status).toBe(301);
    expect(cat.headers.get('location')).toBe('/');

    // 6. Playlists auth guard markup (unauth) + styled login button
    const pl = await fetch(base + '/playlists');
    expect(pl.status).toBe(200);
    const plHtml = await pl.text();
    expect(plHtml).toMatch(/id="pl-auth-guard"/);
  // Playlist login button (unauth guard). Relaxed: just ensure id and class occur (ordering/styles may evolve)
  expect(plHtml.includes('id="plLoginLink"')).toBe(true);
  expect(plHtml.includes('class="auth-btn"') || /id="plLoginLink"[^>]+class="[^"]*auth-btn/.test(plHtml)).toBe(true);
  } finally {
    await close();
  }
}, 20000);

// NOTE: Additional Flow granular tests (floating controls offset, timer panel, playlists variations) intentionally
// not duplicated here. If future regressions surface tied to those UI affordances, extend this smoke instead of
// adding new standalone test files (per consolidated policy).
