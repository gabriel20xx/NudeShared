import { describe, it, expect } from 'vitest';
import { buildFlowApp } from './flowAppFactory.mjs';
import { startEphemeral, fetchHtml } from '../utils/serverHelpers.mjs';

// Focus: Anonymous like fallback should update UI locally without 401 breaking script

describe('flowHomeAnonymousLikeFallback', () => {
  it('allows local like toggle when unauthenticated', async () => {
    const app = await buildFlowApp({ auth: false });
    const srv = await startEphemeral(app);
    const html = await fetchHtml(srv, '/');
    expect(html).toContain('float-btn--like');
    // We can't execute client JS here; this test asserts markup presence only.
    // TODO: Consider adding a small puppeteer-based harness in future for true DOM interaction.
    await srv.close();
  });
});
