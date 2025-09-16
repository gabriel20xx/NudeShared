import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { createAdminUser } from '../utils/authFactory.mjs';
import { query } from '../../server/db/db.js';
import { fetchStats } from './utils/statsSeed.mjs';

/**
 * Window filtering test for generation time metrics.
 * Seeds 3 media + media_metrics rows at 0d, 8d, 31d age with elapsed_ms 1000,2000,3000.
 * Verifies:
 *  - period=7d -> only 1000 counted (avg/min/max=1000)
 *  - period=30d -> 1000 + 2000 (avg ~=1500, min=1000, max=2000)
 *  - period=all -> all three (avg ~=2000, min=1000, max=3000)
 */
test('admin stats metrics respect period window (7d vs 30d vs all)', async () => {
  // Isolated DB so period window math isn't polluted by earlier runs
  await ensureTestDb({ memory: true, fresh: true });
  const { server, url: base } = await startEphemeral(adminApp);
  try {
    const admin = await createAdminUser(base, { email: 'metrics_period_'+Date.now()+'@ex.com', password:'pw12345' });
    const { rows: urows } = await query('SELECT id FROM users WHERE email=$1 LIMIT 1', [admin.email]);
    const adminId = urows?.[0]?.id || null;
  // Clean any previous metrics so window assertions remain deterministic
  try { await query('DELETE FROM media_metrics'); } catch { /* ignore absence */ }
    const now = new Date();
    const day = 24*60*60*1000;
    const samples = [
      { ageDays: 0, ms: 1000 },
      { ageDays: 8, ms: 2000 },
      { ageDays: 31, ms: 3000 }
    ];
    let idx = 0;
    for (const s of samples) {
      idx++;
      const createdAt = new Date(now.getTime() - s.ageDays*day).toISOString();
      const mediaKey = `/output/metrics_period_${Date.now()}_${idx}.png`;
  await query('INSERT INTO media (user_id, media_key, original_filename, created_at) VALUES ($1,$2,$3,$4)', [adminId, mediaKey, `period_${idx}.png`, createdAt]);
      await query('INSERT INTO media_metrics (media_key, elapsed_ms, created_at) VALUES ($1,$2,$3)', [mediaKey, s.ms, createdAt]);
    }
    // 7d window (default is 7d but be explicit)
    const p7 = await fetchStats(base, admin.cookie, 'period=7d');
    const m7 = p7.json?.metrics || {};
    expect(m7.avgGenMs).toBe(1000);
    expect(m7.minGen?.elapsed_ms).toBe(1000);
    expect(m7.maxGen?.elapsed_ms).toBe(1000);
    // 30d window (includes 0d + 8d entries -> 1000 & 2000)
    const p30 = await fetchStats(base, admin.cookie, 'period=30d');
    const m30 = p30.json?.metrics || {};
    expect(m30.minGen?.elapsed_ms).toBe(1000);
    expect(m30.maxGen?.elapsed_ms).toBe(2000);
    expect(m30.avgGenMs).toBeGreaterThanOrEqual(1499); // 1500 rounded exactly
    expect(m30.avgGenMs).toBeLessThanOrEqual(1501);
    // all (includes all three -> avg 2000, min 1000, max 3000)
    const pall = await fetchStats(base, admin.cookie, 'period=all');
    const mall = pall.json?.metrics || {};
    expect(mall.minGen?.elapsed_ms).toBe(1000);
    expect(mall.maxGen?.elapsed_ms).toBe(3000);
    expect(mall.avgGenMs).toBeGreaterThanOrEqual(1999);
    expect(mall.avgGenMs).toBeLessThanOrEqual(2001);
  } finally { server.close(); }
}, 30000);
