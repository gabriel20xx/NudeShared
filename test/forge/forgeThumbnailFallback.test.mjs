import { describe, it, expect } from 'vitest';
import { ensureTestDb } from '../testUtils.js';
import fs from 'fs';
import path from 'path';

// We simulate a thumbnail processing failure by creating a zero-byte image file and mocking getOrCreateOutputThumbnail to throw.

import * as thumbFallback from '../../server/media/thumbnailFallback.js';

// Patch dynamic import target via temporary monkey patch of require cache pattern (ESM limitation bypass by direct module manipulation isn't trivial here)
// Instead we directly call withThumbnailFallback to validate fallback semantics.

describe('forge thumbnail fallback', () => {
  it('returns fallback PNG when processing fails but original exists', async () => {
  await ensureTestDb({ memory: true, fresh: true });
    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-fallback-'));
    const orig = path.join(tmpDir, 'test.png');
    fs.writeFileSync(orig, Buffer.from([0x89,0x50,0x4E,0x47])); // partial header (invalid png) to force failure in real pipeline

    let called = 0;
    const result = await thumbFallback.withThumbnailFallback(orig, async () => {
      called++; throw new Error('boom');
    });
    expect(called).toBe(1);
    expect(result.contentType).toBe('image/png');
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('rethrows when original missing', async () => {
  await ensureTestDb({ memory: true, fresh: true });
    const missing = path.join(process.cwd(), 'nope', 'missing.png');
    let err;
    try {
      await thumbFallback.withThumbnailFallback(missing, async () => { throw new Error('fail'); });
    } catch(e) { err = e; }
    expect(err).toBeTruthy();
  });
});
