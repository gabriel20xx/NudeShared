import { describe, it, expect } from 'vitest';

// This test ensures that Admin and Forge services both re-export the SAME implementation
// from the shared unifiedThumbnails module. Any divergence would risk behavior drift.

describe('shared thumbnails unified implementation', () => {
  it('admin and forge getOrCreateOutputThumbnail are the exact same function reference', async () => {
    const adminMod = await import('../../../NudeAdmin/src/services/thumbnails.js');
    const forgeMod = await import('../../../NudeForge/src/services/thumbnails.js');
    expect(typeof adminMod.getOrCreateOutputThumbnail).toBe('function');
    expect(adminMod.getOrCreateOutputThumbnail).toBe(forgeMod.getOrCreateOutputThumbnail);
  });
});
