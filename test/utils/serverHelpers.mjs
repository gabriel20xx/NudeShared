// Ephemeral server helpers for tests.
import http from 'http';
import { sessionUser, sessionAdmin } from './sessionFactory.mjs';

/**
 * Given an Express app instance (or a factory returning one / Promise), start
 * a server on an ephemeral port and return { server, url, port }. Caller must close.
 */
export async function startEphemeral(appOrFactory){
  // Express apps are callable (function), but expose .use/.listen. Distinguish factory
  // (returns app when invoked) from already-instantiated app by inspecting typical props.
  let appCandidate = appOrFactory;
  if (typeof appOrFactory === 'function' && !(appOrFactory?.use && appOrFactory?.listen)) {
    appCandidate = await appOrFactory();
  }
  const app = appCandidate;
  return new Promise(resolve => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}`, port });
    });
  });
}

/** Convenience utility to run a callback with a started server and auto-close. */
export async function withEphemeral(appFactory, fn){
  const { server, url, port } = await startEphemeral(appFactory);
  try { return await fn({ server, url, port }); }
  finally { server.close(); }
}

/**
 * Start an ephemeral server and immediately create an authenticated session.
 * opts: { role: 'user'|'admin', app }
 * Returns { server, url, port, cookie, email, userId }
 */
export async function createAuthenticatedServer({ app, role = 'user' }){
  const started = await startEphemeral(app);
  try {
    const session = role === 'admin' ? await sessionAdmin(started.url) : await sessionUser(started.url);
    return { ...started, ...session };
  } catch (e) {
    started.server.close();
    throw e;
  }
}

export default { startEphemeral, withEphemeral, createAuthenticatedServer };
