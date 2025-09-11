// Central table readiness polling helper with per-table memoization
// Usage: await ensureTableReady('settings', { attempts:10, delayMs:100, queryFn, log })
import { query } from '../db/db.js';

const __readyCache = new Map(); // tableName -> boolean

export async function ensureTableReady(tableName, opts = {}) {
  if (!tableName) return false;
  if (__readyCache.get(tableName)) return true;
  const attempts = Number.isFinite(opts.attempts) ? opts.attempts : 10;
  const delayMs = Number.isFinite(opts.delayMs) ? opts.delayMs : 100;
  const log = opts.log; // optional logging function
  const q = typeof opts.queryFn === 'function' ? opts.queryFn : query;
  for (let i = 0; i < attempts; i++) {
    try {
      await q(`SELECT 1 FROM ${tableName} LIMIT 1`);
      __readyCache.set(tableName, true);
      return true;
    } catch (_err) {
      // swallow missing-table errors until attempts exhausted
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  try { log && log('READINESS', `table_not_ready:${tableName}`); } catch { /* logging optional */ }
  return false;
}

export function markTableReady(tableName) { if (tableName) __readyCache.set(tableName, true); }
export function resetTableReadiness(tableName) { if (tableName) __readyCache.delete(tableName); else __readyCache.clear(); }

export default { ensureTableReady, markTableReady, resetTableReadiness };
