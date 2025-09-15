import { describe, it, expect } from 'vitest';
import { ensureTestDb, startEphemeral } from '../testUtils.js';
import flowAppFactory from '../../../NudeFlow/src/app.js';

// Focused test: playlists page should NOT include floating media controls (homepage only)
describe('flowPlaylistsNoFloatingControls', () => {
  it('unauth /playlists has no .floating-controls markup', async () => {
    await ensureTestDb();
    // Start actual Flow app (passing a string caused http.createServer to receive invalid arg)
    const { server, url: baseUrl } = await startEphemeral(flowAppFactory);
    try {
      const res = await fetch(baseUrl + '/playlists');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).not.toMatch(/floating-controls/);
    } finally {
      server.close();
    }
  });
});
