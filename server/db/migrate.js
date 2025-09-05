import { getDriver, query } from './db.js';
import Logger from '../logger/serverLogger.js';

const MODULE = 'MIGRATE';

async function ensureUsersTable() {
  const driver = getDriver();
  if (driver === 'pg') {
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
    `);
    return;
  }
  if (driver === 'sqlite') {
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);`);
    // SQLite lacks IF NOT EXISTS for ADD COLUMN on many builds; try individually and ignore duplication errors
    const addCol = async (sql) => {
      try { await query(sql); } catch (e) { /* ignore duplicate column errors */ }
    };
    await addCol(`ALTER TABLE users ADD COLUMN username TEXT`);
    await addCol(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
    await addCol(`ALTER TABLE users ADD COLUMN bio TEXT`);
    await addCol(`ALTER TABLE users ADD COLUMN totp_secret TEXT`);
    await addCol(`ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0`);
    return;
  }
  throw new Error('No database driver available for migrations');
}

export async function runMigrations() {
  Logger.info(MODULE, 'Running database migrations...');
  await ensureUsersTable();
  await ensureMediaTable();
  await ensureMediaLikeSaveTables();
  Logger.success(MODULE, 'Migrations complete');
}

async function ensureMediaLikeSaveTables() {
  const driver = getDriver();
  if (driver === 'pg') {
    await query(`
      CREATE TABLE IF NOT EXISTS media_likes (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        media_key TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, media_key)
      );
      CREATE INDEX IF NOT EXISTS media_likes_key_idx ON media_likes (media_key);
      CREATE TABLE IF NOT EXISTS media_saves (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        media_key TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, media_key)
      );
      CREATE INDEX IF NOT EXISTS media_saves_key_idx ON media_saves (media_key);
    `);
    return;
  }
  if (driver === 'sqlite') {
    await query(`
      CREATE TABLE IF NOT EXISTS media_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        media_key TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (user_id, media_key)
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS media_likes_key_idx ON media_likes (media_key);`);
    await query(`
      CREATE TABLE IF NOT EXISTS media_saves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        media_key TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (user_id, media_key)
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS media_saves_key_idx ON media_saves (media_key);`);
    return;
  }
}

async function ensureMediaTable(){
  const driver = getDriver();
  if(driver === 'pg'){
    await query(`
      CREATE TABLE IF NOT EXISTS media (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT,
        media_key TEXT NOT NULL,
        app TEXT,
        original_filename TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS media_user_idx ON media (user_id);
      CREATE INDEX IF NOT EXISTS media_key_idx ON media (media_key);
    `);
    return;
  }
  if(driver === 'sqlite'){
    await query(`
      CREATE TABLE IF NOT EXISTS media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        media_key TEXT NOT NULL,
        app TEXT,
        original_filename TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS media_user_idx ON media (user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS media_key_idx ON media (media_key);`);
    return;
  }
}
