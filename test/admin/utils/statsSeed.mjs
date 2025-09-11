import { query } from '../../../server/db/db.js';

export async function fetchStats(base, cookie, qs=''){ 
  const url = new URL('/api/admin/stats' + (qs?('?'+qs):''), base); 
  const res = await fetch(url, { headers:{ Cookie: cookie } });
  const text = await res.text(); let json=null; try { json=JSON.parse(text); } catch {}
  return { res, json }; 
}

export async function seedMediaWithEngagements({ ownerEmail, mediaKey, views=0, likes=0, saves=0, downloads=0 }) {
  const { rows: uRows } = await query('SELECT id FROM users WHERE email=$1 LIMIT 1', [ownerEmail]);
  const userId = uRows?.[0]?.id;
  if (!userId) throw new Error('User not found for media seed');
  await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES ($1,$2,$3,$4,1,$5)', [userId, mediaKey, mediaKey, 'test', new Date().toISOString()]);
  const now = new Date().toISOString();
  // Use variant media keys to bypass potential unique(user_id, media_key) constraints for per-user interactions
  const variant = (k,i)=> i===0? k : k+'#dup'+i;
  for (let i=0;i<views;i++) await query('INSERT INTO media_views (media_key, user_id, created_at) VALUES ($1,$2,$3)', [variant(mediaKey,i), userId, now]);
  for (let i=0;i<likes;i++) await query('INSERT INTO media_likes (media_key, user_id, created_at) VALUES ($1,$2,$3)', [variant(mediaKey,i), userId, now]);
  for (let i=0;i<saves;i++) await query('INSERT INTO media_saves (media_key, user_id, created_at) VALUES ($1,$2,$3)', [variant(mediaKey,i), userId, now]);
  for (let i=0;i<downloads;i++) await query('INSERT INTO media_downloads (media_key, user_id, created_at) VALUES ($1,$2,$3)', [variant(mediaKey,i), userId, now]);
}

export async function seedMultiUserLikes(mediaKey, userEmails){
  for (const email of userEmails){
    const { rows } = await query('SELECT id FROM users WHERE email=$1 LIMIT 1', [email]);
    const uid = rows?.[0]?.id; if(!uid) continue;
    await query('INSERT OR IGNORE INTO media_likes (media_key, user_id, created_at) VALUES ($1,$2,$3)', [mediaKey, uid, new Date().toISOString()]);
  }
}

export async function seedMultiUserGeneric(table, mediaKey, userEmails){
  for (const email of userEmails){
    const { rows } = await query('SELECT id FROM users WHERE email=$1 LIMIT 1', [email]);
    const uid = rows?.[0]?.id; if(!uid) continue;
    await query(`INSERT OR IGNORE INTO ${table} (media_key, user_id, created_at) VALUES ($1,$2,$3)`, [mediaKey, uid, new Date().toISOString()]);
  }
}
