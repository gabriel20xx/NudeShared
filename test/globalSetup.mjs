import { beforeAll, afterAll, vi } from 'vitest';
import { initDb, closeDb } from '../server/db/db.js';
import { runMigrations } from '../server/db/migrate.js';

// Ensure test environment flag
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
// Suppress duplicate migration log lines as early as possible
process.env.SILENCE_MIGRATION_LOGS = 'true';

beforeAll(async () => {
  await initDb();
  try { await runMigrations(); } catch { /* noop */ }
  // Provide broad skips so Forge/Flow apps can import without side-effects
  process.env.SKIP_WEBSOCKET = process.env.SKIP_WEBSOCKET || 'true';
  process.env.SKIP_QUEUE_PROCESSING = process.env.SKIP_QUEUE_PROCESSING || 'true';
  process.env.SKIP_CAROUSEL_THUMBS = process.env.SKIP_CAROUSEL_THUMBS || 'true';
  // Global sharp mock unless explicitly opted out
  if (!(process.env.ENABLE_REAL_SHARP === '1' || process.env.FORCE_REAL_SHARP === '1')) {
    vi.mock('sharp', () => {
      const chain = () => ({
        png(){ return this; }, jpeg(){ return this; }, resize(){ return this; },
        toFile: async () => {}, toBuffer: async () => Buffer.from([0x89]), metadata: async () => ({ width: 0, height: 0 })
      });
      return { default: chain, __esModule: true };
    });
  }
});

afterAll(async () => {
  await closeDb();
});

export default {}; // Vitest globalSetup module expectation