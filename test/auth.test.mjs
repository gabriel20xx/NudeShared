import assert from 'assert';
import express from 'express';
import session from 'express-session';
import fetch from 'node-fetch';
import http from 'http';
import { fileURLToPath } from 'url';
import { initDb, closeDb, query } from '../server/db/db.js';
import { runMigrations } from '../server/db/migrate.js';
import { buildAuthRouter } from '../server/auth/authRoutes.js';

function startServer(app){
  return new Promise((resolve)=>{
    const srv = http.createServer(app);
    srv.listen(0, ()=>{
      const { port } = srv.address();
      resolve({ srv, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function post(url, body, cookie){
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie?{cookie}: {}) }, body: JSON.stringify(body||{}) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { text }; }
  return { status: res.status, json, headers: res.headers };
}
async function get(url, cookie){
  const res = await fetch(url, { headers: { ...(cookie?{cookie}: {}) } });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { text }; }
  return { status: res.status, json, headers: res.headers };
}

export async function run(){
  delete process.env.DATABASE_URL; delete process.env.PGHOST; delete process.env.PGDATABASE;
  process.env.SQLITE_PATH = ':memory:';
  await initDb(); await runMigrations();

  const app = express();
  app.use(express.json());
  app.set('trust proxy', 1);
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use('/auth', buildAuthRouter(express.Router));

  const { srv, url } = await startServer(app);
  try {
    const signup = await post(url + '/auth/signup', { email: 'alice@example.com', password: 'secret123' });
    assert.equal(signup.status, 200, 'signup 200');
    assert.ok(signup.json.user?.email === 'alice@example.com');
  const setCookie = signup.headers.get('set-cookie');
    assert.ok(setCookie, 'has set-cookie');
    const cookie = setCookie.split(';')[0];

  // Verify password is stored hashed (salt:hash) and not plaintext
  const { rows } = await query('SELECT password_hash FROM users WHERE email = $1', ['alice@example.com']);
  assert.ok(rows && rows[0] && typeof rows[0].password_hash === 'string');
  assert.notStrictEqual(rows[0].password_hash, 'secret123', 'password not stored in plaintext');
  assert.match(rows[0].password_hash, /^[0-9a-f]+:[0-9a-f]+$/i, 'password stored as salt:hash hex');

    const me = await get(url + '/auth/me', cookie);
    assert.equal(me.status, 200); assert.ok(me.json.user?.email === 'alice@example.com');

    const logout = await post(url + '/auth/logout', {}, cookie);
    assert.equal(logout.status, 200); assert.ok(logout.json.ok);

    const me2 = await get(url + '/auth/me', cookie);
    assert.equal(me2.status, 200); assert.equal(me2.json.user, null);
  } finally {
    srv.close();
    await closeDb();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(()=>{ console.log('auth test passed'); }).catch((e)=>{ console.error(e); process.exit(1); });
}
