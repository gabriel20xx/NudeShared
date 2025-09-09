import assert from 'assert';
import express from 'express';
import session from 'express-session';
import http from 'http';
import fetch from 'node-fetch';
import { initDb, closeDb } from '../server/db/db.js';
import { runMigrations } from '../server/db/migrate.js';
import { buildAuthRouter } from '../server/api/authRoutes.js';

function startServer(app){
  return new Promise((resolve)=>{
    const srv = http.createServer(app);
    srv.listen(0, ()=>{ const { port } = srv.address(); resolve({ srv, url: `http://127.0.0.1:${port}` }); });
  });
}

async function post(url, body, cookie){
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie?{cookie}: {}) }, body: JSON.stringify(body||{}) });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = { text }; }
  return { status: res.status, json, headers: res.headers };
}
async function get(url, cookie){
  const res = await fetch(url, { headers: { ...(cookie?{cookie}: {}) } });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = { text }; }
  return { status: res.status, json, headers: res.headers };
}

export async function run(){
  delete process.env.DATABASE_URL; delete process.env.PGHOST; delete process.env.PGDATABASE;
  process.env.SQLITE_PATH = ':memory:';
  await initDb(); await runMigrations();

  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use('/auth', buildAuthRouter(express.Router));

  const { srv, url } = await startServer(app);
  try {
    const email = `user_${Date.now()}@example.com`;
    const password = 'secret123';
    // Signup creates session
    const signup = await post(url + '/auth/signup', { email, password });
    assert.equal(signup.status, 200, 'signup 200');
    const cookie = signup.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie, 'signup sets cookie');

    // Logout clears session
    const logout = await post(url + '/auth/logout', {}, cookie);
    assert.equal(logout.status, 200, 'logout 200');

    // Login by email
    const login = await post(url + '/auth/login', { email, password });
    assert.equal(login.status, 200, 'login 200');
    const cookie2 = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie2, 'login sets cookie');

    // /auth/me returns user when logged in
    const me = await get(url + '/auth/me', cookie2);
    assert.equal(me.status, 200, 'me 200');
    assert.ok(me.json.user && me.json.user.email === email, 'me returns user after login');
  } finally {
    srv.close();
    await closeDb();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(()=>{ console.log('auth login/logout test passed'); }).catch((e)=>{ console.error(e); process.exit(1); });
}
