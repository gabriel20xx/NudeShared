import { describe, test, expect } from 'vitest';
import http from 'http';
import { app as forgeApp } from '../../../NudeForge/src/app.js';

function listen(app){ return new Promise(res=>{ const s=http.createServer(app); s.listen(0,()=>res(s)); }); }

describe('Forge auth & health', () => {
  test('health + auth/me', async () => {
    const server = await listen(forgeApp);
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const statusHealth = await new Promise(r=>{ http.get(base + '/health', res=>{ r(res.statusCode); res.resume(); }); });
      expect(statusHealth).toBe(200);
      const statusMe = await new Promise(r=>{ http.get(base + '/auth/me', res=>{ r(res.statusCode); res.resume(); }); });
      expect(statusMe).toBe(200);
    } finally { server.close(); }
  });
});
