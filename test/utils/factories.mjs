// Shared factories (moved from app-specific test folders)
import { apiJson } from './httpClient.mjs';
import { query } from '../../server/db/db.js';

function uniqueEmail(prefix='user') { return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2,8)}@example.com`; }

export async function createUser(base, { email = uniqueEmail(), password = 'secret123', role } = {}) {
  const { res: signupRes } = await apiJson('POST', base, '/auth/signup', { email, password });
  if (signupRes.statusCode !== 200) throw new Error('Signup failed: ' + signupRes.statusCode + ' body=' + signupRes.body);
  let cookie = signupRes.headers['set-cookie']?.[0]?.split(';')[0];
  if (!cookie) throw new Error('No session cookie returned on signup');
  if (role) {
    await query('UPDATE users SET role = ? WHERE email = ?', [role, email]);
    const { res: loginRes } = await apiJson('POST', base, '/auth/login', { email, password }, cookie);
    if (loginRes.statusCode !== 200) throw new Error('Relogin failed after promotion');
    cookie = loginRes.headers['set-cookie']?.[0]?.split(';')[0] || cookie;
  }
  const { json: meJson } = await apiJson('GET', base, '/auth/me', null, cookie);
  const user = meJson?.user || null;
  return { cookie, email, user };
}

export async function createAdmin(base, opts={}) { return createUser(base, { ...opts, role: opts.role || 'admin' }); }
export async function elevateToSuperAdmin(base, cookie, userId) { await query('UPDATE users SET role = ? WHERE id = ?', ['superadmin', userId]); return userId; }
export function randomString(len=8){ return Math.random().toString(36).slice(2, 2+len); }

export default { createUser, createAdmin, elevateToSuperAdmin, randomString };
