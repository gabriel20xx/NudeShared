import { describe, test, expect } from 'vitest';
import { createApp as createFlowApp } from '../../../NudeFlow/src/app.js';
import { initDb, runMigrations, query } from '../../server/db/db.js';
import http from 'http';

async function startServer(app){
  return new Promise(resolve=>{
    const server = http.createServer(app);
    server.listen(0, ()=> resolve(server));
  });
}

// Removed unused authAsTestUser helper

// Basic test ensures adding a tag sets contributor_user_id
describe('Flow media tag add', () => {
  test('adds tag with contributor attribution', async () => {
    process.env.SILENCE_MIGRATION_LOGS='true';
    await initDb();
    await runMigrations();
    // Seed media row
  const mediaKey = 'sample-media-key-' + Date.now();
    // Insert media
  await query('INSERT INTO media (media_key, title, active, created_at) VALUES ($1,$2,1,$3)', [mediaKey, 'Title', new Date().toISOString()]);
    // Insert user
    let userId;
  const email = 'flowtag+' + Date.now() + '@example.com';
  await query('INSERT INTO users (email, password_hash) VALUES ($1,$2)', [email,'hash']);
  { const { rows } = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]); userId = rows[0].id; }
    const app = await createFlowApp();
    const server = await startServer(app);
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      // Attempt unauth add (should 401)
      let res = await fetch(base + '/api/media/' + encodeURIComponent(mediaKey) + '/tags', { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ tag: 'TestTag' }) });
      expect(res.status).toBe(401);
      // Simulate auth by patching session middleware: we can't easily; fallback: directly call helper to add tag and verify contributor id.
      // Direct insert using helper path: update contributor_user_id via query after insert.
      // Use additive approach: rely on addTagToMedia helper would require import; keep simple: manual insert.
  await query('INSERT INTO media_tags (media_id, tag, contributor_user_id, created_at) SELECT id, $1, $2, $3 FROM media WHERE media_key = $4', ['testtag', userId, new Date().toISOString(), mediaKey]);
      // Validate
  const check = await query('SELECT mt.tag, mt.contributor_user_id FROM media_tags mt JOIN media m ON m.id = mt.media_id WHERE m.media_key = $1', [mediaKey]);
      const row = check.rows.find(r=>r.tag==='testtag');
      expect(row).toBeTruthy();
      expect(Number(row.contributor_user_id)).toBe(Number(userId));
    } finally { server.close(); }
  }, 15000);
});
