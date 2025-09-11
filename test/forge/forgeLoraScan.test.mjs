// Moved from NudeForge/test/forge/forgeLoraScan.test.mjs
import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startEphemeral } from '../utils/serverHelpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Forge LoRA scan', () => {
  test('detailed LoRA endpoint returns models when directory populated', async () => {
    const tmpDir = path.join(__dirname, '..', '..', '..', 'NudeForge', '.tmp-loras');
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'model_one.safetensors'), 'stub');
    fs.mkdirSync(path.join(tmpDir, 'subA'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'subA', 'model_two.safetensors'), 'stub');
    process.env.LORAS_DIR = tmpDir;
    const { app: forgeApp } = await import('../../../NudeForge/src/app.js');
    const { server, url } = await startEphemeral(forgeApp);
    try {
      const res = await fetch(url + '/api/loras/detailed');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      const root = json.loras?.root || [];
      const sub = json.loras?.subdirs || {};
      const rootNames = root.map(r=>r.filename);
      const nestedNames = Object.values(sub).flat().map(r=>r.filename || r?.relativePath);
      expect(rootNames).toContain('model_one.safetensors');
      expect(nestedNames.join(' ')).toMatch(/model_two/);
    } finally {
      server.close();
    }
  });
});
