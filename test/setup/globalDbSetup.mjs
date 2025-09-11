// Global DB test harness: initialize a single shared in-memory DB once per Vitest run.
// Provides speed by avoiding per-file DB re-init when isolation not required.
// Opt-in via environment variable VITEST_SHARED_DB=true.
// PowerShell example:
//   $env:VITEST_SHARED_DB='true'; npx vitest
// Bash example:
//   VITEST_SHARED_DB=true npx vitest
import { ensureTestDb } from '../utils/testDb.mjs';

if (process.env.VITEST_SHARED_DB === 'true') {
  const start = Date.now();
  await ensureTestDb({ memory: true, fresh: true });
  // Expose a hook for tests that want to reset tables manually.
  global.__resetTestDb = async function resetTestDb() {
    // Recreate schema quickly by re-running ensureTestDb with fresh flag.
    await ensureTestDb({ memory: true, fresh: true });
  };
  // eslint-disable-next-line no-console
  console.log('[TEST_SHARED_DB] Initialized shared in-memory DB in', Date.now() - start, 'ms');
} else {
  // eslint-disable-next-line no-console
  console.log('[TEST_SHARED_DB] Shared DB disabled (set VITEST_SHARED_DB=true to enable).');
}
