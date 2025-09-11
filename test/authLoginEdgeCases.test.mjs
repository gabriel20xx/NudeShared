import { test, expect } from 'vitest';
import express from 'express';
import session from 'express-session';
import http from 'http';
import { ensureTestDb } from './utils/testDb.mjs';
import { query } from '../server/db/db.js';
import { buildAuthRouter } from '../server/api/authRoutes.js';

function start(app){
  return new Promise(resolve=>{ const srv = http.createServer(app); srv.listen(0,()=>{const {port}=srv.address(); resolve({srv,url:`http://127.0.0.1:${port}`});});});
}
async function post(url, body, cookie){
  const res = await fetch(url,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}: {})},body:JSON.stringify(body||{})});
  const text = await res.text(); let json; try{ json = JSON.parse(text);}catch{ json={ text }; }
  return { status: res.status, json, headers: res.headers };
}

// Hash helper replicating server function (must match implementation)
import crypto from 'crypto';
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')){ const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex'); return `${salt}:${hash}`; }

// Edge cases: mixed-case username login & legacy short password (<6 chars) still accepted if hash matches

test('login accepts mixed-case username and legacy short password hash', async () => {
  await ensureTestDb({ memory: true, fresh: true });
  const app = express();
  app.use(express.json());
  app.use(session({ secret:'test', resave:false, saveUninitialized:false }));
  app.use('/auth', buildAuthRouter(express.Router));
  const { srv, url } = await start(app);
  try {
    // Create user manually with short password 'short' (5 chars) and MixedCase username
    const pwHash = hashPassword('short');
    await query("INSERT INTO users (email, password_hash, role, username) VALUES ($1,$2,$3,$4)", ['legacy@example.com', pwHash, 'user', 'MixedCaseUser']);

    // Login using mixed case variant EXACT
    const login1 = await post(url + '/auth/login', { email: 'MixedCaseUser', password: 'short' });
    expect(login1.status).toBe(200);
    expect(login1.json.user.email).toBe('legacy@example.com');

    // Login using different case variant
    const login2 = await post(url + '/auth/login', { email: 'mixedcaseuser', password: 'short' });
    expect(login2.status).toBe(200);

    // Login via email still works
    const login3 = await post(url + '/auth/login', { email: 'LEGACY@EXAMPLE.COM', password: 'short' });
    expect(login3.status).toBe(200);
  } finally { srv.close(); }
}, 20000);
