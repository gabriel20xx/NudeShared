import { describe, it, expect } from 'vitest';

// This test ensures Admin and Forge both re-export the *same* unified thumbnail implementation
// so future divergence is caught early.

describe('Unified thumbnail implementation reuse', () => {
  it('Admin and Forge getOrCreateOutputThumbnail refer to same function object', async () => {
    const { getOrCreateOutputThumbnail: adminFn } = await import('../../../NudeAdmin/src/services/thumbnails.js');
    const { getOrCreateOutputThumbnail: forgeFn } = await import('../../../NudeForge/src/services/thumbnails.js');
    expect(adminFn).toBe(forgeFn);
  });
});
