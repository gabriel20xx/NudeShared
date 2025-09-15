import { describe, it, expect } from 'vitest';
import { startEphemeral } from '../testUtils.js';
import { buildFlowApp } from './flowAppFactory.mjs';

// Ensures /shared/overlay.js responds 200 with javascript content-type (fallback route or static mount).

describe('flowSharedOverlayScriptServed', () => {
  it('serves /shared/overlay.js with JS MIME', async () => {
    const { server, url } = await startEphemeral(async () => await buildFlowApp());
    try {
      const res = await fetch(url + '/shared/overlay.js');
      const text = await res.text();
      expect(res.status).toBe(200);
      const ct = res.headers.get('content-type') || '';
      expect(/javascript|ecmascript/i.test(ct)).toBe(true);
      expect(text).toMatch(/createOverlayController/);
    } finally {
      server.close();
    }
  });
});
