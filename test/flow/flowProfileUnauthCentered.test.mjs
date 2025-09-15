import { describe, it, expect } from 'vitest';
import { startEphemeral } from '../testUtils.js';
import flowApp from '../../../NudeFlow/src/app.js';

// Focus: Ensure unauthenticated profile page centers auth guard vertically similar to playlists.

describe('flowProfileUnauthCentered', () => {
  it('unauth /profile centers auth guard content vertically', async () => {
    const { server, base } = await startEphemeral(flowApp);
    try {
      const res = await fetch(base + '/profile');
      expect(res.status).toBe(200);
      const html = await res.text();
      // Should include wrapper with min-height calc and flex alignment tokens
      expect(html).toMatch(/id="profile-auth-wrapper"[^"]*style="[^"]*display:flex;align-items:center;justify-content:center;min-height:calc\(100vh - \(var\(--topbar-height\) \+ var\(--bottom-nav-height\)\)\)/);
      // Shared auth guard still present with login button
      expect(html).toMatch(/id="profileLoginLink"/);
    } finally { server.close(); }
  });
});
