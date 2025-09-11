import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { createAdminUser, createUser } from '../utils/authFactory.mjs';
import { fetchStats } from './utils/statsSeed.mjs';
import { query } from '../../server/db/db.js';

test('admin stats conversion rates computed (like/save/download per view)', async () => {
  await ensureTestDb();
  const { server, url: base } = await startEphemeral(adminApp);
  try {
    const admin = await createAdminUser(base, { email: 'conv_admin_'+Date.now()+'@ex.com', password:'pw12345' });
    const user = await createUser(base, { email: 'conv_user_'+Date.now()+'@ex.com', password:'pw12345' });
    // one media row
    const mediaKey = '/media/output/conv_'+Date.now()+'.mp4';
    const { rows: uRows } = await query('SELECT id FROM users WHERE email=$1 LIMIT 1', [user.email]);
    const uid = uRows[0].id;
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES ($1,$2,$3,$4,1,$5)', [uid, mediaKey, 'Conv', 'test', new Date().toISOString()]);
    const now = new Date().toISOString();
    const views = 10, likes = 4, saves = 2, downloads = 5;
    // Use variant suffix to avoid uniqueness on likes / saves / downloads
    const variant = (k,i)=> i===0? k : k+'#v'+i;
    for (let i=0;i<views;i++) await query('INSERT INTO media_views (media_key, user_id, created_at) VALUES ($1,$2,$3)', [variant(mediaKey,i), uid, now]);
    for (let i=0;i<likes;i++) await query('INSERT INTO media_likes (media_key, user_id, created_at) VALUES ($1,$2,$3)', [variant(mediaKey,i), uid, now]);
    for (let i=0;i<saves;i++) await query('INSERT INTO media_saves (media_key, user_id, created_at) VALUES ($1,$2,$3)', [variant(mediaKey,i), uid, now]);
    for (let i=0;i<downloads;i++) await query('INSERT INTO media_downloads (media_key, user_id, created_at) VALUES ($1,$2,$3)', [variant(mediaKey,i), uid, now]);
    const stats = await fetchStats(base, admin.cookie, 'period=all&filter='+encodeURIComponent('conv_'));
    const conv = stats.json?.metrics?.conversion || {};
    expect(conv.likeRate).toBeCloseTo(likes/views, 5);
    expect(conv.saveRate).toBeCloseTo(saves/views, 5);
    expect(conv.downloadRate).toBeCloseTo(downloads/views, 5);
  } finally { server.close(); }
}, 30000);
