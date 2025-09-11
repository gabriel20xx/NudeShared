import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { createApp as createFlowApp } from '../../../NudeFlow/src/app.js';
import { createUser } from '../utils/authFactory.mjs';

// Contract test for /api/profile (unauth & auth variants)
test('profile API returns anonymous for unauth and user details when authenticated', async () => {
  await ensureTestDb();
  const { server, url } = await startEphemeral(async () => await createFlowApp());
  try {
    async function getJson(path, options) {
      const controller = new AbortController();
      const to = setTimeout(()=>controller.abort(), 5000);
      const res = await fetch(url + path, { ...(options||{}), signal: controller.signal }).catch(e=>{ throw new Error('Fetch failed '+path+': '+e.message); });
      clearTimeout(to);
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = { parseError: true, text }; }
      return { res, json };
    }
    // Try /api/profile (preferred) then fallback to /profile if 404 or parseError
    let unauth = await getJson('/api/profile');
    if (unauth.res.status === 404) {
      unauth = await getJson('/profile');
    }
    expect(unauth.res.status).toBe(200);
    expect(unauth.json.success).toBe(true);
    expect(unauth.json.data?.username).toBe('Anonymous');
    expect(unauth.json.data?.mfaEnabled).toBe(false);
    const user = await createUser(url, { email: 'prof_api_'+Date.now()+'@ex.com', password: 'pw12345' });
  let auth = await getJson('/api/profile', { headers: { Cookie: user.cookie } });
  if (auth.res.status === 404) auth = await getJson('/profile', { headers: { Cookie: user.cookie } });
    expect(auth.res.status).toBe(200);
    expect(auth.json.success).toBe(true);
    expect(auth.json.data?.email).toBe(user.email);
    expect(auth.json.data).toHaveProperty('id');
    expect(auth.json.data).toHaveProperty('username');
    expect(auth.json.data).toHaveProperty('bio');
    expect(typeof auth.json.data.mfaEnabled).toBe('boolean');
    expect(typeof auth.json.data.profilePicture).toBe('string');
  } finally { server.close(); }
}, 30000);
