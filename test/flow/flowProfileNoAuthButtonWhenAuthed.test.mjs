import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { createApp as createFlowApp } from '../../../NudeFlow/src/app.js';
import { createUser } from '../utils/authFactory.mjs';

// Flow profile authenticated view should show the profile container and NOT render the auth guard/login button

test('flow profile page authenticated hides auth guard and shows profile content', async () => {
  await ensureTestDb();
  const { server, url } = await startEphemeral(createFlowApp);
  try {
    const user = await createUser(url, { email: 'flowprof_'+Date.now()+'@ex.com', password: 'pw12345' });
    const res = await fetch(url + '/profile', { headers: { Cookie: user.cookie } });
    expect(res.status).toBe(200);
    const html = await res.text();
    // Should contain the main profile container
    expect(html).toMatch(/id="profile-container"/);
  // Should not show auth guard message or guard-specific login link/button (header auth button is expected)
    expect(html).not.toMatch(/You must be logged in to view your profile/);
    expect(html).not.toMatch(/profileLoginLink/); // id from auth guard button
  // Do NOT assert absence of generic .auth-btn because the persistent header login button remains visible by design.
  } finally { server.close(); }
}, 20000);
