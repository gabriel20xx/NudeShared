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
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
  -- Ensure username is unique (case-insensitive) when set
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users ((lower(username))) WHERE username IS NOT NULL;
  CREATE INDEX IF NOT EXISTS users_username_idx ON users (username);
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
  // Enforce uniqueness on username (case-insensitive for ASCII)
  try { await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username COLLATE NOCASE)`); } catch (e) { /* ignore */ }
  try { await query(`CREATE INDEX IF NOT EXISTS users_username_idx ON users (username)`); } catch (e) { /* ignore */ }
    await addCol(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
      await addCol(`ALTER TABLE users ADD COLUMN bio TEXT`);
      await addCol(`ALTER TABLE users ADD COLUMN totp_secret TEXT`);
      await addCol(`ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0`);
      await addCol(`ALTER TABLE users ADD COLUMN role TEXT`);
      await addCol(`ALTER TABLE users ADD COLUMN permissions TEXT`);
      await addCol(`ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0`);
      await addCol(`ALTER TABLE users ADD COLUMN password_reset_token TEXT`);
      await addCol(`ALTER TABLE users ADD COLUMN password_reset_expires TEXT`);
  await addCol(`ALTER TABLE users ADD COLUMN last_login_at TEXT`);
    return;
  }
  throw new Error('No database driver available for migrations');
}

let migrationsLogged = false;
export async function runMigrations() {
  if (process.env.SILENCE_MIGRATION_LOGS === 'true') {
    if (!migrationsLogged) {
      Logger.info(MODULE, 'Running database migrations (logging suppressed for subsequent calls)...');
      migrationsLogged = true;
    }
  } else {
    Logger.info(MODULE, 'Running database migrations...');
  }
  await ensureUsersTable();
  await ensureMediaTable();
  await ensureMediaLikeSaveTables();
  await ensurePlaylistsTables();
  await ensureMediaViewDownloadTables();
  await ensureMediaMetricsTable();
  await ensureMediaViewSessionsTable();
  await ensureSettingsTable();
  if (!(process.env.SILENCE_MIGRATION_LOGS === 'true')) {
    Logger.success(MODULE, 'Migrations complete');
  }
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

async function ensureMediaViewDownloadTables(){
  const driver = getDriver();
  if(driver === 'pg'){
    await query(`
      CREATE TABLE IF NOT EXISTS media_views (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT,
        media_key TEXT NOT NULL,
        app TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS media_views_key_idx ON media_views (media_key);
      CREATE INDEX IF NOT EXISTS media_views_user_idx ON media_views (user_id);
      
      CREATE TABLE IF NOT EXISTS media_downloads (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT,
        media_key TEXT NOT NULL,
        app TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS media_downloads_key_idx ON media_downloads (media_key);
      CREATE INDEX IF NOT EXISTS media_downloads_user_idx ON media_downloads (user_id);
    `);
    return;
  }
  if(driver === 'sqlite'){
    await query(`
      CREATE TABLE IF NOT EXISTS media_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        media_key TEXT NOT NULL,
        app TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    try { await query(`CREATE INDEX IF NOT EXISTS media_views_key_idx ON media_views (media_key);`);} catch{}
    try { await query(`CREATE INDEX IF NOT EXISTS media_views_user_idx ON media_views (user_id);`);} catch{}
    await query(`
      CREATE TABLE IF NOT EXISTS media_downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        media_key TEXT NOT NULL,
        app TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    try { await query(`CREATE INDEX IF NOT EXISTS media_downloads_key_idx ON media_downloads (media_key);`);} catch{}
    try { await query(`CREATE INDEX IF NOT EXISTS media_downloads_user_idx ON media_downloads (user_id);`);} catch{}
    return;
  }
}

async function ensureMediaViewSessionsTable(){
  const driver = getDriver();
  if(driver === 'pg') {
    await query(`
      CREATE TABLE IF NOT EXISTS media_view_sessions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT,
        media_key TEXT NOT NULL,
        duration_ms BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS media_view_sessions_key_idx ON media_view_sessions (media_key);
      CREATE INDEX IF NOT EXISTS media_view_sessions_user_idx ON media_view_sessions (user_id);
    `);
    return;
  }
  if(driver === 'sqlite') {
    await query(`
      CREATE TABLE IF NOT EXISTS media_view_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        media_key TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    try { await query(`CREATE INDEX IF NOT EXISTS media_view_sessions_key_idx ON media_view_sessions (media_key);`);} catch{}
    try { await query(`CREATE INDEX IF NOT EXISTS media_view_sessions_user_idx ON media_view_sessions (user_id);`);} catch{}
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
        title TEXT,
        category TEXT,
        active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB,
        original_filename TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS media_user_idx ON media (user_id);
      CREATE INDEX IF NOT EXISTS media_key_idx ON media (media_key);
      CREATE INDEX IF NOT EXISTS media_category_idx ON media (category);
      CREATE INDEX IF NOT EXISTS media_active_idx ON media (active);
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
        title TEXT,
        category TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        metadata TEXT,
        original_filename TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS media_user_idx ON media (user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS media_key_idx ON media (media_key);`);
    try { await query(`CREATE INDEX IF NOT EXISTS media_category_idx ON media (category);`); } catch {}
    try { await query(`CREATE INDEX IF NOT EXISTS media_active_idx ON media (active);`); } catch {}
    return;
  }
}

async function ensureSettingsTable(){
  const driver = getDriver();
  if(driver === 'pg'){
    await query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    return;
  }
  if(driver === 'sqlite'){
    await query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    return;
  }
}

async function ensureMediaMetricsTable(){
  const driver = getDriver();
  if(driver === 'pg'){
    await query(`
      CREATE TABLE IF NOT EXISTS media_metrics (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT,
        media_key TEXT NOT NULL,
        elapsed_ms BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS media_metrics_created_idx ON media_metrics (created_at);
      CREATE INDEX IF NOT EXISTS media_metrics_key_idx ON media_metrics (media_key);
    `);
    return;
  }
  if(driver === 'sqlite'){
    await query(`
      CREATE TABLE IF NOT EXISTS media_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        media_key TEXT NOT NULL,
        elapsed_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    try { await query(`CREATE INDEX IF NOT EXISTS media_metrics_created_idx ON media_metrics (created_at);`);} catch{}
    try { await query(`CREATE INDEX IF NOT EXISTS media_metrics_key_idx ON media_metrics (media_key);`);} catch{}
    return;
  }
}

// Playlists tables: playlists and playlist_items
async function ensurePlaylistsTables(){
  const driver = getDriver();
  if(driver === 'pg'){
    await query(`
      CREATE TABLE IF NOT EXISTS playlists (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, name)
      );
      -- Case-insensitive uniqueness helper index
      CREATE UNIQUE INDEX IF NOT EXISTS playlists_user_lowername_unique ON playlists (user_id, (lower(name)));
      CREATE INDEX IF NOT EXISTS playlists_user_idx ON playlists (user_id);

      CREATE TABLE IF NOT EXISTS playlist_items (
        id BIGSERIAL PRIMARY KEY,
        playlist_id BIGINT NOT NULL,
        media_key TEXT NOT NULL,
        position INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (playlist_id, media_key)
      );
      CREATE INDEX IF NOT EXISTS playlist_items_playlist_idx ON playlist_items (playlist_id);
      CREATE INDEX IF NOT EXISTS playlist_items_media_key_idx ON playlist_items (media_key);
    `);
    return;
  }
  if(driver === 'sqlite'){
    await query(`
      CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    try { await query(`CREATE UNIQUE INDEX IF NOT EXISTS playlists_user_lowername_unique ON playlists (user_id, lower(name));`); } catch{}
    try { await query(`CREATE INDEX IF NOT EXISTS playlists_user_idx ON playlists (user_id);`); } catch{}
    await query(`
      CREATE TABLE IF NOT EXISTS playlist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        media_key TEXT NOT NULL,
        position INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    try { await query(`CREATE UNIQUE INDEX IF NOT EXISTS playlist_items_unique ON playlist_items (playlist_id, media_key);`);} catch{}
    try { await query(`CREATE INDEX IF NOT EXISTS playlist_items_playlist_idx ON playlist_items (playlist_id);`);} catch{}
    try { await query(`CREATE INDEX IF NOT EXISTS playlist_items_media_key_idx ON playlist_items (media_key);`);} catch{}
    return;
  }
}
