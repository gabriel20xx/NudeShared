// Moved from NudeForge/test/forge/forgeUploadCopySelection.test.mjs
import { describe, test, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { startEphemeral } from '../utils/serverHelpers.mjs';

describe('Forge upload-copy on selection', () => {
  test('POST /api/upload-copy saves file to copy directory before /upload', async () => {
  process.env.LORAS_DIR = path.join(process.cwd(), 'loras');
  const { app: forgeApp } = await import('../../../NudeForge/src/app.js');
  // Import config AFTER env vars applied so we can read resolved copy directory
  const { UPLOAD_COPY_DIR } = await import('../../../NudeForge/src/config/config.js');
  const { server, url } = await startEphemeral(forgeApp);
  const copyDir = UPLOAD_COPY_DIR; // authoritative directory used by app
    let created = [];
    try {
      const before = new Set((fs.existsSync(copyDir)? fs.readdirSync(copyDir): []));
      const boundary = '----vtform'+Math.random().toString(16).slice(2);
      const payload = Buffer.concat([
        Buffer.from(`--${boundary}\r\n`),
        Buffer.from('Content-Disposition: form-data; name="image"; filename="sel-test.png"\r\n'),
        Buffer.from('Content-Type: image/png\r\n\r\n'),
        Buffer.from('PNGDATA'),
        Buffer.from(`\r\n--${boundary}--\r\n`)
      ]);
      const res = await fetch(url + '/api/upload-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
        body: payload
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(typeof json.filename).toBe('string');
      // Allow brief async disk settle: poll up to 5 times
      let afterNames = [];
      for(let i=0;i<5;i++){
        afterNames = (fs.existsSync(copyDir)? fs.readdirSync(copyDir): []);
        if(afterNames.some(f=> !before.has(f))) break;
        await new Promise(r=>setTimeout(r,50));
      }
      const afterSet = new Set(afterNames);
      const diff = afterNames.filter(f=> !before.has(f));
      expect(diff.length).toBeGreaterThanOrEqual(1);
      expect(afterSet.has(json.filename)).toBe(true);
      created = diff; // track new files for cleanup
    } finally {
      // Per-test cleanup
      try {
        for (const f of created) {
          const p = path.join(copyDir, f);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }
      } catch { /* ignore cleanup errors */ }
      server.close();
    }
  });
});
