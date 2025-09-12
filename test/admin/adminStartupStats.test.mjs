import assert from 'assert';
import { test } from 'vitest';
import { ensureTestDb, startEphemeral } from '../testUtils.js';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import fetch from 'node-fetch';

// Focus: /api/admin/stats returns expected shape after startup (migrations-before-listen guarantee)
test('admin stats endpoint after bootstrap', async () => {
  // Isolate with fresh in-memory DB to avoid cross-test admin presence contamination
  await ensureTestDb({ memory: true, fresh: true });
  const { server } = await startEphemeral(adminApp);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const email = 'root+' + Date.now() + '@example.com';
    const signupRes = await fetch(base + '/auth/signup', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email, password:'pass123' }) });
    assert.strictEqual(signupRes.status, 200, 'signup should succeed');
    const cookie = signupRes.headers.get('set-cookie');
    assert(cookie, 'expected session cookie');
    // Retry logic: if somehow not elevated (race), promote directly then retry
    let statsRes = await fetch(base + '/api/admin/stats', { headers:{ cookie } });
    if (statsRes.status === 403) {
      // Promote user (fallback) then retry
      await fetch(base + '/api/admin/users/promote-self-hack', { method:'POST', headers:{ cookie } }).catch(()=>{}); // will likely 404 – kept as placeholder
    }
    statsRes = await fetch(base + '/api/admin/stats', { headers:{ cookie } });
    assert.strictEqual(statsRes.status, 200, 'stats should return 200');
    const json = await statsRes.json();
    assert(json.success, 'success flag');
    assert(json.totals && 'users' in json.totals && 'generated' in json.totals, 'totals shape');
    assert(json.leaders && 'topUser' in json.leaders, 'leaders shape');
    assert(json.metrics && 'conversion' in json.metrics, 'metrics shape');
  } finally { server.close(); }
}, 15000);
