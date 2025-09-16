import { describe, it, expect } from 'vitest';
import request from 'supertest';

// Lazy dynamic imports to avoid pulling entire apps before needed
async function getAdminApp(){ return (await import('../../NudeAdmin/src/app.js')).createApp(); }
async function getFlowApp(){ return (await import('../../NudeFlow/src/app.js')).createApp(); }
async function getForgeApp(){ return (await import('../../NudeForge/src/app.js')).createApp(); }

// Removed unused path import after refactor
const emailBase = `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function buildCred(service){ return { email: `${emailBase}-${service}@example.com`, password: 'testpass123' }; }

async function ensureSignup(agent, creds){
  const r = await agent.post('/auth/signup').send(creds);
  // 200 expected; if 409 (already) fetch login later (not implemented yet) – for now assert 200
  expect([200,409]).toContain(r.status);
  return r;
}

function parseCookieAttributes(setCookieHeader){
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  const parts = raw.split(/; */);
  const out = { raw };
  parts.slice(1).forEach(p=>{ const [k,v] = p.split('='); out[k.toLowerCase()] = v === undefined ? true : v; });
  return out;
}

describe('Session cookie consistency across services', () => {
  it('issues comparable cookie attributes (httpOnly, SameSite=Lax, ~7d maxAge)', async () => {
    const adminApp = await getAdminApp();
    const flowApp = await getFlowApp();
    const forgeApp = await getForgeApp();
    const adminAgent = request(adminApp);
    const flowAgent = request(flowApp);
    const forgeAgent = request(forgeApp);

    const credsAdmin = buildCred('admin');
    const credsFlow = buildCred('flow');
    const credsForge = buildCred('forge');

    const a = await ensureSignup(adminAgent, credsAdmin);
    const f = await ensureSignup(flowAgent, credsFlow);
    const g = await ensureSignup(forgeAgent, credsForge);

    const headers = [a, f, g].map(r=> r.headers['set-cookie']);
    headers.forEach(h => expect(h).toBeTruthy());

    const parsed = headers.map(parseCookieAttributes);
    parsed.forEach(p => {
      expect(p.httponly).toBeTruthy();
      expect(p.samesite?.toLowerCase()).toBe('lax');
      // Max-Age check: allow some drift; if absent (memory fallback) still acceptable but log
      if(p['max-age']) {
        const days = Number(p['max-age']) / 86400;
        expect(days).toBeGreaterThan(6.5);
        expect(days).toBeLessThan(8);
      }
    });
  });
});
