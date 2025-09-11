import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as forgeApp } from '../../../NudeForge/src/app.js';

// Unauthenticated profile page should render login prompt (shared profile partial unauth branch)

test('profile page unauthenticated shows login prompt', async () => {
  await ensureTestDb();
  const { server, url } = await startEphemeral(forgeApp);
  try {
    const res = await fetch(url + '/profile', { redirect: 'manual' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/You must be logged in to view your profile/);
    expect(html).toMatch(/id="profileLoginLink"/);
  } finally { server.close(); }
}, 20000);
