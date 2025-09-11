import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { createAdminUser } from '../utils/authFactory.mjs';
import { query } from '../../server/db/db.js';

test('admin media batch rename action succeeds', async () => {
  await ensureTestDb();
  const { server, url: base } = await startEphemeral(adminApp);
  try {
    const admin = await createAdminUser(base, { email: 'media_act_'+Date.now()+'@ex.com', password:'pw12345' });
    // seed two media rows for this admin user
    const { rows: uRows } = await query('SELECT id FROM users WHERE email=$1 LIMIT 1', [admin.email]);
    const uid = uRows[0].id; const now = new Date().toISOString();
    const m1 = await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES ($1,$2,$3,$4,1,$5) RETURNING id', [uid, '/media/output/actA_'+Date.now()+'.mp4', 'OldTitle','cat', now]);
    const m2 = await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES ($1,$2,$3,$4,1,$5) RETURNING id', [uid, '/media/output/actB_'+Date.now()+'.mp4', 'OldTitle','cat', now]);
    const id1 = m1.rows?.[0]?.id; const id2 = m2.rows?.[0]?.id;
    const res = await fetch(base + '/api/admin/media/actions', { method:'POST', headers:{ 'Content-Type':'application/json', Cookie: admin.cookie }, body: JSON.stringify({ action:'rename', ids:[id1,id2], title:'Renamed' }) });
    const js = await res.json();
    expect(res.status).toBe(200);
    expect(js?.affected).toBe(2);
    const { rows: check } = await query('SELECT title FROM media WHERE id IN ($1,$2)', [id1, id2]);
    for (const r of check) expect(r.title).toBe('Renamed');
  } finally { server.close(); }
}, 30000);
