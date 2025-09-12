import { describe, it, expect, beforeAll } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { query } from '../../server/db/db.js';
import { backfillCategoryTags, softNullLegacyCategory } from '../../server/db/migrate.js';

// This test exercises Phase 3 soft-null logic behind ENABLE_SOFT_NULL_CATEGORY flag.
// It ensures:
// 1. Legacy category values are backfilled into media_tags.
// 2. Backup rows created in media_legacy_category_backup.
// 3. Category column set to NULL while tags persist.

describe('admin media category soft-null phase (env guarded)', () => {
  beforeAll(async () => {
    process.env.ENABLE_SOFT_NULL_CATEGORY = '1';
    await ensureTestDb({ fresh: true, memory: true });
  });

  it('backfills, archives, and soft-nulls category values', async () => {
    const now = new Date().toISOString();
    // Seed two media rows with legacy categories
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, '/media/output/softA_'+Date.now()+'.mp4', 'SoftA', 'legacyone', now]);
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, '/media/output/softB_'+Date.now()+'.mp4', 'SoftB', 'legacytwo', now]);

    // Explicit backfill (normally run in migrations earlier)
    await backfillCategoryTags();

    // Invoke soft-null
    await softNullLegacyCategory();

    // Tags should exist
    const { rows: tagRows } = await query('SELECT tag FROM media_tags WHERE tag IN (?,?)', ['legacyone','legacytwo']);
    expect(tagRows.length).toBeGreaterThanOrEqual(2);

    // Categories should be nulled
    const { rows: catRows } = await query('SELECT category FROM media WHERE category IS NOT NULL');
    expect(catRows.length).toBe(0);

    // Backup table should contain archived categories
    const { rows: backup } = await query('SELECT category FROM media_legacy_category_backup WHERE category IN (?,?)', ['legacyone','legacytwo']);
    expect(backup.length).toBeGreaterThanOrEqual(2);
  });
});
