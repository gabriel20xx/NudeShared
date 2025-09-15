import { describe, it, expect } from 'vitest';
import { startEphemeral } from '../testUtils.js';
import flowApp from '../../../NudeFlow/src/app.js';

// Focus: Ensure unauthenticated playlists page centers auth guard similarly to profile.

describe('flowPlaylistsUnauthCentered', () => {
  it('unauth /playlists shows centered auth guard container', async () => {
    const { server, base } = await startEphemeral(flowApp);
    try {
      const res = await fetch(base + '/playlists');
      expect(res.status).toBe(200);
      const html = await res.text();
      // Verify guard container present
      expect(html).toMatch(/id="pl-auth-guard"/);
      // Expect inner container has flex centering styles (align-items:center;justify-content:center;flex-direction:column)
      expect(html).toMatch(/id="pl-auth-guard-inner"[\s\S]*display:flex;align-items:center;justify-content:center;flex-direction:column/);
      // Ensure message and button present and text aligned center via text-align or inherited center (profile uses center via layout; we added explicit text-align for paragraph)
      expect(html).toMatch(/You must be logged in to manage playlists\./);
      expect(html).toMatch(/id="plLoginLink"/);
    } finally {
      server.close();
    }
  });
});
