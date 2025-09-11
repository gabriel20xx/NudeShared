// Test auth/session factory utilities
import fetch from 'node-fetch';
import { query } from '../../server/db/db.js';

async function jsonFetch(url, method, body, cookie){
  const res = await fetch(url, { method, headers: { 'Content-Type':'application/json', ...(cookie?{cookie}: {}) }, body: body?JSON.stringify(body):undefined });
  const text = await res.text(); let data; try{ data=JSON.parse(text);}catch{ data={ raw:text }; }
  return { res, data };
}

export async function createUser(baseUrl, { email='user'+Date.now()+'@example.com', password='secret123', username } = {}){
  const signup = await jsonFetch(baseUrl + '/auth/signup', 'POST', { email, password, username });
  if (signup.res.status === 409) {
    const login = await jsonFetch(baseUrl + '/auth/login', 'POST', { email, password });
    return { ...extractSession(login, email), password };
  }
  return { ...extractSession(signup, email), password };
}

export async function createAdminUser(baseUrl, opts={}){
  const out = await createUser(baseUrl, opts);
  try { await query('UPDATE users SET role = $1 WHERE email = $2', ['admin', out.email]); } catch {}
  // Re-login to refresh session with updated role
  const relog = await jsonFetch(baseUrl + '/auth/login', 'POST', { email: out.email, password: out.password });
  const refreshed = extractSession(relog, out.email);
  return { ...refreshed, password: out.password };
}

function extractSession(result, email){
  const setCookie = result.res.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : '';
  return { email, cookie, status: result.res.status, body: result.data };
}

export default { createUser, createAdminUser };
