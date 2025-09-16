// Helper to reuse initialized app/server instances for read-only tests to reduce startup overhead.
// Usage (within a test):
//   import { getTestApp } from '../util/serverReuse.js';
//   const { app } = await getTestApp('flow');
// Avoid for tests that mutate global middleware state or require isolation.
/* eslint-env node */
/* global process */
import { startEphemeral } from '../helpers/testServer.js';

const cache = new Map(); // key -> { app, server }

export async function getTestApp(kind = 'flow') {
  if (cache.has(kind)) return cache.get(kind);
  const started = await startEphemeral(kind);
  cache.set(kind, started);
  return started;
}

export async function closeAllTestApps() {
  for (const { server } of cache.values()) {
    try { await new Promise(r => server.close(r)); } catch { /* ignore */ }
  }
  cache.clear();
}

// Optionally auto-clean on process exit (best-effort)
if (typeof process !== 'undefined' && process.on) {
  process.on('exit', () => {
    for (const { server } of cache.values()) {
      try { server.close(); } catch { /* noop */ }
    }
  });
}
