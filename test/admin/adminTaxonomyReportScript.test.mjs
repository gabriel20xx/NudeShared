import { describe, it, expect, beforeAll } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { runMigrations } from '../../server/db/migrate.js';
import { query } from '../../server/db/db.js';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

/* Validates taxonomy report script JSON output shape */

describe('taxonomy report script', () => {
  beforeAll(async () => {
    await ensureTestDb({ fresh:true });
    await runMigrations();
    const now = new Date().toISOString();
    const mk = (n)=> `/media/output/tax_${n}_${Date.now()}.mp4`;
    const mks = [mk(1), mk(2), mk(3)];
    for(const k of mks){
      await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, k, 'Tax', null, now]);
    }
    // Add some tags (two share one tag, third distinct)
    const { rows } = await query('SELECT id, media_key FROM media WHERE media_key IN (?,?,?)', mks);
    const idMap = Object.fromEntries(rows.map(r=> [r.media_key, r.id]));
    await query('INSERT INTO media_tags (media_id, tag, created_at) VALUES (?,?,?)', [idMap[mks[0]], 'taxa', now]);
    await query('INSERT INTO media_tags (media_id, tag, created_at) VALUES (?,?,?)', [idMap[mks[1]], 'taxa', now]);
    await query('INSERT INTO media_tags (media_id, tag, created_at) VALUES (?,?,?)', [idMap[mks[2]], 'taxb', now]);
  });

  it('produces a valid taxonomy JSON report', async () => {
    const script = path.join(root, 'scripts', 'taxonomy-report.mjs');
    const proc = spawnSync(process.execPath, [script, '--json'], { encoding:'utf8' });
    expect(proc.status).toBe(0);
    const line = (proc.stdout||'').trim().split(/\r?\n/).filter(Boolean).pop();
    const json = JSON.parse(line);
    expect(json.ok).toBe(true);
    expect(json).toHaveProperty('remainingCategories');
    expect(Array.isArray(json.topTags)).toBe(true);
    expect(json).toHaveProperty('pairCardinality');
    expect(json.coverage).toBeTruthy();
    expect(json.coverage).toHaveProperty('percent');
  });
});
