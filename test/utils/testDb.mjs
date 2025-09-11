// Lightweight shared DB helpers for tests to avoid re-running migrations repeatedly.
import { initDb, closeDb } from '../../server/db/db.js';
import { runMigrations } from '../../server/db/migrate.js';

let migrated = false;

/**
 * Ensures the test database is initialized and (once) migrated.
 * Options:
 *  - memory: use in-memory sqlite for isolation
 *  - fresh: force migrations again (resets migrated flag, for memory DB cases)
 */
export async function ensureTestDb(options = {}) {
  const { memory = false, fresh = false } = options;
  if (memory) {
    // For explicit memory isolation, point to :memory:
    process.env.SQLITE_PATH=':memory:';
    if (fresh) migrated = false; // allow forced re-run
  }
  await initDb();
  if (!migrated) {
    await runMigrations();
    migrated = true;
  }
}

/** Force re-run migrations on next ensureTestDb call (mainly for specialized suites). */
export function resetMigrationFlag(){ migrated = false; }

/** Close DB (used rarely; global teardown usually handles). */
export async function shutdownTestDb(){ await closeDb(); }

export default { ensureTestDb, resetMigrationFlag, shutdownTestDb };
