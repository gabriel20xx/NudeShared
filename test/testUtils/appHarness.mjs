// Temporary compatibility harness re-exporting existing utilities.
// NOTE: Preferred imports should target ../utils/testDb.mjs and ../utils/serverHelpers.mjs directly.
// New tests should avoid this indirection; kept only so recently added tests referencing
// ../testUtils/appHarness.mjs continue to work without further churn.

import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral, createAuthenticatedServer } from '../utils/serverHelpers.mjs';

export { ensureTestDb, startEphemeral, createAuthenticatedServer };
export default { ensureTestDb, startEphemeral, createAuthenticatedServer };
