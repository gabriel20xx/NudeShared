import { describe, it, expect } from 'vitest';
import { ensureTestDb, startEphemeral } from '../testUtils.js';
import flowApp from '../../../NudeFlow/src/app.js';
import path from 'path';
import fs from 'fs';

// Focus: Legacy /categories redirect now returns 301 to '/'

describe('Flow /categories redirect (legacy categories removal)', () => {
  it('redirects /categories to / with 301 status', async () => {
    await ensureTestDb();
    const { server, url } = await startEphemeral(flowApp);
    try {
      const res = await fetch(url + '/categories', { redirect: 'manual' });
      expect(res.status).toBe(301);
      const loc = res.headers.get('location');
      expect(loc).toBe('/');
    } finally {
      server.close();
    }
  });
});
