import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { createAdminUser } from '../utils/authFactory.mjs';
import { query } from '../../../NudeShared/server/index.js';
import { fetchStats } from './utils/statsSeed.mjs';

// Verifies longestView metric reflects max duration_ms in media_view_sessions
test('admin stats metrics longestView reflects max duration', async () => {
  await ensureTestDb({ memory: true, fresh: true });
  const { server, url: base } = await startEphemeral(adminApp);
  try {
    const admin = await createAdminUser(base, { email: 'lv_admin_'+Date.now()+'@ex.com', password: 'pw12345' });
    const { rows: urows } = await query('SELECT id FROM users WHERE email=$1',[admin.email]);
    const adminId = urows?.[0]?.id || null;
    // Seed three media and matching view sessions with varying durations
    const now = new Date().toISOString();
    const durations = [500, 2750, 1400];
    let idx = 0;
    for(const dur of durations){
      idx++;
      const mediaKey = `/output/longest_view_${idx}.png`;
      await query('INSERT INTO media (user_id, media_key, original_filename, created_at) VALUES ($1,$2,$3,$4)', [adminId, mediaKey, `lv_${idx}.png`, now]);
      // also add a basic view (optional)
      await query('INSERT INTO media_views (user_id, media_key, app, created_at) VALUES ($1,$2,$3,$4)', [adminId, mediaKey, 'forge', now]);
      await query('INSERT INTO media_view_sessions (user_id, media_key, duration_ms, created_at) VALUES ($1,$2,$3,$4)', [adminId, mediaKey, dur, now]);
    }
    const stats = await fetchStats(base, admin.cookie, 'period=all');
    const longest = stats.json?.metrics?.longestView;
    expect(longest).toBeTruthy();
    expect(longest.duration_ms).toBe(2750);
    expect(longest.media_key).toContain('longest_view_2');
  } finally { server.close(); }
}, 30000);
