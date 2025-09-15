import { strict as assert } from 'assert';
import { ensureTestDb, startEphemeral } from '../testUtils.js';
import flowAppFactory from '../../../NudeFlow/src/app.js';
import fetch from 'node-fetch';

// Focus: home page includes tags overlay trigger button
// NOTE: Use Vitest style (no mocha this.timeout)

describe('flowHomeHasTagsOverlayButton', () => {
  let server, base;
  beforeAll(async () => { await ensureTestDb(); const s = await startEphemeral(flowAppFactory); base = s.url; server = s.server; });
  afterAll(async () => { if (server) await server.close(); });
  test('contains #Tags overlay button', async () => {
    const r = await fetch(base + '/');
    assert.equal(r.status, 200, 'home 200');
    const html = await r.text();
    assert.ok(html.includes('id="tagsOverlayBtn"'), 'button present');
    assert.ok(html.includes('id="tagsOverlay"'), 'overlay markup present');
  }, 8000);
});
