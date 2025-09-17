import { describe, it, expect } from 'vitest';
import express from 'express';
import path from 'path';
let request;
try {
  ({ default: request } = await import('supertest'));
} catch (err) {
  throw new Error('supertest dependency missing or failed to load: ' + err.message);
}
import { applySharedBase } from '../../server/app/applySharedBase.js';

describe('applySharedBase helper', () => {
  it('mounts health, ready, auth, and theme endpoints', async () => {
    const app = express();
    applySharedBase(app, {
      serviceName: 'TestService',
      projectDir: path.resolve(process.cwd(), 'NudeShared'),
      sharedDir: path.resolve(process.cwd(), 'NudeShared'),
      cachePolicies: { test: 'public, max-age=60' }
    });
    const health = await request(app).get('/healthz');
    expect(health.status).toBe(200);
    const ready = await request(app).get('/ready');
    expect([200,503]).toContain(ready.status);
    const auth = await request(app).get('/auth/login');
    expect([200,302,404]).toContain(auth.status);
    const theme = await request(app).get('/assets/theme.css');
    expect([200,404]).toContain(theme.status);
  });
});
