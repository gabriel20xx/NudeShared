import { describe, it, expect } from 'vitest';
import { buildFlowApp } from './flowAppFactory.mjs';
import { startEphemeral, fetchHtml } from '../utils/serverHelpers.mjs';

// Focus: Timer (autoplay duration) button markup presence

describe('flowHomeTimerPanelToggle', () => {
  it('renders timer button for autoplay duration', async () => {
    const app = await buildFlowApp({ auth: false });
    const srv = await startEphemeral(app);
    const html = await fetchHtml(srv, '/');
    expect(html).toContain('float-btn--timer');
    await srv.close();
  });
});
