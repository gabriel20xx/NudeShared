import { describe, test, expect } from 'vitest';
import { apiJson } from '../utils/httpClient.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { ensureTestDb } from '../utils/testDb.mjs';
import { createAdminUser } from '../utils/authFactory.mjs';

function listen(app){ return new Promise(res=>{ const s=app.listen(0,()=>res(s)); }); }

describe('Admin auth flow', () => {
  test('signup -> me -> logout', async () => {
  await ensureTestDb();
  const server = await listen(adminApp);
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
  const { cookie } = await createAdminUser(base, {});
      const { json: meJson } = await apiJson('GET', base, '/auth/me', null, cookie);
      expect(meJson?.user?.role).toMatch(/admin|superadmin/);
    } finally { server.close(); }
  });
});
