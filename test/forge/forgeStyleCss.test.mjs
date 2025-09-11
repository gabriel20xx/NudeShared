import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as forgeApp } from '../../../NudeForge/src/app.js';

// Verifies NudeForge serves /css/style.css and header includes link tag when rendering generator page
// Ensures earlier middleware sets res.locals.appCssHref before route handlers render views

test('forge style.css served and linked in generator page', async () => {
  await ensureTestDb();
  const { server, url } = await startEphemeral(forgeApp);
  try {
    // Fetch stylesheet directly
    const cssRes = await fetch(url + '/css/style.css');
    expect(cssRes.status).toBe(200);
    const css = await cssRes.text();
    expect(css).toMatch(/NudeForge main stylesheet/);
    expect(css.length).toBeGreaterThan(500); // basic size sanity

    // Fetch generator page HTML and assert link inclusion
    const pageRes = await fetch(url + '/generator');
    expect(pageRes.status).toBe(200);
    const html = await pageRes.text();
    // Look for <link rel="stylesheet" href="/css/style.css">
    expect(html).toMatch(/<link[^>]+href=["']\/css\/style\.css["']/i);
  } finally { server.close(); }
}, 15000);
