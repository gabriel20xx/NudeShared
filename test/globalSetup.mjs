import { vi } from 'vitest';
import { initDb, closeDb } from '../server/db/db.js';
import { runMigrations } from '../server/db/migrate.js';

// Environment flags (set early)
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SILENCE_MIGRATION_LOGS = 'true';
process.env.SKIP_WEBSOCKET = process.env.SKIP_WEBSOCKET || 'true';
process.env.SKIP_QUEUE_PROCESSING = process.env.SKIP_QUEUE_PROCESSING || 'true';
process.env.SKIP_CAROUSEL_THUMBS = process.env.SKIP_CAROUSEL_THUMBS || 'true';

// Top-level async init (avoid beforeAll hook reliance so setupFiles stays framework-agnostic)
const __nudeSetup = (async () => {
  try { await initDb(); } catch { /* ignore init */ }
  try { await runMigrations(); } catch { /* migrations may already be applied */ }
  if (!(process.env.ENABLE_REAL_SHARP === '1' || process.env.FORCE_REAL_SHARP === '1')) {
    vi.mock('sharp', () => {
      const chain = () => ({
        png(){ return this; }, jpeg(){ return this; }, resize(){ return this; },
        toFile: async () => {}, toBuffer: async () => Buffer.from([0x89]), metadata: async () => ({ width: 0, height: 0 })
      });
      return { default: chain, __esModule: true };
    });
  }
})();

// Ensure closeDb invoked at process exit
process.on('exit', async () => { try { await closeDb(); } catch { /* ignore */ } });

export default __nudeSetup;