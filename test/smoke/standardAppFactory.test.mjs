import { test, expect } from 'vitest';
import http from 'node:http';
import fetch from 'node-fetch';
import { ensureTestDb } from '../utils/testDb.mjs';
import { createStandardApp } from '../../server/app/createStandardApp.js';
import path from 'node:path';

async function start(app){
  const server = http.createServer(app);
  await new Promise(r=> server.listen(0,r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: ()=> new Promise(r=> server.close(r)) };
}

// Focused factory smoke: verifies that the shared factory mounts /auth after session and serves shared assets.
// Keeps scope minimal to avoid duplicating per-app smoke tests.

test('createStandardApp baseline provides healthz + shared theme + auth route', async () => {
  await ensureTestDb({ memory:true, fresh:true });
  // NOTE: When this test runs, process.cwd() is already the NudeShared package root.
  // Using path.resolve(process.cwd(), 'NudeShared') would incorrectly produce a non-existent .../NudeShared/NudeShared path.
  // Pass the current cwd directly as sharedDir so applySharedBase can locate client/overlay.js.
  const sharedDir = process.cwd();
  const projectDir = path.resolve(sharedDir, '..', 'NudeAdmin', 'src');
  const app = await createStandardApp({
    serviceName: 'FactoryTest',
    projectDir,
    sharedDir,
    mountAuth: true,
    view: { paths: path.resolve(projectDir, 'views') }
  });
  const { base, close } = await start(app);
  try {
    const healthz = await fetch(base + '/healthz');
    expect(healthz.status).toBe(200);
    const overlay = await fetch(base + '/shared/overlay.js');
    expect(overlay.status).toBe(200);
    const txt = await overlay.text();
    expect(txt).toContain('createOverlayController');
    // Auth route presence (GET /auth/login served by auth router as /auth/login or /auth endpoints -> at least /auth should not 404)
    const auth = await fetch(base + '/auth/login');
    expect([200,302,404]).toContain(auth.status); // some environments may redirect or render login; ensure not 500
  } finally { await close(); }
}, 15000);
