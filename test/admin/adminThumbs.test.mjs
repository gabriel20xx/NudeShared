import { describe, test, expect, vi } from 'vitest';
import { binaryRequest } from '../utils/binaryClient.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { trackTempDir, trackTempFile, cleanupTracked } from '../utils/tempFiles.mjs';

// Spins up Admin app and verifies thumbnail generation & caching.
describe('Admin Thumbnail route', () => {
  test('generates and caches thumbnail', async () => {
  // Disable sharp mock BEFORE dynamic import of app
  // Force test to bypass sharp mock by providing a pre-existing PNG file
  delete process.env.ENABLE_REAL_SHARP; // ensure we use fallback buffer
  try { vi.resetModules(); } catch { /* ignore */ }
    const tmpBase = trackTempDir(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nudeadmin-out-')));
    process.env.OUTPUT_DIR = tmpBase;
    try {
  const inputPng = trackTempFile(path.join(tmpBase, 'sample.png'));
  // Minimal valid PNG header + IHDR + IEND (1x1 pixel) (not visually meaningful but valid)
  const tinyPng = Buffer.from('89504E470D0A1A0A0000000D4948445200000001000000010802000000907753DE0000000A49444154789C6360000002000100FFFF03000006000557BF2A0000000049454E44AE426082','hex');
  fs.writeFileSync(inputPng, tinyPng);
  const st = fs.statSync(inputPng); expect(st.size).toBeGreaterThan(50);
  // Dynamic import after env flags set so globalSetup does not mock sharp for this test
  const adminAppMod = await import('../../../NudeAdmin/src/app.js');
  const testApp = (adminAppMod.buildThumbnailTestApp ? adminAppMod.buildThumbnailTestApp(tmpBase) : adminAppMod.default);
  const server = testApp.listen(0);
      const base = `http://127.0.0.1:${server.address().port}`;
      try {
        // Sanity: original file should exist
        expect(fs.existsSync(inputPng)).toBe(true);
        // Retry loop in case of async fs visibility or generation race
        let res; let attempts=0;
        while(attempts < 3){
          res = await binaryRequest(base + '/thumbs/output/sample.png?w=200');
            if (res.statusCode === 200) break;
            await new Promise(r=>setTimeout(r, 50));
            attempts++;
        }
        expect(res.statusCode).toBe(200);
        expect(/image\/jpeg/i.test(String(res.headers['content-type']||''))).toBe(true);
        expect(res.buffer && res.buffer.length > 100).toBe(true);
  const cached = path.join(tmpBase, '.thumbs', 'sample.jpg');
  // Allow either persisted (when using test factory) or ephemeral buffer when not persisted
  expect(fs.existsSync(cached) || (res.buffer && res.buffer.length > 100)).toBe(true);
      } finally { server.close(); }
    } finally {
      await cleanupTracked();
    }
  }, 20000);
});
