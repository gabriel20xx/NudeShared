import { describe, test, beforeAll, afterAll } from 'vitest';
import { startEphemeral, ensureTestDb } from '../testUtils.js';
import assert from 'assert';
import fetch from 'node-fetch';

// Focus: Floating controls contain tags button in correct order (save -> tags -> auto) and overlay markup present

describe('flow tags overlay floating button', () => {
  let server, base;
  beforeAll(async () => {
    await ensureTestDb();
    const mod = await import('../../../NudeFlow/src/app.js');
    const app = mod.default || mod.app || mod;
    ({ server, base } = await startEphemeral(app));
  }, 20000);

  afterAll(async () => { if(server) server.close(); });

  test('tags button ordering and overlay exists', async () => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    const html = await res.text();
    // Overlay markup exists
    assert(/id="tagsOverlay"/.test(html), 'tags overlay container missing');
    // Buttons should render dynamically; we check order by class names sequence
    const orderMatch = html.match(/float-btn--save[\s\S]*?float-btn--tags[\s\S]*?float-btn--auto/);
    assert(orderMatch, 'Expected save -> tags -> auto button ordering in floating controls');
    // Accessibility basics
    assert(/aria-controls="tagsOverlay"/.test(html) || /id="tagsOverlayBtn"/.test(html), 'tags overlay trigger attributes missing');
  });
});
