// Shared tag helper utilities: normalization, retrieval with vote aggregation, and applying votes.
import { query, getDriver } from '../db/db.js';

// Normalize a tag string: trim, lowercase, collapse internal whitespace, max length 40
export function normalizeTag(raw) {
  if (!raw) return '';
  let t = String(raw).trim().toLowerCase();
  // Replace any whitespace sequence with single space
  t = t.replace(/\s+/g, ' ');
  // Basic sanitation: remove ASCII control chars (0-31 + 127) by iterating to avoid control-char regex ranges (eslint no-control-regex)
  let cleaned = '';
  for (let i = 0; i < t.length; i++) {
    const code = t.charCodeAt(i);
    if (code > 31 && code !== 127) cleaned += t[i];
  }
  t = cleaned;
  if (t.length > 40) t = t.slice(0, 40);
  return t;
}

// Fetch tags for a media_id (by media key) including aggregated score and current user vote (if userId provided)
export async function getMediaTagsWithScores(mediaKey, userId) {
  const driver = getDriver();
  // Resolve media id first
  const mediaSql = driver === 'pg'
    ? 'SELECT id FROM media WHERE media_key = $1 LIMIT 1'
    : 'SELECT id FROM media WHERE media_key = ? LIMIT 1';
  const { rows: mediaRows } = await query(mediaSql, [mediaKey]);
  if (!mediaRows.length) return [];
  const mediaId = mediaRows[0].id;
  // Aggregate votes per tag; include contributor attribution
  if (driver === 'pg') {
    const { rows } = await query(`
      SELECT mt.tag, mt.contributor_user_id as contributorUserId,
        COALESCE(SUM(v.direction),0) as score,
        COALESCE(MAX(CASE WHEN v.user_id = $2 THEN v.direction ELSE NULL END),0) as myVote
      FROM media_tags mt
      LEFT JOIN media_tag_votes v ON v.media_id = mt.media_id AND v.tag = mt.tag
      WHERE mt.media_id = $1
      GROUP BY mt.tag, mt.contributor_user_id
      ORDER BY score DESC, mt.tag ASC
    `, [mediaId, userId || 0]);
    return rows.map(r => ({ tag: r.tag, score: Number(r.score)||0, myVote: Number(r.myvote)||0, contributorUserId: r.contributoruserid }));
  } else {
    const { rows } = await query(`
      SELECT mt.tag, mt.contributor_user_id as contributorUserId,
        COALESCE(SUM(v.direction),0) as score,
        COALESCE(MAX(CASE WHEN v.user_id = ? THEN v.direction ELSE NULL END),0) as myVote
      FROM media_tags mt
      LEFT JOIN media_tag_votes v ON v.media_id = mt.media_id AND v.tag = mt.tag
      WHERE mt.media_id = ?
      GROUP BY mt.tag, mt.contributor_user_id
      ORDER BY score DESC, mt.tag ASC
    `, [userId || 0, mediaId]);
    return rows.map(r => ({ tag: r.tag, score: Number(r.score)||0, myVote: Number(r.myVote)||0, contributorUserId: r.contributorUserId }));
  }
}

// Insert a tag for a media (idempotent). Returns whether inserted or already existed.
export async function addTagToMedia(mediaKey, tag, userId) {
  const driver = getDriver();
  const normalized = normalizeTag(tag);
  if (!normalized) return { ok: false, reason: 'empty' };
  const mediaSql = driver === 'pg'
    ? 'SELECT id FROM media WHERE media_key = $1 LIMIT 1'
    : 'SELECT id FROM media WHERE media_key = ? LIMIT 1';
  const { rows } = await query(mediaSql, [mediaKey]);
  if (!rows.length) return { ok: false, reason: 'not_found' };
  const mediaId = rows[0].id;
  try {
    if (driver === 'pg') {
      await query('INSERT INTO media_tags (media_id, tag, contributor_user_id) VALUES ($1,$2,$3) ON CONFLICT (media_id, tag) DO NOTHING', [mediaId, normalized, userId || null]);
    } else {
      await query('INSERT OR IGNORE INTO media_tags (media_id, tag, contributor_user_id) VALUES (?,?,?)', [mediaId, normalized, userId || null]);
    }
    return { ok: true, tag: normalized };
  } catch (e) {
    return { ok: false, reason: 'error', error: e.message };
  }
}

// Apply vote: direction = -1, 0, 1. 0 removes vote.
export async function applyTagVote(mediaKey, tag, userId, direction) {
  direction = Number(direction);
  if (![ -1, 0, 1 ].includes(direction)) return { ok: false, reason: 'bad_direction' };
  const driver = getDriver();
  const normalized = normalizeTag(tag);
  const mediaSql = driver === 'pg'
    ? 'SELECT id FROM media WHERE media_key = $1 LIMIT 1'
    : 'SELECT id FROM media WHERE media_key = ? LIMIT 1';
  const { rows } = await query(mediaSql, [mediaKey]);
  if (!rows.length) return { ok: false, reason: 'not_found' };
  const mediaId = rows[0].id;
  if (direction === 0) {
    // delete vote
    const delSql = driver === 'pg'
      ? 'DELETE FROM media_tag_votes WHERE media_id = $1 AND tag = $2 AND user_id = $3'
      : 'DELETE FROM media_tag_votes WHERE media_id = ? AND tag = ? AND user_id = ?';
    await query(delSql, [mediaId, normalized, userId]);
    return { ok: true, removed: true };
  }
  if (driver === 'pg') {
    await query(`INSERT INTO media_tag_votes (media_id, tag, user_id, direction) VALUES ($1,$2,$3,$4)
      ON CONFLICT (media_id, tag, user_id) DO UPDATE SET direction = EXCLUDED.direction`, [mediaId, normalized, userId, direction]);
  } else {
    // Upsert pattern for SQLite: try update, if changes=0 then insert or replace
    await query('UPDATE media_tag_votes SET direction = ? WHERE media_id = ? AND tag = ? AND user_id = ?', [direction, mediaId, normalized, userId]);
    // Try insert (will fail if row existed and update applied)
    await query('INSERT OR IGNORE INTO media_tag_votes (media_id, tag, user_id, direction) VALUES (?,?,?,?)', [mediaId, normalized, userId, direction]);
  }
  return { ok: true };
}
