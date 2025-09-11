import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { createAdminUser } from '../utils/authFactory.mjs';
import { fetchStats } from './utils/statsSeed.mjs';
import { query } from '../../../NudeShared/server/index.js';

// Edge case: No media_metrics rows -> metrics fields should be null
test('admin stats metrics null when no generation data', async () => {
  // Use isolated in-memory DB to guarantee no prior media_metrics rows
  await ensureTestDb({ memory: true, fresh: true });
  const { server, url: base } = await startEphemeral(adminApp);
  try {
  // Purge any existing generation metrics to simulate empty state
  try { await query('DELETE FROM media_metrics'); } catch (e) { /* ignore absence */ }
    const admin = await createAdminUser(base, { email: 'metrics_empty_'+Date.now()+'@ex.com', password:'pw12345' });
    const stats = await fetchStats(base, admin.cookie, 'period=all');
    const metrics = stats.json?.metrics || {};
    expect(metrics.avgGenMs).toBeNull();
    expect(metrics.minGen).toBeNull();
    expect(metrics.maxGen).toBeNull();
  } finally { server.close(); }
}, 15000);
