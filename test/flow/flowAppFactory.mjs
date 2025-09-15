// Factory to build a NudeFlow app instance for tests.
// Provides an optional auth flag (currently unused; placeholder for future auth seeding if needed).
import defaultFlowFactory, { createApp as createFlowApp } from '../../../NudeFlow/src/app.js';

export async function buildFlowApp(opts = {}) {
  // TODO: could seed users or sessions based on opts.auth in future.
  return await createFlowApp();
}
export default { buildFlowApp };
