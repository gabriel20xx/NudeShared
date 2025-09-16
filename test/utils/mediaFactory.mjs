// Media factory (placeholder): seeds a media record directly via DB for tests needing existing media entries.
import { query } from '../../server/db/db.js';

export async function createMedia({ userId, mediaKey = '/media/output/sample.mp4', title = 'Sample', category = null, tags = [] } = {}) {
  const now = new Date().toISOString();
  // Adjusted to omit elapsed_ms column (not present in schema) and rely on minimal required fields
  const { rows, lastID } = await query(`INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,?,?)`, [userId, mediaKey, title, category, 1, now]);
  const id = rows?.[0]?.id || lastID;
  if(tags && tags.length){
    const norm = Array.from(new Set(tags.map(t=> String(t).toLowerCase().trim()).filter(Boolean)));
    for(const t of norm){
      // SQLite friendly upsert ignore
  try { await query('INSERT INTO media_tags (media_id, tag) VALUES (?,?)', [id, t]); } catch { /* ignore duplicate */ }
    }
  }
  return { id, user_id: userId, media_key: mediaKey, title, category, tags };
}

export default { createMedia };
