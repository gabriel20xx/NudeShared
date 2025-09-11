import { ensureTestDb } from './testDb.mjs';

// Helper for tests needing a fresh in-memory isolated DB each file.
export async function useIsolatedDb(){
  await ensureTestDb({ memory: true, fresh: true });
}

export default { useIsolatedDb };