import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as forgeApp } from '../../../NudeForge/src/app.js';

// Basic ETag + caching policy regression tests

test('forge static assets emit ETag and caching headers', async () => {
  await ensureTestDb();
  const { server, url } = await startEphemeral(forgeApp);
  try {
    // style.css
    const styleRes = await fetch(url + '/css/style.css');
    expect(styleRes.status).toBe(200);
    expect(styleRes.headers.get('etag')).toBeTruthy();
    expect(styleRes.headers.get('cache-control')).toMatch(/max-age=3600/);

    // theme.css
    const themeRes = await fetch(url + '/assets/theme.css');
    expect(themeRes.status).toBe(200);
    expect(themeRes.headers.get('etag')).toBeTruthy();
    const themeCache = themeRes.headers.get('cache-control');
    expect(themeCache).toMatch(/max-age=3600/);

    // Simulate conditional request for style.css
    const etag = styleRes.headers.get('etag');
    const conditional = await fetch(url + '/css/style.css', { headers: { 'If-None-Match': etag } });
    // Express static strong ETag should return 304
    expect([200,304]).toContain(conditional.status);
    if (conditional.status === 304) {
      expect(conditional.headers.get('etag')).toBe(etag);
    }
  } finally { server.close(); }
}, 20000);
