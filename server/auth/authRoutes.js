import crypto from 'crypto';
import { query } from '../db/db.js';
import Logger from '../logger/serverLogger.js';
const MODULE = 'AUTH';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    const check = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch { return false; }
}

function normalizeEmail(email){ return String(email || '').trim().toLowerCase(); }
function validEmail(email) { return /.+@.+\..+/.test(normalizeEmail(email)); }
function validPassword(pw) { return String(pw || '').length >= 6; }
function sanitizeUserRow(row) { return row ? { id: row.id, email: row.email, created_at: row.created_at } : null; }

export function buildAuthRouter(Router, options = {}) {
  const { rateLimit = { windowMs: 60_000, max: 30 } } = options;
  const router = Router();

  const hits = new Map();
  function checkRateLimit(key){
    const now = Date.now();
    const windowMs = rateLimit.windowMs; const max = rateLimit.max;
    const bucket = hits.get(key) || []; const recent = bucket.filter(ts => now - ts < windowMs);
    recent.push(now); hits.set(key, recent); return recent.length <= max;
  }
  function rlMiddleware(req, res, next){
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || 'local';
    const key = `${ip}:${req.path}`; if (!checkRateLimit(key)) return res.status(429).json({ error: 'Too many requests' }); next();
  }

  router.post('/signup', rlMiddleware, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const normalized = normalizeEmail(email);
      if (!validEmail(normalized) || !validPassword(password)) return res.status(400).json({ error: 'Invalid email or password too short (min 6)' });
      const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [normalized]);
      if (existing && existing.length) return res.status(409).json({ error: 'Email already registered' });
      const password_hash = hashPassword(password);
      const { rows } = await query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at', [normalized, password_hash]);
      const user = sanitizeUserRow(rows[0]); req.session.user = user; res.json({ user });
    } catch (e) { Logger.error(MODULE, 'Signup error', e); res.status(500).json({ error: 'Signup failed' }); }
  });

  router.post('/login', rlMiddleware, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const normalized = normalizeEmail(email);
      if (!validEmail(normalized) || !validPassword(password)) return res.status(400).json({ error: 'Invalid credentials' });
      const { rows } = await query('SELECT id, email, password_hash, created_at FROM users WHERE email = $1', [normalized]);
      if (!rows || rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
      const row = rows[0]; if (!verifyPassword(password, row.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
      const user = sanitizeUserRow(row); req.session.user = user; res.json({ user });
    } catch (e) { Logger.error(MODULE, 'Login error', e); res.status(500).json({ error: 'Login failed' }); }
  });

  router.post('/logout', (req, res) => {
    try { req.session.destroy(() => { res.json({ ok: true }); }); }
    catch (e) { Logger.error(MODULE, 'Logout error', e); res.status(500).json({ error: 'Logout failed' }); }
  });

  router.get('/me', (req, res) => { res.json({ user: req.session.user || null }); });

  router.get('/admin/users', async (req, res) => {
    try { const { rows } = await query('SELECT id, email, created_at FROM users ORDER BY id DESC'); res.json({ users: rows || [] }); }
    catch (e) { Logger.error(MODULE, 'Admin users error', e); res.status(500).json({ error: 'Failed' }); }
  });

  const resetTokens = new Map();
  router.post('/reset/request', rlMiddleware, async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email); if (!validEmail(email)) return res.status(400).json({ error: 'Invalid email' });
      const token = crypto.randomUUID(); resetTokens.set(token, email);
      const link = `/auth/reset?token=${encodeURIComponent(token)}`; res.json({ message: `Dev reset link: ${link}` });
    } catch (e) { Logger.error(MODULE, 'Reset request error', e); res.status(500).json({ error: 'Failed' }); }
  });
  router.get('/reset', (req, res) => { const token = String(req.query?.token || ''); return res.render('auth/reset', { token }); });
  router.post('/reset/perform', rlMiddleware, async (req, res) => {
    try {
      const { token, password } = req.body || {}; if (!token || !validPassword(password)) return res.status(400).json({ error: 'Invalid reset' });
      const email = resetTokens.get(String(token)); if (!email) return res.status(400).json({ error: 'Invalid or expired token' });
      const { rows } = await query('SELECT id FROM users WHERE email = $1', [email]); if (!rows || rows.length === 0) return res.status(404).json({ error: 'User not found' });
      const pw = hashPassword(password); await query('UPDATE users SET password_hash=$1 WHERE email=$2', [pw, email]);
      resetTokens.delete(String(token)); res.json({ message: 'Password updated' });
    } catch (e) { Logger.error(MODULE, 'Reset perform error', e); res.status(500).json({ error: 'Failed' }); }
  });

  return router;
}

export default { buildAuthRouter };
