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

async function post(url, body){
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body||{}) });
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
    const email = `signup_only_${Date.now()}@example.com`;
    const password = 'secret123';
    const r = await post(url + '/auth/signup', { email, password });
    assert.equal(r.status, 200, 'signup 200');
    assert.ok(r.json.user && r.json.user.email === email, 'returns user');
    const setCookie = r.headers.get('set-cookie');
    assert.ok(setCookie, 'sets session cookie');
  } finally {
    srv.close();
    await closeDb();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(()=>{ console.log('auth signup-only test passed'); }).catch((e)=>{ console.error(e); process.exit(1); });
}
