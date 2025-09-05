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
    return;
  }
  throw new Error('No database driver available for migrations');
}

export async function runMigrations() {
  Logger.info(MODULE, 'Running database migrations...');
  await ensureUsersTable();
  Logger.success(MODULE, 'Migrations complete');
}
