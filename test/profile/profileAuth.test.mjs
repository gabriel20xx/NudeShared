import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as forgeApp } from '../../../NudeForge/src/app.js';
import { createUser } from '../utils/authFactory.mjs';

// Authenticated profile page should include profile container and hide unauth login link

test('profile page authenticated shows profile container', async () => {
  await ensureTestDb();
  const { server, url } = await startEphemeral(forgeApp);
  try {
  const user = await createUser(url, { email: 'prof_'+Date.now()+'@ex.com', password: 'pw12345' });
  // createUser already returns a valid session cookie
  const res = await fetch(url + '/profile', { headers: { Cookie: user.cookie } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/id="profile-container"/);
    expect(html).not.toMatch(/You must be logged in to view your profile/);
  } finally { server.close(); }
}, 20000);
