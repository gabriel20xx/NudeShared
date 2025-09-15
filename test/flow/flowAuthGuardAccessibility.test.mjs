import { describe, it, expect } from 'vitest';
import { ensureTestDb, startEphemeral } from '../testUtils.js';
import flowAppFactory from '../../../NudeFlow/src/app.js';
import { app as forgeApp } from '../../../NudeForge/src/app.js';

// Accessibility-focused test for shared auth guard partial semantics
// Ensures region role, descriptive paragraph id, and aria-describedby wiring.

describe('flowAuthGuardAccessibility', () => {
  it('unauth guard exposes region + aria-describedby for profile & playlists', async () => {
    await ensureTestDb();
    const forgeStarted = await startEphemeral(forgeApp); // for /profile
    const flowStarted = await startEphemeral(flowAppFactory); // for /playlists
    try {
      const profRes = await fetch(forgeStarted.url + '/profile');
      const profHtml = await profRes.text();
      expect(profRes.status).toBe(200);
      // message id pattern: <idPrefix>AuthMsg (idPrefix=profile)
      expect(profHtml).toMatch(/<div[^>]*role="region"[^>]*aria-describedby="profileAuthMsg"/);
      expect(profHtml).toMatch(/<p id="profileAuthMsg"[^>]*class="auth-guard-msg"/);
      expect(profHtml).toMatch(/<button[^>]*id="profileLoginLink"[^>]*aria-describedby="profileAuthMsg"/);

      const plRes = await fetch(flowStarted.url + '/playlists');
      const plHtml = await plRes.text();
      expect(plRes.status).toBe(200);
      // playlists idPrefix = pl
      expect(plHtml).toMatch(/<div[^>]*role="region"[^>]*aria-describedby="plAuthMsg"/);
      expect(plHtml).toMatch(/<p id="plAuthMsg"[^>]*class="auth-guard-msg"/);
      expect(plHtml).toMatch(/<button[^>]*id="plLoginLink"[^>]*aria-describedby="plAuthMsg"/);
    } finally {
      forgeStarted.server.close();
      flowStarted.server.close();
    }
  });
});
