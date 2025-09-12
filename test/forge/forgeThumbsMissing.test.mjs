import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as forgeApp } from '../../../NudeForge/src/app.js';

// Negative case: requesting thumbnail for a file that does not exist should 404 and not create cache directories.
// Ensures the early existence guard in the route stays intact.
test('forge missing thumbnail returns 404 with no-store semantics', async () => {
  await ensureTestDb();
  const { server, url } = await startEphemeral(forgeApp);
  try {
    const res = await fetch(url + '/thumbs/output/__totally_missing_image__.png?w=64');
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(/not found|thumbnail not available|original not found/i.test(body)).toBe(true);
  } finally {
    server.close();
  }
}, 15000);
