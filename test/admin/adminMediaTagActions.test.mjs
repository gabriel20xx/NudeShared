// Tests tag bulk actions: add_tags, remove_tags, replace_tags
import { strict as assert } from 'assert';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { ensureTestDb, createAuthenticatedServer } from '../testUtils/appHarness.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { query } from '../../server/db/db.js';
import { createMedia } from '../utils/mediaFactory.mjs';
import fetch from 'node-fetch';

describe('admin media tag actions', () => {
  let baseUrl, stop, cookie;
  beforeAll(async () => {
    await ensureTestDb();
    const started = await createAuthenticatedServer({ app: adminApp, role: 'admin' });
    baseUrl = started.url;
    cookie = started.cookie;
    stop = () => started.server.close();
  });
  afterAll(async () => { await stop?.(); });

  it('should add, remove and replace tags via bulk actions', async () => {
    // get first admin user id
    const { rows: adminRows } = await query('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
    const adminId = adminRows?.[0]?.id || 1;

  // Avoid setting legacy category so backfill does not introduce extra tag; we focus only on explicit tag operations here.
  const m1 = await createMedia({ userId: adminId, mediaKey: '/media/output/tagA_'+Date.now()+'.mp4', title: 'TagTestA', tags: ['one'] });
  const m2 = await createMedia({ userId: adminId, mediaKey: '/media/output/tagB_'+Date.now()+'.mp4', title: 'TagTestB', tags: [] });

    // add_tags
  let resp = await fetch(baseUrl + '/api/admin/media/actions', { method: 'POST', headers: { 'content-type': 'application/json', 'Cookie': cookie }, body: JSON.stringify({ action: 'add_tags', ids: [m1.id, m2.id], tags: 'two, three' }) });
    assert.equal(resp.status, 200, 'add_tags status');

    // remove tag 'one' from m1 only
  resp = await fetch(baseUrl + '/api/admin/media/actions', { method: 'POST', headers: { 'content-type': 'application/json', 'Cookie': cookie }, body: JSON.stringify({ action: 'remove_tags', ids: [m1.id], tags: 'one' }) });
    assert.equal(resp.status, 200, 'remove_tags status');

    // replace tags on m2 with single tag four
  resp = await fetch(baseUrl + '/api/admin/media/actions', { method: 'POST', headers: { 'content-type': 'application/json', 'Cookie': cookie }, body: JSON.stringify({ action: 'replace_tags', ids: [m2.id], tags: 'four' }) });
    assert.equal(resp.status, 200, 'replace_tags status');

    // fetch list filtered by tag four should include m2 only
  resp = await fetch(baseUrl + '/api/admin/media?tag=four', { headers: { 'Cookie': cookie } });
    const data = await resp.json();
    const items = data.media || [];
    const foundM2 = items.find(x => x.id === m2.id);
    const foundM1 = items.find(x => x.id === m1.id);
  expect(foundM2).toBeTruthy();
  expect(foundM1).toBeFalsy();

    // fetch without filter and confirm tag sets
  resp = await fetch(baseUrl + '/api/admin/media', { headers: { 'Cookie': cookie } });
    const all = (await resp.json()).media || [];
    const fullM1 = all.find(x => x.id === m1.id);
    const fullM2 = all.find(x => x.id === m2.id);
    expect(new Set(fullM1.tags)).toEqual(new Set(['two','three']));
    expect(new Set(fullM2.tags)).toEqual(new Set(['four']));
  });
});
