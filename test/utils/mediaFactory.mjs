// Media factory (placeholder): seeds a media record directly via DB for tests needing existing media entries.
import { query } from '../../server/db/db.js';

export async function createMedia({ userId, mediaKey = '/media/output/sample.mp4', title = 'Sample', category = 'default' } = {}) {
  const now = new Date().toISOString();
  // Adjusted to omit elapsed_ms column (not present in schema) and rely on minimal required fields
  const { rows, lastID } = await query(`INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,?,?)`, [userId, mediaKey, title, category, 1, now]);
  return { id: rows?.[0]?.id || lastID, user_id: userId, media_key: mediaKey, title, category };
}

export default { createMedia };
