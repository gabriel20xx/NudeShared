// Centralized shared configuration: HTTPS, DB, shared dirs, and common UI prefs
// Apps can import and re-export these to avoid duplication.
try { (await import('dotenv')).config(); } catch {}

function clamp(num, min, max){
  try { num = Number(num); } catch {}
  return Math.max(min, Math.min(max, Number.isFinite(num) ? num : min));
}

// Server
export const PORT = process.env.PORT || 8080;

// HTTPS
export const ENABLE_HTTPS = (process.env.HTTPS === 'true' || process.env.ENABLE_HTTPS === 'true');
export const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '';
export const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '';

// Shared assets root hint (used when mounting /shared)
export const NUDESHARED_DIR = process.env.NUDESHARED_DIR || '';

// UI preferences
export const PRELOAD_RADIUS = clamp(process.env.PRELOAD_RADIUS ?? process.env.PRELOAD_NEIGHBOR_RADIUS ?? 2, 0, 10);

// Database (Postgres preferred; SQLite fallback handled by shared db.js)
export const PGHOST = process.env.PGHOST || 'localhost';
export const PGPORT = Number(process.env.PGPORT || 5432);
export const PGUSER = process.env.PGUSER || 'postgres';
export const PGPASSWORD = process.env.PGPASSWORD || '';
export const PGDATABASE = process.env.PGDATABASE || process.env.PGDB || '';
// Default SQLite path relative to repo root: database/dbfile.db
export const SQLITE_PATH = process.env.SQLITE_PATH || 'database/dbfile.db';
export const DATABASE_SSL = process.env.DATABASE_SSL || process.env.PGSSL || '';
