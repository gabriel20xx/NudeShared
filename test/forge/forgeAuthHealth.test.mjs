import { describe, test, expect } from 'vitest';
import http from 'http';
import { app as forgeApp } from '../../../NudeForge/src/app.js';

function listen(app){ return new Promise(res=>{ const s=http.createServer(app); s.listen(0,()=>res(s)); }); }

describe('Forge auth & health', () => {
  test('health redirect + auth/me', async () => {
    const server = await listen(forgeApp);
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const healthMeta = await new Promise(r=>{ http.get(base + '/health', res=>{ const out={ status: res.statusCode, location: res.headers.location }; res.resume(); r(out); }); });
      expect([200,302]).toContain(healthMeta.status);
      if (healthMeta.status === 302) {
        expect(healthMeta.location).toBe('/healthz');
        const statusHealthz = await new Promise(r2=>{ http.get(base + '/healthz', res=>{ r2(res.statusCode); res.resume(); }); });
        expect(statusHealthz).toBe(200);
      }
      const statusMe = await new Promise(r=>{ http.get(base + '/auth/me', res=>{ r(res.statusCode); res.resume(); }); });
      expect(statusMe).toBe(200);
    } finally { server.close(); }
  });
});
