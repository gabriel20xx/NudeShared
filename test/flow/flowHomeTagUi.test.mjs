import { describe, test, beforeAll, afterAll } from 'vitest';
import { startEphemeral, ensureTestDb } from '../testUtils.js';
import assert from 'assert';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';

// Focus: Homepage renders tag interaction scaffold
describe('flow home tag UI', () => {
  let server, base;
  beforeAll(async () => {
    await ensureTestDb();
    const mod = await import('../../../NudeFlow/src/app.js');
    const app = mod.default || mod.app || mod;
    ({ server, base } = await startEphemeral(app));
  }, 20000);

  afterAll(async () => { if(server) server.close(); });

  test('home page contains tag interactions section', async () => {
    const res = await fetch(base + '/');
    const html = await res.text();
    assert(res.status === 200, 'Expected 200 for home');
    // Basic structural assertions
    assert(/id="tag-interactions"/.test(html), 'tag interactions section missing');
    assert(/id="media-tags"/.test(html), 'media tags list missing');
    assert(/id="new-tag-input"/.test(html), 'new tag input missing');
    assert(/id="add-tag-btn"/.test(html), 'add tag button missing');
    // Accessibility attributes
    assert(/aria-label="Tag interactions"/.test(html), 'aria-label for interactions missing');
  });
});
