// Database abstraction with PostgreSQL preferred and SQLite fallback
import Logger from '../logger/serverLogger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
let BetterSqlite3;
async function loadPackage(name) {
  try {
    return await import(name);
  } catch {
  const { createRequire } = await import('module'); // Import error handling
    const req = createRequire(path.join(process.cwd(), 'package.json'));
    return req(name);
  }
}

const MODULE = 'DB';
let pool; // PG singleton
let sqliteDb; // SQLite singleton (better-sqlite3 database instance)
let driver = 'none'; // 'pg' | 'sqlite' | 'none'

// Derive __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildConfig() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  const sslEnv = process.env.DATABASE_SSL || process.env.PGSSL || '';
  const ssl = /^true|require|1$/i.test(String(sslEnv)) ? { rejectUnauthorized: false } : undefined;
  if (url) return { connectionString: url, ssl };
  const cfg = {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || process.env.PGDB || 'postgres'
  };
  if (ssl) cfg.ssl = ssl;
  return cfg;
}

export function getDb() {
  if (driver === 'pg') return pool;
  if (driver === 'sqlite') return sqliteDb;
  return null;
}
export function getDriver() { return driver; }

export async function initDb() {
  const hasPgEnv = Boolean(process.env.DATABASE_URL || process.env.PGHOST || process.env.PGDATABASE);
  if (hasPgEnv) {
    try {
      const { Pool } = await loadPackage('pg');
      pool = new Pool(buildConfig());
      pool.on('error', (err) => Logger.error(MODULE, 'Unexpected idle client error', err));
      await pool.query('SELECT 1');
      driver = 'pg';
      Logger.success(MODULE, 'Connected to PostgreSQL');
      return { driver };
    } catch (err) {
        Logger.error(MODULE, 'PostgreSQL connection failed, attempting SQLite fallback', { message: err?.message, code: err?.code }); // Connection error handling
    }
  }
  try {
    if (!BetterSqlite3) {
      const mod = await loadPackage('better-sqlite3');
      BetterSqlite3 = mod.default || mod;
    }
  // Default location: a repo-level "database/dbfile.db" next to the NudeShared folder
  // From this file at NudeShared/server/db, go up 3 to reach the repo root
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const defaultPath = path.join(repoRoot, 'database', 'dbfile.db');
    const sqlitePath = process.env.SQLITE_PATH || defaultPath;
    const dir = path.dirname(sqlitePath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {
      // Ignore mkdir race conditions
    }
    // Proactively create the file when using a regular filesystem path
    try {
      if (sqlitePath !== ':memory:' && !/^file:/i.test(sqlitePath)) {
        if (!fs.existsSync(sqlitePath)) {
          fs.closeSync(fs.openSync(sqlitePath, 'a'));
        }
      }
  } catch {
      // Swallow close errors during shutdown
    }
    try {
      sqliteDb = new BetterSqlite3(sqlitePath);
  } catch (loadErr) {
      const isDlopen = /ERR_DLOPEN_FAILED/i.test(String(loadErr?.code)) || /dlopen/i.test(String(loadErr?.message||''));
      Logger.error(MODULE, 'better-sqlite3 native module load failed', { code: loadErr?.code, message: loadErr?.message, isDlopen, sqlitePath });
      if (isDlopen) {
        Logger.warn(MODULE, 'Detected native load failure (dlopen). Ensure optional native deps built or install prebuilt binaries. Falling back to in-memory ephemeral DB if allowed.');
        // Attempt an in-memory ephemeral DB as last resort (non-persistent)
        try {
          sqliteDb = new BetterSqlite3(':memory:');
          driver = 'sqlite';
          Logger.warn(MODULE, 'Using in-memory SQLite fallback due to native load error');
          return { driver, ephemeral: true };
        } catch (_memErr) {
          Logger.error(MODULE, 'Failed creating in-memory fallback SQLite instance', { message: _memErr?.message });
          throw loadErr; // rethrow original
        }
      } else {
        throw loadErr;
      }
    }
    sqliteDb.pragma('journal_mode = WAL');
    driver = 'sqlite';
    Logger.success(MODULE, `Using SQLite database at ${sqlitePath}`);
    return { driver };
  } catch (err) {
    driver = 'none';
      Logger.error(MODULE, 'Failed to initialize SQLite fallback', { message: err?.message, code: err?.code }); // SQLite initialization error handling
    throw err;
  }
}

export async function query(text, params) {
  // Lazy init for test environments if not initialized
  if (driver === 'none') {
    // Attempt initialization; bubble up error if it fails
    await initDb();
  }
  if (driver === 'pg') return pool.query(text, params);
  if (driver === 'sqlite') {
    let sql = String(text || '');
    const args = Array.isArray(params) ? params : [];
    if (/\$\d+/.test(sql)) sql = sql.replace(/\$\d+/g, '?');
    const upper = sql.trim().toUpperCase();
    const isSelect = upper.startsWith('SELECT') || upper.startsWith('PRAGMA') || upper.startsWith('WITH');
    const stmt = sqliteDb.prepare(sql);
    if (isSelect) {
      const rows = stmt.all(...args);
      return { rows };
    }
    // Handle statements with RETURNING by fetching the resulting row(s)
    if (/\bRETURNING\b/i.test(sql)) {
      const row = stmt.get(...args);
      const rows = row ? [row] : [];
      return { rows };
    }
    const info = stmt.run(...args);
    return { rows: [], changes: info.changes ?? 0, lastID: info.lastInsertRowid };
  }
  throw new Error('Database not initialized');
}

export async function closeDb() {
  if (pool) {
    try { await pool.end(); Logger.info(MODULE, 'PostgreSQL pool closed'); }
  catch (_e) { Logger.warn(MODULE, 'Error closing PostgreSQL pool', _e); }
    finally { pool = undefined; }
  }
  if (sqliteDb) {
    try { sqliteDb.close(); Logger.info(MODULE, 'SQLite database closed'); }
  catch (_e) { Logger.warn(MODULE, 'Error closing SQLite database', _e); }
    finally { sqliteDb = undefined; }
  }
}

// Optional re-export of migrations to keep legacy test imports stable.
// NOTE: Prefer importing runMigrations directly from migrate.js in new code.
export { runMigrations } from './migrate.js';

// Guard to prevent redundant migrations in a single process (tests spin up many apps)
let __migrationsDone = false;
export async function ensureDatabaseReady({ silentMigrations = false } = {}) {
  await initDb();
  if (!__migrationsDone) {
    try {
      if (silentMigrations) {
        await (await import('./migrate.js')).runMigrations({ suppressLog: true });
      } else {
        await (await import('./migrate.js')).runMigrations();
      }
    } catch (e) {
      if (!silentMigrations) throw e; // in silent mode swallow
    }
    __migrationsDone = true;
  }
  return getDb();
}
