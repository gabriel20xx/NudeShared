import { describe, it, expect } from 'vitest';
import { startEphemeral } from '../testUtils.js';
import flowApp from '../../../NudeFlow/src/app.js';
import fs from 'node:fs';
import path from 'node:path';

// Ensures floating controls are offset above bottom nav to avoid overlap.

describe('flowOverlayButtonsOffset', () => {
  it('home page has floating-controls and CSS uses bottom-nav-height offset', async () => {
    const themePath = path.join(process.cwd(), 'client', 'theme.css');
    const css = fs.readFileSync(themePath, 'utf8');
    expect(css).toMatch(/\.floating-controls[^}]*bottom: calc\(var\(--bottom-nav-height\) \+ \.85rem\)/);

    const { server, base } = await startEphemeral(flowApp);
    try {
      const res = await fetch(base + '/');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toMatch(/class="floating-controls visible"/);
    } finally {
      server.close();
    }
  });
});
