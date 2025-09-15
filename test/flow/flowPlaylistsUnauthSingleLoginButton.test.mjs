import { describe, it, expect } from 'vitest';
import { startEphemeral } from '../testUtils.js';
import flowApp from '../../../NudeFlow/src/app.js';

// Focus: Ensure unauth /playlists renders a single login button (no duplication after auth-guard consolidation)

describe('flowPlaylistsUnauthSingleLoginButton', () => {
  it('unauth /playlists has exactly one #plLoginLink button', async () => {
    const { server, base } = await startEphemeral(flowApp);
    try {
      const res = await fetch(base + '/playlists');
      expect(res.status).toBe(200);
      const html = await res.text();
      const matches = html.match(/id="plLoginLink"/g) || [];
      expect(matches.length).toBe(1);
    } finally {
      server.close();
    }
  });
});
