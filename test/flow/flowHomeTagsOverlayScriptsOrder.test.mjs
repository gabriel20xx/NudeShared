import { describe, it, expect } from 'vitest';
import { startEphemeral } from '../testUtils.js';
import { buildFlowApp } from './flowAppFactory.mjs';

// Focus: ensure shared overlay script is present and loaded before home-tags-overlay.js so window.NCOverlay is defined.

describe('flowHomeTagsOverlayScriptsOrder', () => {
  it('home page includes /shared/overlay.js before /js/home-tags-overlay.js', async () => {
    const appFactory = async () => await buildFlowApp();
    const { server, url } = await startEphemeral(appFactory);
    try {
      const res = await fetch(url + '/');
      const html = await res.text();
      expect(res.status).toBe(200);
      const overlayIdx = html.indexOf('/shared/overlay.js');
      const tagsOverlayIdx = html.indexOf('/js/home-tags-overlay.js');
      expect(overlayIdx).toBeGreaterThan(-1);
      expect(tagsOverlayIdx).toBeGreaterThan(-1);
      expect(overlayIdx).toBeLessThan(tagsOverlayIdx);
    } finally {
      server.close();
    }
  });
});
