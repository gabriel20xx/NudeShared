// Media factory (placeholder): seeds a media record directly via DB for tests needing existing media entries.
import { query } from '../../server/db/db.js';

export async function createMedia({ userId, mediaKey = '/media/output/sample.mp4', title = 'Sample', category = 'default', elapsedMs = 123 } = {}) {
  const now = new Date().toISOString();
  // Insert minimal media row (fields adapt to your schema; adjust if table differs)
  const { rows, lastID } = await query(`INSERT INTO media (user_id, media_key, title, category, elapsed_ms, active, created_at) VALUES (?,?,?,?,?,?,?)`, [userId, mediaKey, title, category, elapsedMs, 1, now]);
  return { id: rows?.[0]?.id || lastID, user_id: userId, media_key: mediaKey, title, category };
}

export default { createMedia };
