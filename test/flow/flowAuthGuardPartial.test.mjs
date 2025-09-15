import { describe, it, expect } from 'vitest';
import { ensureTestDb, startEphemeral } from '../testUtils.js';
import flowAppFactory from '../../../NudeFlow/src/app.js';
import { app as forgeApp } from '../../../NudeForge/src/app.js';

// Focused test: ensure shared auth guard partial renders consistently for unauthenticated users
// /profile is served from Forge (shared profile page) and /playlists from Flow.

describe('flowAuthGuardPartial', () => {
  it('unauth /profile (forge) and /playlists (flow) expose unified auth button IDs', async () => {
    await ensureTestDb();
    const forgeStarted = await startEphemeral(forgeApp);
    const flowStarted = await startEphemeral(flowAppFactory);
    try {
      const profileRes = await fetch(forgeStarted.url + '/profile');
      const profileHtml = await profileRes.text();
      expect(profileRes.status).toBe(200);
      expect(profileHtml).toMatch(/id="profileLoginLink"/);
      expect(profileHtml).toMatch(/class="auth-btn"/);

      const playlistsRes = await fetch(flowStarted.url + '/playlists');
      const playlistsHtml = await playlistsRes.text();
      expect(playlistsRes.status).toBe(200);
      expect(playlistsHtml).toMatch(/id="plLoginLink"/);
      expect(playlistsHtml).toMatch(/class="auth-btn"/);
    } finally {
      forgeStarted.server.close();
      flowStarted.server.close();
    }
  });
});
