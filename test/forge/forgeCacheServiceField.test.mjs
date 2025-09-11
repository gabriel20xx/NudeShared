import { test, expect } from 'vitest';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as forgeApp } from '../../../NudeForge/src/app.js';

// Asserts /__cache-policy includes service name for NudeForge

test('forge cache policy includes service label', async () => {
  const { server, url } = await startEphemeral(forgeApp);
  try {
    const res = await fetch(url + '/__cache-policy');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.service).toBe('NudeForge');
    expect(json.policies?.carousel?.thumbnails).toMatch(/86400/);
  } finally { server.close(); }
});
