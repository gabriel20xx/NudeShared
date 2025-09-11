import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as forgeApp } from '../../../NudeForge/src/app.js';
import fs from 'fs';
import path from 'path';

// Ensures when FORGE_PERSIST_THUMBS not set (default false) thumbnails are served with no-store and not cached to disk
test('forge output thumbnail served in-memory when persistence disabled', async () => {
  await ensureTestDb();
  // Prepare a temporary output file
  const outDir = path.resolve(process.cwd(), 'output');
  await fs.promises.mkdir(outDir, { recursive: true });
  const sample = path.join(outDir, 'ephemeral_sample.png');
  // tiny 1x1 png
  const pngData = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000a49444154789c6360000002000100' +
    '05fe02fea557a90000000049454e44ae426082','hex');
  await fs.promises.writeFile(sample, pngData);
  const { server, url } = await startEphemeral(forgeApp);
  try {
    const res = await fetch(url + '/thumbs/output/ephemeral_sample.png?w=64');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(/no-store/i);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(10);
    // Ensure .thumbs file not written when persistence disabled
    const thumbPath = path.join(outDir, '.thumbs', 'ephemeral_sample.jpg');
    const exists = fs.existsSync(thumbPath);
    expect(exists).toBe(false);
  } finally { server.close(); }
}, 20000);
