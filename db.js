// Shared PostgreSQL connection (ESM)
// Usage (server-side only):
//   import { initDb, getDb, query, closeDb } from '../../NudeShared/db.js';
//   await initDb();
//   const { rows } = await query('SELECT 1');
import Logger from './serverLogger.js';
import { Pool } from 'pg';

const MODULE = 'DB';
let pool; // singleton

function buildConfig() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  const sslEnv = process.env.DATABASE_SSL || process.env.PGSSL || '';
  const ssl = /^true|require|1$/i.test(String(sslEnv)) ? { rejectUnauthorized: false } : undefined;

  if (url) {
    return { connectionString: url, ssl };
  }
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
  if (!pool) {
    pool = new Pool(buildConfig());
    pool.on('error', (err) => Logger.error(MODULE, 'Unexpected idle client error', err));
  }
  return pool;
}

export async function initDb() {
  try {
    const p = getDb();
    // simple connectivity check
    await p.query('SELECT 1');
    Logger.success(MODULE, 'Connected to PostgreSQL');
  } catch (err) {
    Logger.error(MODULE, 'Failed to connect to PostgreSQL', err);
    throw err;
  }
}

export async function query(text, params) {
  const p = getDb();
  return p.query(text, params);
}

export async function closeDb() {
  if (pool) {
    try {
      await pool.end();
      Logger.info(MODULE, 'PostgreSQL pool closed');
    } catch (e) {
      Logger.warn(MODULE, 'Error closing PostgreSQL pool', e);
    } finally {
      pool = undefined;
    }
  }
}
