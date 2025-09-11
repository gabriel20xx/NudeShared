import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as forgeApp } from '../../../NudeForge/src/app.js';

// Ensures /assets/theme.css is served (primary or fallback mount)
test('forge theme.css served at /assets/theme.css', async () => {
  await ensureTestDb();
  const { server, url } = await startEphemeral(forgeApp);
  try {
  const res = await fetch(url + '/assets/theme.css');
  expect(res.status).toBe(200);
  // Theme may be mounted via dynamic sendFile without explicit cache header; tolerate absence but if present ensure it's public
  const tCache = res.headers.get('cache-control');
  if (tCache) expect(tCache).toMatch(/public|max-age/i);
  const css = await res.text();
    expect(css).toMatch(/--color-accent/);
    expect(css.length).toBeGreaterThan(200); // sanity size check
  } finally { server.close(); }
}, 15000);
