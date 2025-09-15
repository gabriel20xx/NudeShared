import { strict as assert } from 'assert';
import { ensureTestDb, startEphemeral } from '../testUtils.js';
import flowAppFactory from '../../../NudeFlow/src/app.js';
import fetch from 'node-fetch';

// Focus: /playlists unauthenticated shows styled auth button (auth-btn) like profile page

describe('flowPlaylistsUnauthLoginButton', () => {
  let server, base;
  beforeAll(async () => {
    await ensureTestDb();
    const started = await startEphemeral(flowAppFactory);
    server = started.server; base = started.url;
  });
  afterAll(async () => { if(server) await server.close(); });

  test('unauth /playlists has auth guard container and styled login button', async () => {
    const r = await fetch(base + '/playlists');
    assert.equal(r.status, 200, 'status 200');
    const html = await r.text();
    assert.ok(html.includes('id="pl-auth-guard"'), 'contains auth guard div');
    // Expect auth-btn styled button markup
    assert.ok(/<button[^>]*id="plLoginLink"[^>]*class="[^"]*auth-btn/.test(html), 'contains styled auth button');
  }, 8000);
});
