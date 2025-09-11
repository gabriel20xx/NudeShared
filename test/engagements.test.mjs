import { describe, it, expect, beforeAll } from 'vitest';
import { ensureTestDb } from './utils/testDb.mjs';
import { query } from '../server/db/db.js';
import { createMedia } from './utils/mediaFactory.mjs';
import { addView, addLike, addDownload, addSave } from './utils/engagementFactory.mjs';
import path from 'node:path';

let userId;
let media;

beforeAll(async () => {
  await ensureTestDb();
  // Direct DB user insert to avoid needing HTTP server
  const email = 'engagement+'+Date.now()+'@example.com';
  const passwordHash = 'testhash';
  const now = new Date().toISOString();
  const username = 'eng_tester_'+Date.now();
  let inserted;
  try {
    const { rows, lastID } = await query(`INSERT INTO users (email, password_hash, role, created_at, username) VALUES (?,?,?,?,?) RETURNING id`, [email, passwordHash, 'user', now, username]);
    inserted = rows?.[0]?.id || lastID;
  } catch (e) {
    // On unique failures, select existing (defensive)
    const { rows } = await query(`SELECT id FROM users WHERE email=?`, [email]);
    inserted = rows[0].id;
  }
  userId = inserted;
  const filePath = path.join(process.cwd(), 'test', 'fixtures', 'tiny.png');
  media = await createMedia({ userId: userId, mediaKey: 'eng-media-'+Date.now() });
});

describe('engagement factory inserts', () => {
  it('adds views/likes/downloads/saves rows', async () => {
    await addView({ mediaKey: media.media_key, userId });
    await addView({ mediaKey: media.media_key, userId });
    await addLike({ mediaKey: media.media_key, userId });
    await addDownload({ mediaKey: media.media_key, userId });
    await addSave({ mediaKey: media.media_key, userId });
    const { rows } = await query(`SELECT 
      (SELECT COUNT(*) as views FROM media_views WHERE media_key=? ) as views,
      (SELECT COUNT(*) as likes FROM media_likes WHERE media_key=? ) as likes,
      (SELECT COUNT(*) as downloads FROM media_downloads WHERE media_key=? ) as downloads,
      (SELECT COUNT(*) as saves FROM media_saves WHERE media_key=? ) as saves
    `, [media.media_key, media.media_key, media.media_key, media.media_key]);
    const row = rows[0];
    expect(Number(row.views)).toBe(2);
    expect(Number(row.likes)).toBe(1);
    expect(Number(row.downloads)).toBe(1);
    expect(Number(row.saves)).toBe(1);
  });
});
