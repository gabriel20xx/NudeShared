import { describe, test, expect } from 'vitest';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { createApp } from '../../../NudeFlow/src/app.js';
import fetch from 'node-fetch';

async function postJson(url, body, cookie){
  const res = await fetch(url, { method:'POST', headers: { 'Content-Type':'application/json', ...(cookie?{Cookie:cookie}:{}) }, body: JSON.stringify(body) });
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, json: await res.json().catch(()=>({})), cookie: setCookie };
}

describe('NudeFlow login', () => {
  test('signup then login (email + username case-insensitive)', async () => {
    const { server, port } = await startEphemeral(createApp);
    const base = `http://127.0.0.1:${port}`;
    try {
      // Randomize to avoid collision with existing DB state across test runs
      const rand = Math.random().toString(36).slice(2,10);
      const mixedEmail = `UserExample${rand}@Test.com`;
      const lowerEmail = mixedEmail.toLowerCase();
      const username = 'FlowUser' + rand;
      // Signup
      const signup = await postJson(base + '/auth/signup', { email: mixedEmail, password: 'secretpw', username });
      expect(signup.status).toBe(200);
      const cookie = signup.cookie;
      expect(signup.json.user.email).toBe(lowerEmail);
      // Logout to clear session
      await postJson(base + '/auth/logout', {}, cookie);
      // Login via lowercased username
      const login1 = await postJson(base + '/auth/login', { email: username.toLowerCase(), password: 'secretpw' });
      expect(login1.status).toBe(200);
      expect(login1.json.user).toBeTruthy();
      // Login via original mixed-case email
      const login2 = await postJson(base + '/auth/login', { email: mixedEmail, password: 'secretpw' });
      expect(login2.status).toBe(200);
      expect(login2.json.user.email).toBe(lowerEmail);
    } finally { server.close(); }
  });
});
