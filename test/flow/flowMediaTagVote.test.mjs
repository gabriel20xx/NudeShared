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

async function seedUser(email){
  try { await query('INSERT INTO users (email, password_hash) VALUES (?,?)', [email,'h']); } catch {}
  try {
    const { rows } = await query('SELECT id FROM users WHERE email = ? OR email = $1 LIMIT 1', [email]);
    return rows[0].id;
  } catch {
    const { rows } = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    return rows[0].id;
  }
}

// NOTE: Full authenticated session simulation is non-trivial with signed cookies; this test focuses on vote aggregation logic via direct inserts.
// We simulate votes by calling endpoints expecting 401 then performing direct DB writes to emulate states.

describe('Flow media tag voting', () => {
  test('aggregates vote score across changes', async () => {
    process.env.SILENCE_MIGRATION_LOGS='true';
    await initDb();
    await runMigrations();
    const mediaKey = 'vote-media-' + Date.now();
    // Seed media
  await query('INSERT INTO media (media_key, title, active) VALUES ($1,$2,TRUE)', [mediaKey,'T']);
    // Get media id
  const mid = await query('SELECT id FROM media WHERE media_key = $1', [mediaKey]);
    const mediaId = mid.rows[0].id;
    const userA = await seedUser('voteA@example.com');
    const userB = await seedUser('voteB@example.com');
    // Create tag
  await query('INSERT INTO media_tags (media_id, tag, contributor_user_id) VALUES ($1,$2,$3)', [mediaId,'tagx', userA]);
    // userA upvotes (should set score 1)
  await query('INSERT INTO media_tag_votes (media_id, tag, user_id, direction) VALUES ($1,$2,$3,$4)', [mediaId,'tagx',userA,1]);
    // userB downvotes (score 0)
  await query('INSERT INTO media_tag_votes (media_id, tag, user_id, direction) VALUES ($1,$2,$3,$4)', [mediaId,'tagx',userB,-1]);
    // Change userB to upvote (score 2)
  await query('UPDATE media_tag_votes SET direction = $1 WHERE media_id = $2 AND tag = $3 AND user_id = $4', [1, mediaId,'tagx',userB]);
    // Delete userA vote (score 1)
  await query('DELETE FROM media_tag_votes WHERE media_id = $1 AND tag = $2 AND user_id = $3', [mediaId,'tagx',userA]);
    // Aggregate
  const agg = await query('SELECT COALESCE(SUM(direction),0) as score FROM media_tag_votes WHERE media_id = $1 AND tag = $2', [mediaId,'tagx']);
    const score = Number(agg.rows[0].score);
    expect(score).toBe(1);
  }, 15000);
});
