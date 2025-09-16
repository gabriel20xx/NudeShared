import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { createAdminUser } from '../utils/authFactory.mjs';
import { query } from '../../../NudeShared/server/index.js';
import { fetchStats } from './utils/statsSeed.mjs';

/**
 * Metrics test: seeds media_metrics rows with known elapsed_ms values and asserts
 * avgGenMs (rounded), minGen, and maxGen objects returned by /api/admin/stats.
 */

 test('admin stats metrics avg/min/max generation times', async () => {
  // Isolated DB so avg/min/max reflect only seeded rows
  await ensureTestDb({ memory: true, fresh: true });
  const { server, url: base } = await startEphemeral(adminApp);
  try {
    // Ensure a clean slate for deterministic metrics (remove any rows from prior tests)
  try { await query('DELETE FROM media_metrics'); } catch { /* ignore prior absence */ }
  const admin = await createAdminUser(base, { email: 'metrics_admin_'+Date.now()+'@ex.com', password:'pw12345' });
    // Seed media + metrics manually. We only need rows in media (to satisfy FKs if any) and media_metrics
  const now = new Date().toISOString();
    const samples = [1200, 800, 1500]; // ms values
    let idx = 0;
    for (const ms of samples) {
      idx++;
      const mediaKey = `/output/metrics_sample_${Date.now()}_${idx}.png`;
      // Minimal media row (user_id may be null, but safer to use admin id if present)
  // admin factory returns { email, cookie, body:{ success?, data? }, password } – we need the user id from DB
  const { rows: urows } = await query('SELECT id FROM users WHERE email = $1', [admin.email]);
  const adminId = urows?.[0]?.id || null;
  await query('INSERT INTO media (user_id, media_key, original_filename, created_at) VALUES ($1,$2,$3,$4)', [adminId, mediaKey, `sample_${idx}.png`, now]);
  await query('INSERT INTO media_metrics (media_key, elapsed_ms, created_at) VALUES ($1,$2,$3)', [mediaKey, ms, now]);
    }
    const stats = await fetchStats(base, admin.cookie, 'period=all');
    const metrics = stats.json?.metrics || {};
    expect(metrics.avgGenMs).toBeGreaterThanOrEqual(1166); // 1200+800+1500=3500 /3=1166.66 -> rounded 1167 (allow >= 1166)
    expect(metrics.avgGenMs).toBeLessThanOrEqual(1168);
    const minGen = metrics.minGen; const maxGen = metrics.maxGen;
    expect(minGen).toBeTruthy(); expect(maxGen).toBeTruthy();
    expect(minGen.elapsed_ms).toBe(800);
    expect(maxGen.elapsed_ms).toBe(1500);
  } finally { server.close(); }
 }, 30000);
