// Moved from auth/authRoutes.js to api/authRoutes.js for unified routing location
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
function normalizeUsername(name){
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g,'')
    .replace(/_{2,}/g,'_')
    .replace(/-{2,}/g,'-')
    .replace(/^[_-]+|[_-]+$/g,'')
    .slice(0,64);
}
function validEmail(email) { return /.+@.+\..+/.test(normalizeEmail(email)); }
function validPassword(pw) { return String(pw || '').length >= 6; }
function sanitizeUserRow(row) { return row ? { id: row.id, email: row.email, role: row.role || 'user', created_at: row.created_at } : null; }

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

  // Bootstrap-aware signup: if no admin exists, first successful signup becomes admin
  router.post('/signup', rlMiddleware, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      let { username } = req.body || {};
      const normalized = normalizeEmail(email);
      if (!validEmail(normalized) || !validPassword(password)) return res.status(400).json({ error: 'Invalid email or password too short (min 6)' });

      // Check existing email
      const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [normalized]);
      if (existing && existing.length) return res.status(409).json({ error: 'Email already registered' });

      // Username handling (optional); auto-derive from email local part if absent
      if (!username) {
        username = normalized.split('@')[0];
      }
      username = normalizeUsername(username);
      if (username && username.toLowerCase() === 'anonymous') {
        return res.status(400).json({ error: 'Username not allowed' });
      }
      if (username) {
        try {
    const { rows: userExists } = await query('SELECT id FROM users WHERE lower(username)=lower($1)', [username]);
          if (userExists && userExists.length) {
            // Append random suffix
            username = (username + '-' + Math.random().toString(36).slice(2,6)).slice(0,64);
          }
        } catch (e) {
          // Non-fatal legacy bcrypt fallback failure
        }
      }

      // Determine if any admin user exists
      let elevate = false;
      try {
        const { rows: adminCheck } = await query("SELECT 1 FROM users WHERE role IN ('admin','superadmin') LIMIT 1", []);
        elevate = !adminCheck || adminCheck.length === 0; // no admin yet -> elevate
      } catch (e) {
        // If role column missing or query fails, fallback: elevate only when table empty
        try {
          const { rows: anyUser } = await query('SELECT 1 FROM users LIMIT 1', []);
          elevate = !anyUser || anyUser.length === 0;
        } catch (e) {
          // Non-fatal password compare issue
        }
      }

      const password_hash = hashPassword(password);
      let insertSql;
      let params;
      if (elevate) {
        insertSql = username ? 'INSERT INTO users (email, password_hash, role, username) VALUES ($1, $2, $3, $4) RETURNING id, email, role, created_at' : 'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, created_at';
        params = username ? [normalized, password_hash, 'admin', username] : [normalized, password_hash, 'admin'];
      } else {
        insertSql = username ? 'INSERT INTO users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING id, email, role, created_at' : 'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role, created_at';
        params = username ? [normalized, password_hash, username] : [normalized, password_hash];
      }
  const { rows } = await query(insertSql, params);
  const user = sanitizeUserRow(rows[0]);
  // Invalidate any external admin presence caches by emitting a lightweight global hint
  try { process.emit && process.emit('nudeplatform:first-admin-created'); } catch (e) {
    // Emitting event failed (unlikely); continue
  }
      req.session.user = user;
      res.json({ user, elevated: elevate });
    } catch (e) { Logger.error(MODULE, 'Signup error', e); res.status(500).json({ error: 'Signup failed' }); }
  });

  // Endpoint to check if an admin exists (for frontend to decide bootstrap flow)
  router.get('/bootstrap/admin-needed', async (_req, res) => {
    try {
      const { rows: adminCheck } = await query("SELECT 1 FROM users WHERE role IN ('admin','superadmin') LIMIT 1", []);
      const needed = !adminCheck || adminCheck.length === 0;
      res.json({ adminNeeded: needed });
    } catch (e) {
      Logger.error(MODULE, 'Admin-needed check failed', e);
      res.json({ adminNeeded: false });
    }
  });

  router.put('/profile', rlMiddleware, async (req, res) => {
    try {
      const sess = req.session && req.session.user; if (!sess || !sess.id) return res.status(401).json({ error: 'Not authenticated' });
      const { username, email } = req.body || {};
      const updates = []; const params = [];
      if (email !== undefined) {
        const normEmail = normalizeEmail(email);
        if (!validEmail(normEmail)) return res.status(400).json({ error: 'Invalid email' });
        const { rows: exists } = await query('SELECT id FROM users WHERE email = $1 AND id <> $2', [normEmail, sess.id]);
        if (exists && exists.length) return res.status(409).json({ error: 'Email already in use' });
        updates.push('email = $' + (params.push(normEmail)));
      }
      if (username !== undefined) {
        const normUser = normalizeUsername(username);
        if (!normUser) return res.status(400).json({ error: 'Invalid username' });
        const { rows: existsU } = await query('SELECT id FROM users WHERE lower(username) = lower($1) AND id <> $2', [normUser, sess.id]);
        if (existsU && existsU.length) return res.status(409).json({ error: 'Username already in use' });
        updates.push('username = $' + (params.push(normUser)));
      }
      if (!updates.length) return res.json({ ok: true });
      params.push(sess.id);
      await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
  const { rows } = await query('SELECT id, email, role, created_at FROM users WHERE id = $1', [sess.id]);
      req.session.user = sanitizeUserRow(rows[0]);
      res.json({ ok: true });
    } catch (e) { Logger.error(MODULE, 'Profile update error', e); res.status(500).json({ error: 'Failed to update profile' }); }
  });

  router.post('/login', rlMiddleware, async (req, res) => {
    try {
      const { email: identifier, password } = req.body || {};
      const raw = String(identifier || '').trim();

      let row;
      if (raw.includes('@')) {
        const normalized = normalizeEmail(raw);
        if (validEmail(normalized)) {
          try {
            const { rows } = await query('SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1', [normalized]);
            if (rows && rows.length) row = rows[0];
          } catch (e) {
            // Optional audit emit failure
          }
        }
      } else {
        // Attempt username lookup using raw (case-insensitive) then fallback to normalized sanitized form
        try {
          const { rows } = await query('SELECT id, email, password_hash, role, created_at FROM users WHERE lower(username)=lower($1)', [raw]);
          if (rows && rows.length) row = rows[0];
        } catch (e) {
          // Session save race; ignore
        }
        if (!row) {
          const uname = normalizeUsername(raw);
          if (uname) {
            try {
              const { rows } = await query('SELECT id, email, password_hash, role, created_at FROM users WHERE lower(username)=lower($1)', [uname]);
              if (rows && rows.length) row = rows[0];
            } catch (e) {
              // Logout emit failure ignored
            }
          }
        }
      }
      // Only enforce password length AFTER locating a user, to permit legacy shorter passwords if they exist
      if (!row) return res.status(401).json({ error: 'Invalid credentials' });
      if (!password || (String(password).length < 6 && !verifyPassword(password, row.password_hash))) {
        // Short password that doesn't match stored hash OR empty
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      if (!verifyPassword(password, row.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  const user = sanitizeUserRow(row);
  req.session.user = user;
  try { await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]); } catch (e) { /* last_login update non-critical */ }
      res.json({ user });
    } catch (e) { Logger.error(MODULE, 'Login error', e); res.status(500).json({ error: 'Login failed' }); }
  });

  router.post('/logout', (req, res) => {
    try { req.session.destroy(() => { res.json({ ok: true }); }); }
    catch (e) { Logger.error(MODULE, 'Logout error', e); res.status(500).json({ error: 'Logout failed' }); }
  });

  router.get('/me', (req, res) => { res.json({ user: req.session.user || null }); });

  // Simple admin user dump (legacy; consider remove if superseded by dedicated admin routers)
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