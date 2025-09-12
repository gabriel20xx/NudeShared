import { describe, test, expect } from 'vitest';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { createAdminUser } from '../utils/authFactory.mjs';
import { query } from '../../../NudeShared/server/db/db.js';

/**
 * This test seeds a media item plus download, view, like, and save events, then calls
 * /api/admin/media/engagement-counts to verify the new downloads field is returned.
 */

describe('Admin media engagement counts includes downloads', () => {
  test('returns downloads alongside views/likes/saves for media key', async () => {
    await ensureTestDb();
    const { server, url: base } = await startEphemeral(adminApp);
    try {
      const { cookie } = await createAdminUser(base, {});
      const mediaKey = `download-test-key-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
      const now = new Date().toISOString();
      const { rows: userRows } = await query('SELECT id FROM users ORDER BY id ASC LIMIT 1', []);
      const adminId = userRows?.[0]?.id || 1;
      await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES ($1,$2,$3,$4,1,$5)', [adminId, mediaKey, 'Test', 'cat', now]);
      // seed metrics: 2 downloads, 3 views, 1 like, 1 save
      for(let i=0;i<2;i++) await query('INSERT INTO media_downloads (media_key, user_id, created_at) VALUES ($1,$2,$3)', [mediaKey, adminId, now]);
      for(let i=0;i<3;i++) await query('INSERT INTO media_views (media_key, user_id, created_at) VALUES ($1,$2,$3)', [mediaKey, adminId, now]);
      await query('INSERT INTO media_likes (media_key, user_id, created_at) VALUES ($1,$2,$3)', [mediaKey, adminId, now]);
      await query('INSERT INTO media_saves (media_key, user_id, created_at) VALUES ($1,$2,$3)', [mediaKey, adminId, now]);

      const res = await fetch(base + '/api/admin/media/engagement-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ keys: [mediaKey] })
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      const entry = json.counts?.[mediaKey];
      expect(entry).toBeTruthy();
      expect(entry.downloads).toBe(2);
      expect(entry.views).toBe(3);
      expect(entry.likes).toBe(1);
      expect(entry.saves).toBe(1);
    } finally { server.close(); }
  });
});
