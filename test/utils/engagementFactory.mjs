// Engagement factory: create like/view/download rows for a media item
// Adjust table names/columns if schema differs.
import { query } from '../../server/db/db.js';

export async function addView({ mediaKey, userId = null }){
  const now = new Date().toISOString();
  await query(`INSERT INTO media_views (media_key, user_id, created_at) VALUES (?,?,?)`, [mediaKey, userId, now]);
}
export async function addLike({ mediaKey, userId = null }){
  const now = new Date().toISOString();
  await query(`INSERT INTO media_likes (media_key, user_id, created_at) VALUES (?,?,?)`, [mediaKey, userId, now]);
}
export async function addDownload({ mediaKey, userId = null }){
  const now = new Date().toISOString();
  await query(`INSERT INTO media_downloads (media_key, user_id, created_at) VALUES (?,?,?)`, [mediaKey, userId, now]);
}
export async function addSave({ mediaKey, userId = null }){
  const now = new Date().toISOString();
  await query(`INSERT INTO media_saves (media_key, user_id, created_at) VALUES (?,?,?)`, [mediaKey, userId, now]);
}

export default { addView, addLike, addDownload, addSave };
