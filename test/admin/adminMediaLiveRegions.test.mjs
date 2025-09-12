import { strict as assert } from 'assert';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { ensureTestDb, createAuthenticatedServer } from '../testUtils/appHarness.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import fetch from 'node-fetch';

// Simple heuristic HTML presence test for live region + overlay container

describe('admin media live regions + overlay elements', () => {
  let baseUrl, stop, cookie;
  beforeAll(async () => {
    await ensureTestDb();
    const started = await createAuthenticatedServer({ app: adminApp, role: 'admin' });
    baseUrl = started.url;
    cookie = started.cookie;
    stop = () => started.server.close();
  });
  afterAll(async () => { await stop?.(); });

  it('renders media page with #mediaLive aria-live and #mediaOverlay', async () => {
  const resp = await fetch(baseUrl + '/admin/media', { headers: { 'Cookie': cookie } });
    assert.equal(resp.status, 200, 'status 200');
    const html = await resp.text();
    expect(html.includes('id="mediaLive"')).toBe(true);
    expect(/id="mediaLive"[^>]*aria-live="polite"/.test(html)).toBe(true);
    expect(/id="mediaOverlay"/.test(html)).toBe(true);
  });
});
