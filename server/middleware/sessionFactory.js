import Logger from '../logger/serverLogger.js';

// Dynamic (optional) imports so consumer apps aren't forced to have pg / connect-pg-simple when not needed.
async function loadExpressSession() {
  try { const mod = await import('express-session'); return mod.default || mod; } catch { return null; }
}
async function loadPgStore(sessionLib) {
  try { const mod = await import('connect-pg-simple'); const ctor = (mod.default || mod); return ctor(sessionLib); } catch { return null; }
}

/**
 * Factory returning a standardized session middleware configured with shared defaults.
 * Goals:
 * - DRY store / cookie selection across Admin, Flow, Forge
 * - Safe when optional deps (express-session, connect-pg-simple, pg) are absent (tests / slim envs)
 * - Consistent cookie attributes (httpOnly, sameSite=lax, 7d maxAge) unless overridden
 * - Per-request secure flag upgrade when request is HTTPS / behind trust proxy
 * - Emits a single WARN line if falling back to in-memory store (non-production best practice)
 *
 * Options:
 *   serviceName   : string (for logging context)
 *   secret        : session secret (required for real session lib; fallback uses dev string)
 *   cookieName    : override default cookie name (default connect.sid or nc_sid when fallback)
 *   domain        : cookie domain (optional)
 *   maxAgeMs      : cookie max age (default 7 days)
 *   enablePgStore : attempt to use Postgres store when DATABASE_URL present (default true)
 *   secureOverride: boolean | undefined – force secure attribute; if undefined dynamic upgrade
 *
 * Returns async function (req,res,next) – ready to app.use()
 */
export async function createStandardSessionMiddleware(opts = {}) {
  const {
    serviceName = 'App',
    secret = process.env.SESSION_SECRET || `dev_${serviceName.toLowerCase()}_secret`,
    cookieName,
    domain,
    maxAgeMs = 7 * 24 * 3600 * 1000,
    enablePgStore = true,
    secureOverride
  } = opts;

  const sessionLib = await loadExpressSession();
  if (!sessionLib) {
    // Lightweight fallback (mirrors NudeFlow ad-hoc implementation) – minimal, good enough for tests.
    const memory = new Map();
    const name = cookieName || 'nc_sid';
    const genId = () => (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) + Date.now().toString(36);
    function parseCookies(header) {
      const out = {}; if (!header) return out;
      header.split(/; */).forEach(kv => { if(!kv) return; const idx = kv.indexOf('='); if(idx===-1) return; const k = kv.slice(0,idx).trim(); const v = decodeURIComponent(kv.slice(idx+1)); out[k]=v; });
      return out;
    }
    let warned = false;
    if (process.env.NODE_ENV !== 'test' && !warned) {
      Logger.warn('SESSION', `${serviceName}: express-session not installed; using in-memory fallback (NOT for production)`);
      warned = true;
    }
    return function fallbackSession(req, res, next){
      try {
        const cookies = parseCookies(req.headers.cookie || '');
        let sid = cookies[name];
        if(!sid || !memory.has(sid)) {
          sid = genId();
          memory.set(sid, { cookie:{ originalMaxAge: maxAgeMs, httpOnly:true, path:'/', secure:false, sameSite:'lax', domain } });
          res.setHeader('Set-Cookie', `${name}=${sid}; Path=/; HttpOnly` + (domain?`; Domain=${domain}`:'') + '; SameSite=Lax');
        }
        const sess = memory.get(sid) || { cookie:{ originalMaxAge: maxAgeMs, httpOnly:true, path:'/', secure:false, sameSite:'lax', domain } };
        memory.set(sid, sess);
        req.session = sess;
        req.session.destroy = (cb)=>{ memory.delete(sid); res.setHeader('Set-Cookie', `${name}=deleted; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`); cb && cb(); };
  } catch { if(!req.session) req.session = {}; }
      next();
    };
  }

  // Real express-session path
  const storeEnabled = enablePgStore && !!process.env.DATABASE_URL;
  let store = null;
  if (storeEnabled) {
    try {
      const PgStore = await loadPgStore(sessionLib);
      if (PgStore) store = new PgStore({ conString: process.env.DATABASE_URL });
    } catch (e) {
      Logger.warn('SESSION', `${serviceName}: Failed to initialize Postgres session store – falling back to memory`, { error: e?.message });
    }
  }

  const middleware = sessionLib({
    store: store || undefined,
    name: cookieName,
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureOverride === true, // if undefined we will upgrade per-request
      domain,
      maxAge: maxAgeMs
    }
  });

  // Wrap to allow dynamic secure upgrade if not explicitly overridden
  return function sessionWithDynamicSecure(req, res, next) {
    middleware(req, res, function afterSession(err){
      if (err) return next(err);
      if (secureOverride === undefined && req.secure && req.session?.cookie) {
        try { req.session.cookie.secure = true; } catch { /* ignore dynamic secure failure */ }
      }
      next();
    });
  };
}

export default createStandardSessionMiddleware;