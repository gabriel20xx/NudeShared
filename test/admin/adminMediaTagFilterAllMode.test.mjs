import { strict as assert } from 'assert';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { ensureTestDb, createAuthenticatedServer } from '../testUtils/appHarness.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { query } from '../../server/db/db.js';
import { createMedia } from '../utils/mediaFactory.mjs';
import fetch from 'node-fetch';

describe('admin media tagMode=all filtering', () => {
  let baseUrl, stop, cookie;
  beforeAll(async () => {
    await ensureTestDb();
    const started = await createAuthenticatedServer({ app: adminApp, role: 'admin' });
    baseUrl = started.url;
    cookie = started.cookie;
    stop = () => started.server.close();
  });
  afterAll(async () => { await stop?.(); });

  it('returns only media that contain all requested tags when tagMode=all', async () => {
    const { rows: adminRows } = await query('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
    const adminId = adminRows?.[0]?.id || 1;

    const m1 = await createMedia({ userId: adminId, mediaKey: '/media/output/allA_'+Date.now()+'.mp4', tags: ['alpha','beta','gamma'] });
    const m2 = await createMedia({ userId: adminId, mediaKey: '/media/output/allB_'+Date.now()+'.mp4', tags: ['alpha','beta'] });
    const m3 = await createMedia({ userId: adminId, mediaKey: '/media/output/allC_'+Date.now()+'.mp4', tags: ['alpha'] });

  const resp = await fetch(baseUrl + '/api/admin/media?tag=alpha,beta&tagMode=all', { headers: { 'Cookie': cookie } });
    assert.equal(resp.status, 200, 'status ok');
    const data = await resp.json();
    const ids = (data.media||[]).map(m=> m.id);
    expect(ids).toContain(m1.id);
    expect(ids).toContain(m2.id);
    expect(ids).not.toContain(m3.id);
  });
});
