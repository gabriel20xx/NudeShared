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
  try { await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username COLLATE NOCASE)`); } catch (e) { /* optional */ }
  try { await query(`CREATE INDEX IF NOT EXISTS users_username_idx ON users (username)`); } catch (e) { /* optional */ }
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
  await ensureMediaTagsTable();
  await ensureMediaTagVotesTable();
  await backfillCategoryTags();
  await ensureSettingsTable();
  await softNullLegacyCategory(); // Invoke softNullLegacyCategory at the end of migrations
  // Phase 4 readiness logging: if flag set, report residual category values (non-blocking)
  if(process.env.ENABLE_CATEGORY_REMOVAL==='1'){
    try {
      const { rows: remain } = await query(`SELECT COUNT(1) AS c FROM media WHERE category IS NOT NULL AND category <> ''`);
      const { rows: distinct } = await query(`SELECT category, COUNT(1) AS uses FROM media WHERE category IS NOT NULL AND category <> '' GROUP BY category ORDER BY uses DESC LIMIT 10`);
      Logger.info(MODULE, 'CATEGORY_REMOVAL_READINESS', { remaining: Number(remain?.[0]?.c||0), sampleDistinct: distinct });
    } catch(e){
      Logger.warn(MODULE, 'CATEGORY_REMOVAL_READINESS_FAILED', { error: e.message });
    }
  }
  if (!(process.env.SILENCE_MIGRATION_LOGS === 'true')) {
    Logger.success(MODULE, 'Migrations complete');
  }
}

// Internal/test exports to allow targeted testing of phased deprecation logic.
export { backfillCategoryTags, softNullLegacyCategory };

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
  try { await query(`CREATE INDEX IF NOT EXISTS media_views_key_idx ON media_views (media_key);`);} catch (e) { /* index optional */ }
  try { await query(`CREATE INDEX IF NOT EXISTS media_views_user_idx ON media_views (user_id);`);} catch (e) { /* index optional */ }
    await query(`
      CREATE TABLE IF NOT EXISTS media_downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        media_key TEXT NOT NULL,
        app TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  try { await query(`CREATE INDEX IF NOT EXISTS media_downloads_key_idx ON media_downloads (media_key);`);} catch (e) { /* index optional */ }
  try { await query(`CREATE INDEX IF NOT EXISTS media_downloads_user_idx ON media_downloads (user_id);`);} catch (e) { /* index optional */ }
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
  try { await query(`CREATE INDEX IF NOT EXISTS media_view_sessions_key_idx ON media_view_sessions (media_key);`);} catch (e) { /* index optional */ }
  try { await query(`CREATE INDEX IF NOT EXISTS media_view_sessions_user_idx ON media_view_sessions (user_id);`);} catch (e) { /* index optional */ }
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
        /* DEPRECATION PLAN (category -> tags)
           Phase 1 (DONE): Introduce media_tags table + backfill existing non-empty category values as lowercase tags (idempotent).
           Phase 2 (CURRENT): All new UI & APIs operate on tags; category field is read-only legacy and should not be written except by historical code paths.
           Phase 3 (SCHEDULE): Add migration step that copies any remaining non-empty category values into media_tags (safety re-run) and then NULLs category column for rows (soft disable).
           Phase 4 (FINAL – future major release): Create additive migration that creates new table media_legacy_category_backup(media_id, category, archived_at) then
             INSERT remaining distinct category values for audit, followed by CREATE VIEW media_category_removed AS SELECT 'removed';
             Do NOT DROP COLUMN in-place in prior migrations; only remove in a clearly versioned major schema bump.
           Validation criteria before Phase 3: zero external consumers observed querying media.category (instrument queries or audit code search).
           NOTE: Never rewrite existing migration blocks; add new steps at end preserving historical reproducibility.
        */
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
  -- TODO: deprecate and eventually remove category column after full tag migration validation
        active INTEGER NOT NULL DEFAULT 1,
        metadata TEXT,
        original_filename TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS media_user_idx ON media (user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS media_key_idx ON media (media_key);`);
    try { await query(`CREATE INDEX IF NOT EXISTS media_category_idx ON media (category);`); } catch (e) {
      // Index creation failure is non-fatal; continue
    }
    try { await query(`CREATE INDEX IF NOT EXISTS media_active_idx ON media (active);`); } catch (e) {
      // Index creation failure is non-fatal; continue
    }
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

// media_tags: many-to-one tags for media (non-destructive additive migration replacing legacy category usage)
async function ensureMediaTagsTable(){
  const driver = getDriver();
  if(driver === 'pg'){
    await query(`
      CREATE TABLE IF NOT EXISTS media_tags (
        id BIGSERIAL PRIMARY KEY,
        media_id BIGINT NOT NULL,
        tag TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (media_id, tag)
      );
      CREATE INDEX IF NOT EXISTS media_tags_media_idx ON media_tags (media_id);
      CREATE INDEX IF NOT EXISTS media_tags_tag_idx ON media_tags (tag);
      -- Optional case-insensitive search support
      CREATE INDEX IF NOT EXISTS media_tags_lower_tag_idx ON media_tags (lower(tag));
      -- Attribution column (nullable for legacy rows) referencing users.id when available
      ALTER TABLE media_tags ADD COLUMN IF NOT EXISTS contributor_user_id BIGINT;
      CREATE INDEX IF NOT EXISTS media_tags_contributor_idx ON media_tags (contributor_user_id);
    `);
    return;
  }
  if(driver === 'sqlite'){
    await query(`
      CREATE TABLE IF NOT EXISTS media_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (media_id, tag)
      );
    `);
    try { await query(`CREATE INDEX IF NOT EXISTS media_tags_media_idx ON media_tags (media_id);`); } catch(e) { /* optional */ }
    try { await query(`CREATE INDEX IF NOT EXISTS media_tags_tag_idx ON media_tags (tag);`); } catch(e) { /* optional */ }
    try { await query(`CREATE INDEX IF NOT EXISTS media_tags_lower_tag_idx ON media_tags (lower(tag));`); } catch(e) { /* optional */ }
    // Attempt to add contributor_user_id if missing (SQLite lacks IF NOT EXISTS for add column in some versions)
    try { await query(`ALTER TABLE media_tags ADD COLUMN contributor_user_id INTEGER`); } catch(e) { /* ignore duplicate column */ }
    try { await query(`CREATE INDEX IF NOT EXISTS media_tags_contributor_idx ON media_tags (contributor_user_id);`); } catch(e) { /* optional */ }
    return;
  }
}

// User votes on tags (per media, per tag, per user). score = sum(direction) aggregated via query (direction constrained to -1 or 1)
async function ensureMediaTagVotesTable(){
  const driver = getDriver();
  if(driver === 'pg'){
    await query(`
      CREATE TABLE IF NOT EXISTS media_tag_votes (
        id BIGSERIAL PRIMARY KEY,
        media_id BIGINT NOT NULL,
        tag TEXT NOT NULL,
        user_id BIGINT NOT NULL,
        direction SMALLINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (media_id, tag, user_id)
      );
      CREATE INDEX IF NOT EXISTS media_tag_votes_media_idx ON media_tag_votes (media_id);
      CREATE INDEX IF NOT EXISTS media_tag_votes_tag_idx ON media_tag_votes (tag);
      CREATE INDEX IF NOT EXISTS media_tag_votes_user_idx ON media_tag_votes (user_id);
    `);
    return;
  }
  if(driver === 'sqlite'){
    await query(`
      CREATE TABLE IF NOT EXISTS media_tag_votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        direction INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (media_id, tag, user_id)
      );
    `);
    try { await query(`CREATE INDEX IF NOT EXISTS media_tag_votes_media_idx ON media_tag_votes (media_id);`); } catch(e) { /* optional */ }
    try { await query(`CREATE INDEX IF NOT EXISTS media_tag_votes_tag_idx ON media_tag_votes (tag);`); } catch(e) { /* optional */ }
    try { await query(`CREATE INDEX IF NOT EXISTS media_tag_votes_user_idx ON media_tag_votes (user_id);`); } catch(e) { /* optional */ }
    return;
  }
}

// Backfill legacy category values into media_tags (one-time idempotent).
// Inserts a tag row for each media that has a non-null, non-empty category and no existing identical tag.
async function backfillCategoryTags(){
  try {
    const driver = getDriver();
    if(driver === 'pg'){
      await query(`INSERT INTO media_tags (media_id, tag)
        SELECT m.id, lower(trim(m.category)) as tag
        FROM media m
        LEFT JOIN media_tags t ON t.media_id = m.id AND t.tag = lower(trim(m.category))
        WHERE m.category IS NOT NULL AND m.category <> '' AND t.id IS NULL;`);
    } else if(driver === 'sqlite') {
      // SQLite variant; use INSERT OR IGNORE for idempotence
      await query(`INSERT OR IGNORE INTO media_tags (media_id, tag)
        SELECT m.id, lower(trim(m.category)) as tag
        FROM media m
        WHERE m.category IS NOT NULL AND m.category <> '';
      `);
    }
  } catch(e){
    Logger.warn(MODULE, 'Category backfill skipped', { error: e.message });
  }
}
// NOTE: Future category removal sequence will add a new function here (e.g., softNullLegacyCategory()) and invoke at end of runMigrations() once guard flag present.
// Phase 3 (planned) soft-null implementation (guarded): when ENABLE_SOFT_NULL_CATEGORY=1, ensure any remaining category values are re-backfilled then nulled.
async function softNullLegacyCategory(){
  if(process.env.ENABLE_SOFT_NULL_CATEGORY!=='1') return; // guard
  try {
    const driver = getDriver();
    // Safety re-backfill (idempotent)
    await backfillCategoryTags();
    // Backup table
    if(driver==='pg'){
      await query(`CREATE TABLE IF NOT EXISTS media_legacy_category_backup (
        media_id BIGINT NOT NULL,
        category TEXT NOT NULL,
        archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(media_id, category)
      );`);
      // Insert new (non-null) categories not yet archived
      await query(`INSERT INTO media_legacy_category_backup (media_id, category)
        SELECT id, category FROM media m
        WHERE category IS NOT NULL AND category <> ''
          AND NOT EXISTS (SELECT 1 FROM media_legacy_category_backup b WHERE b.media_id = m.id AND b.category = m.category);`);
      // Soft null out (set to NULL)
      await query(`UPDATE media SET category = NULL WHERE category IS NOT NULL AND category <> '';`);
    } else if(driver==='sqlite') {
      await query(`CREATE TABLE IF NOT EXISTS media_legacy_category_backup (
        media_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        archived_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(media_id, category)
      );`);
      await query(`INSERT OR IGNORE INTO media_legacy_category_backup (media_id, category)
        SELECT id, category FROM media WHERE category IS NOT NULL AND category <> '';
      `);
      // SQLite lacks strict NULL vs empty difference in some flows; set to NULL explicitly
      await query(`UPDATE media SET category = NULL WHERE category IS NOT NULL AND category <> '';
      `);
    }
    Logger.info(MODULE, 'Soft-null legacy category complete');
  } catch(e){
    Logger.warn(MODULE, 'Soft-null legacy category failed', { error: e.message });
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
  try { await query(`CREATE INDEX IF NOT EXISTS media_metrics_created_idx ON media_metrics (created_at);`);} catch (e) { /* index optional */ }
  try { await query(`CREATE INDEX IF NOT EXISTS media_metrics_key_idx ON media_metrics (media_key);`);} catch (e) { /* index optional */ }
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
  try { await query(`CREATE UNIQUE INDEX IF NOT EXISTS playlists_user_lowername_unique ON playlists (user_id, lower(name));`); } catch (e) { /* case-insensitive uniqueness index optional */ }
  try { await query(`CREATE INDEX IF NOT EXISTS playlists_user_idx ON playlists (user_id);`); } catch (e) { /* index optional */ }
    await query(`
      CREATE TABLE IF NOT EXISTS playlist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        media_key TEXT NOT NULL,
        position INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  try { await query(`CREATE UNIQUE INDEX IF NOT EXISTS playlist_items_unique ON playlist_items (playlist_id, media_key);`);} catch (e) { /* index optional */ }
  try { await query(`CREATE INDEX IF NOT EXISTS playlist_items_playlist_idx ON playlist_items (playlist_id);`);} catch (e) { /* index optional */ }
  try { await query(`CREATE INDEX IF NOT EXISTS playlist_items_media_key_idx ON playlist_items (media_key);`);} catch (e) { /* index optional */ }
    return;
  }
}
