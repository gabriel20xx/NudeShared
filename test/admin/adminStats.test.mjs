import { describe, test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { createAdminUser, createUser } from '../utils/authFactory.mjs';
import { query } from '../../server/db/db.js';

async function fetchStats(base, cookie, qs=''){ 
  const url = new URL('/api/admin/stats' + (qs?('?'+qs):''), base); 
  const res = await fetch(url, { headers:{ Cookie: cookie } });
  const text = await res.text(); let json=null; try { json=JSON.parse(text); } catch (e) { /* tolerate non-JSON */ }
  return { res, json }; 
}

// Utility to create media + optional engagement rows
async function seedMediaWithEngagements({ ownerEmail, mediaKey, views=0, likes=0, downloads=0 }) {
  const { rows: uRows } = await query('SELECT id FROM users WHERE email=$1 LIMIT 1', [ownerEmail]);
  const userId = uRows?.[0]?.id;
  if (!userId) throw new Error('User not found for media seed');
  await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES ($1,$2,$3,$4,1, $5)', [userId, mediaKey, mediaKey, 'test', new Date().toISOString()]);
  // For tables that likely have a UNIQUE(user_id, media_key) constraint (likes/downloads/views),
  // insert only one row per media for that user if count > 0, then simulate additional counts by creating
  // synthetic media_key variants with suffixes (these still count in stats queries which aggregate by COUNT rows).
  const now = new Date().toISOString();
  function variant(key, idx){ return idx === 0 ? key : key + '#dup'+idx; }
  for (let i=0;i<views;i++) {
    await query('INSERT INTO media_views (media_key, user_id, created_at) VALUES ($1,$2,$3)', [variant(mediaKey, i), userId, now]);
  }
  for (let i=0;i<likes;i++) {
    await query('INSERT INTO media_likes (media_key, user_id, created_at) VALUES ($1,$2,$3)', [variant(mediaKey, i), userId, now]);
  }
  for (let i=0;i<downloads;i++) {
    await query('INSERT INTO media_downloads (media_key, user_id, created_at) VALUES ($1,$2,$3)', [variant(mediaKey, i), userId, now]);
  }
}

describe('Admin stats endpoint', () => {
  test('authorized stats reflects seeded deltas (period=all)', async () => {
    await ensureTestDb();
    const { server, url: base } = await startEphemeral(adminApp);
    try {
      const admin = await createAdminUser(base, { email: 'stats_admin_'+Date.now()+'@example.com', password: 'secret123' });
      // Baseline
      const before = await fetchStats(base, admin.cookie, 'period=all');
      expect(before.res.status).toBe(200);
      const bt = before.json?.totals || {};
      const bGenerated = Number(bt.generated||0);
      const bViewed = Number(bt.viewed||0);
      const bDownloads = Number(bt.downloads||0);

      // Create two normal users and seed media + engagements
      const u1 = await createUser(base, { email: 'stats_u1_'+Date.now()+'@example.com', password:'pw12345' });
      const u2 = await createUser(base, { email: 'stats_u2_'+Date.now()+'@example.com', password:'pw12345' });
      const slug = 'zzfilter_'+Date.now();
      await seedMediaWithEngagements({ ownerEmail: u1.email, mediaKey: '/media/output/'+slug+'_A.mp4', views: 3, likes: 2, downloads:1 });
      await seedMediaWithEngagements({ ownerEmail: u2.email, mediaKey: '/media/output/'+slug+'_B.mp4', views: 2, likes: 1, downloads:0 });

      const after = await fetchStats(base, admin.cookie, 'period=all');
      expect(after.res.status).toBe(200);
      const at = after.json?.totals || {};
  // Use >= to tolerate external concurrent inserts in shared test DB
  expect(Number(at.generated)).toBeGreaterThanOrEqual(bGenerated + 2);
  expect(Number(at.viewed)).toBeGreaterThanOrEqual(bViewed + 5);
  expect(Number(at.downloads)).toBeGreaterThanOrEqual(bDownloads + 1);
      // Leaders object shape
      expect(after.json?.leaders).toBeTruthy();
      expect(after.json?.totals?.users).toBeGreaterThan(0);
    } finally { server.close(); }
  }, 30000);

  test('filter parameter narrows generated + viewed counts to slug', async () => {
    await ensureTestDb();
    const { server, url: base } = await startEphemeral(adminApp);
    try {
      const admin = await createAdminUser(base, { email: 'stats_admin2_'+Date.now()+'@example.com', password: 'secret123' });
      const slug = 'zzflt_'+Date.now();
      const u = await createUser(base, { email: 'stats_fu_'+Date.now()+'@example.com', password:'pw12345' });
      await seedMediaWithEngagements({ ownerEmail: u.email, mediaKey: '/media/output/'+slug+'_1.mp4', views: 1, likes:0, downloads:0 });
      await seedMediaWithEngagements({ ownerEmail: u.email, mediaKey: '/media/output/'+slug+'_2.mp4', views: 2, likes:0, downloads:0 });
      const allStats = await fetchStats(base, admin.cookie, 'period=all');
      const allGenerated = Number(allStats.json?.totals?.generated||0);
      const filtered = await fetchStats(base, admin.cookie, 'period=all&filter='+encodeURIComponent(slug));
      expect(filtered.res.status).toBe(200);
      expect(Number(filtered.json?.totals?.generated)).toBeGreaterThanOrEqual(2); // at least the 2 we created (others could match accidentally but unlikely)
      expect(Number(filtered.json?.totals?.generated)).toBeLessThanOrEqual(allGenerated);
      // Viewed should be sum of 1+2 =3 minimally
      expect(Number(filtered.json?.totals?.viewed)).toBeGreaterThanOrEqual(3);
    } finally { server.close(); }
  }, 30000);
});
