import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';

// Focused tests for /api/upload-copy immediate background copy endpoint
// Contract expectations (documented in routes.js):
//  - POST multipart/form-data field name 'image'
//  - 200 => { success:true, filename } and file persisted inside configured copy dir
//  - 400 => { success:false, error } when no file provided
//  - Filenames are UUID-prefixed to avoid collisions

async function createTempPng() {
  const tmp = path.join(os.tmpdir(), 'forge-uploadcopy-' + Date.now() + '.png');
  // Write a tiny valid PNG header (not strictly required for storage, but realistic)
  const pngHeader = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  fs.writeFileSync(tmp, pngHeader);
  return tmp;
}

describe('forge upload-copy endpoint', () => {
  it('persists file and returns success payload', async () => {
    await ensureTestDb();
    const { app: forgeApp } = await import('../../../NudeForge/src/app.js');
    const { server, url } = await startEphemeral(forgeApp);
    try {
      const tmpFile = await createTempPng();
      const form = new FormData();
      const fileData = new Blob([fs.readFileSync(tmpFile)], { type: 'image/png' });
      form.append('image', fileData, 'sample.png');
      const res = await fetch(url + '/api/upload-copy', { method: 'POST', body: form });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.filename).toMatch(/sample/); // retains base name suffix
      // Derive copy dir from environment or default (mirrors config.js logic)
      const copyDir = process.env.UPLOAD_COPY_DIR || path.join(path.resolve(__dirname, '..', '..', '..'), 'copy');
      const storedPath = path.join(copyDir, json.filename);
      expect(fs.existsSync(storedPath)).toBe(true);
      const stat = fs.statSync(storedPath);
      expect(stat.size).toBeGreaterThan(0);
    } finally { server.close(); }
  }, 15000);

  it('returns 400 when no file provided', async () => {
    await ensureTestDb();
    const { app: forgeApp } = await import('../../../NudeForge/src/app.js');
    const { server, url } = await startEphemeral(forgeApp);
    try {
      const form = new FormData(); // empty
      const res = await fetch(url + '/api/upload-copy', { method: 'POST', body: form });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(/no file/i.test(json.error || '')).toBe(true);
    } finally { server.close(); }
  }, 15000);
});
