import assert from 'assert';
import { test } from 'vitest';
import { ensureTestDb, startEphemeral } from '../testUtils.js';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

// Focus: Dashboard overlay elements render and JS includes overlay container
test('dashboard overlay elements present', async () => {
  await ensureTestDb({ memory: true, fresh: true });
  const { server } = await startEphemeral(adminApp);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const email = 'dash+' + Date.now() + '@example.com';
    const signupRes = await fetch(base + '/auth/signup', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email, password:'pass123' }) });
    const cookie = signupRes.headers.get('set-cookie');
    assert(cookie, 'expected cookie');
    const dashRes = await fetch(base + '/dashboard', { headers:{ cookie } });
    assert.strictEqual(dashRes.status, 200, 'dashboard page 200');
    const html = await dashRes.text();
    const dom = new JSDOM(html);
    const overlay = dom.window.document.getElementById('dashImageOverlay');
    const fullImg = dom.window.document.getElementById('dashImgFull');
    const closeBtn = dom.window.document.getElementById('dashImgClose');
    assert(overlay, 'overlay container present');
    assert(fullImg, 'full image element present');
    assert(closeBtn, 'close button present');
  } finally { server.close(); }
}, 15000);
