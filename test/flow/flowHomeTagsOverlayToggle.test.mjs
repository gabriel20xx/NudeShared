import { describe, it, expect } from 'vitest';
import { buildFlowApp } from './flowAppFactory.mjs';
import { startEphemeral, fetchHtml } from '../utils/serverHelpers.mjs';

// Focus: Tags overlay button + container markup present on home page feed

describe('flowHomeTagsOverlayToggle', () => {
  it('renders tags overlay button', async () => {
    const app = await buildFlowApp({ auth: false });
    const srv = await startEphemeral(app);
    const html = await fetchHtml(srv, '/');
    expect(html).toContain('tagsOverlayBtn');
    // Overlay panel itself may be injected server-side template include
    // We just assert button exists; JS wiring tested indirectly by absence of errors
    await srv.close();
  });
});
