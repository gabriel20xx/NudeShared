import { describe, it, expect } from 'vitest';
import { buildFlowApp } from './flowAppFactory.mjs';
import { startEphemeral, fetchHtml } from '../utils/serverHelpers.mjs';

// Focus: Ensure full tags overlay structure exists (container, title, list, close button)

describe('flowHomeTagsOverlayStructure', () => {
  it('home page contains overlay structural elements', async () => {
    const app = await buildFlowApp({ auth:false });
    const srv = await startEphemeral(app);
    const html = await fetchHtml(srv, '/');
    expect(html).toMatch(/id="tagsOverlay"/);
    expect(html).toMatch(/id="tagsOverlayTitle"/);
    expect(html).toMatch(/id="tagsOverlayList"/);
    expect(html).toMatch(/id="tagsOverlayClose"/);
    await srv.close();
  });
});
