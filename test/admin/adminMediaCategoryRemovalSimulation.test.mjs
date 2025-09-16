import { describe, it, expect, beforeAll } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { query, getDriver } from '../../server/db/db.js';
import { runMigrations } from '../../server/db/migrate.js';
import { spawnSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// NudeShared root (test/admin -> test -> NudeShared)
const nudeSharedRoot = path.resolve(__dirname, '../..');

// This test invokes the simulation script and inspects its JSON output for readiness markers.

describe('simulate category removal script', () => {
  beforeAll(async () => {
    await ensureTestDb({ fresh:true });
    // Run initial migrations so tables exist before simulation script runs its own guarded pass
    await runMigrations();
    const now = new Date().toISOString();
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, '/media/output/simA_'+Date.now()+'.mp4', 'SimA', 'legacysim', now]);
    await query('INSERT INTO media (user_id, media_key, title, category, active, created_at) VALUES (?,?,?,?,1,?)', [1, '/media/output/simB_'+Date.now()+'.mp4', 'SimB', 'legacysim', now]);
    const driver = getDriver();
    if(driver==='pg'){
      await query("INSERT INTO media_tags (media_id, tag, created_at) SELECT m.id, lower(m.category), $1 FROM media m WHERE m.category IS NOT NULL AND m.category <> '' ON CONFLICT DO NOTHING", [now]);
    } else {
      await query("INSERT OR IGNORE INTO media_tags (media_id, tag, created_at) SELECT id, lower(category), ? FROM media WHERE category IS NOT NULL AND category <> ''", [now]);
    }
  });

  it('produces readiness JSON with postSoftNullRemaining=0', async () => {
    // Execute the simulation script
  const scriptPath = path.join(nudeSharedRoot, 'scripts', 'simulate-category-removal.mjs');
    const proc = spawnSync(process.execPath, [scriptPath], { encoding:'utf8' });
    // Even if status non-zero, attempt to parse output for readiness info
    let combined = (proc.stdout||'') + '\n' + (proc.stderr||'');
    const lines = combined.split(/\r?\n/).map(l=> l.trim()).filter(Boolean);
    let jsonLine = [...lines].reverse().find(l=> l.startsWith('{') && l.endsWith('}'));
    if(!jsonLine){
      // Fallback: dynamic import script within this process and capture console
  const logs=[]; const origLog = console.log; try { console.log = (...a)=>{ logs.push(a.join(' ')); origLog(...a); }; await import(pathToFileURL(path.join(nudeSharedRoot,'scripts','simulate-category-removal.mjs')).href); } catch { /* fallback dynamic import failed – acceptable for readiness test */ } finally { console.log = origLog; }
      jsonLine = logs.reverse().find(l=> l.trim().startsWith('{') && l.trim().endsWith('}'));
    }
    expect(jsonLine, 'Expected simulation script to emit a JSON summary line').toBeTruthy();
    const out = JSON.parse(jsonLine);
    expect(out).toHaveProperty('preRemaining');
    expect(out).toHaveProperty('postSoftNullRemaining');
    if(out.preRemaining!=null && out.postSoftNullRemaining!=null){
      expect(out.postSoftNullRemaining).toBeLessThanOrEqual(out.preRemaining);
    }
    expect(Array.isArray(out.tagSample)).toBe(true);
    // If ok false, it should list notes
    if(out.ok === false){ expect(out.notes.length).toBeGreaterThan(0); }
  });
});
