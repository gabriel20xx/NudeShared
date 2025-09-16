// Shared app hardening + standard endpoints helper
// Non-breaking: adds security headers, basic request logging (dev), no-cache for dynamic JSON,
// and standardized /healthz + /ready endpoints if not already defined.
import Logger from '../logger/serverLogger.js';
import { query, getDriver } from '../db/db.js';
import { runMigrations } from '../db/migrate.js';

/**
 * Perform a lightweight readiness probe.
 * Responsibilities:
 * 1. Ensure the database layer responds to a trivial SELECT.
 * 2. Heuristically detect whether core tables ("users") exist.
 * 3. If tables appear absent attempt an idempotent migration run (best‑effort – failures reported but not thrown).
 *
 * NEVER throw – always resolve with an object describing state to keep /ready endpoint resilient.
 *
 * @returns {Promise<{ok:boolean, reason?:string, error?:string}>}
 */
export async function defaultReadinessCheck() {
  try {
    // If driver not initialized, initDb() will be lazily invoked by first query() call; rely on that side-effect.
    const { rows } = await query('SELECT 1 as ok');
    if (!rows || !rows.length) return { ok: false, reason: 'NO_ROWS' };
    // Heuristic: attempt to detect absence of a core table and trigger migrations
    // NOTE: We purposefully swallow errors here to avoid crashing readiness probe.
    const driver = getDriver();
    let needMigrate = false;
    try {
      if (driver === 'pg') {
        // Look for existence of a canonical table: users
        const { rows: u } = await query("SELECT 1 FROM information_schema.tables WHERE table_name='users' LIMIT 1");
        if (!u.length) needMigrate = true;
      } else if (driver === 'sqlite') {
        const { rows: u } = await query("SELECT name FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1");
        if (!u.length) needMigrate = true;
      }
    } catch {
      // If metadata lookup fails mark migrate attempt
      needMigrate = true;
    }
    if (needMigrate) {
      try { await runMigrations(); } catch { return { ok:false, reason:'MIGRATE_FAIL' }; }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'DB_ERROR', error: e?.message };
  }
}

/**
 * Apply a standard set of hardening & observability behaviors to an Express app.
 * Idempotent: re‑invocation after first call is a no‑op.
 *
 * Features:
 * - Minimal security headers (frame, sniff, referrer, dns-prefetch)
 * - Optional request logging (off in production by default)
 * - Standard /healthz (liveness) + /health legacy redirect + /ready (readiness with DB heuristic)
 * - trust proxy = 1 (configurable)
 *
 * @param {import('express').Express} app The express application instance.
 * @param {Object} [opts]
 * @param {string} [opts.serviceName='App'] Label used in structured logs & JSON responses.
 * @param {boolean} [opts.enableRequestLog=process.env.NODE_ENV!=='production'] Toggle basic request logging.
 * @param {boolean} [opts.addHealth=true] Whether to register /healthz, /health redirect & /ready.
 * @param {Function} [opts.readinessCheck=defaultReadinessCheck] Custom readiness probe returning { ok:boolean }.
 * @param {boolean} [opts.trustProxy=true] Whether to set 'trust proxy'.
 */
export function applyStandardAppHardening(app, opts={}) {
  const {
    serviceName = 'App',
    enableRequestLog = process.env.NODE_ENV !== 'production',
    addHealth = true,
    readinessCheck = defaultReadinessCheck,
    trustProxy = true
  } = opts;

  if (trustProxy) app.set('trust proxy', 1);

  // Idempotent guard: mark app so we don't double wrap
  if (app.__standardHardeningApplied) return;
  app.__standardHardeningApplied = true;

  // Minimal security headers (helmet replacement lite to avoid adding dependency here)
  app.use((req,res,next)=>{
    res.setHeader('X-Frame-Options','SAMEORIGIN');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-DNS-Prefetch-Control','off');
    next();
  });

  if (enableRequestLog) {
    app.use((req,res,next)=>{
      const start = Date.now();
      res.on('finish', ()=>{
        Logger.info('REQ', `${serviceName} ${req.method} ${req.originalUrl}`, { status: res.statusCode, ms: Date.now()-start });
      });
      next();
    });
  }

  // Add health + ready endpoints if not present
  if (addHealth) {
    if (!app._router?.stack.some(r=> r.route?.path === '/healthz')) {
      app.get('/healthz', (req,res)=> res.json({ ok:true, service: serviceName, ts: new Date().toISOString() }));
    }
    // Provide legacy /health alias if an app already defined it, leave it; else create alias to /healthz for consistency
    const hasHealth = app._router?.stack.some(r=> r.route?.path === '/health');
    if (!hasHealth) {
      app.get('/health', (req,res)=> res.redirect(302, '/healthz'));
    }
    if (!app._router?.stack.some(r=> r.route?.path === '/ready')) {
      app.get('/ready', async (req,res)=>{
        try {
          const r = await readinessCheck();
          if (!r || r.ok === false) return res.status(503).json({ ok:false, service: serviceName });
          res.json({ ok:true, service: serviceName });
        } catch {
          res.status(503).json({ ok:false, service: serviceName, error: 'INIT' });
        }
      });
    }
  }
}

/**
 * Append standard 404 + error handlers (should be mounted last).
 * 404: JSON if accepted else plain text.
 * 500: Structured JSON with optional stack when NODE_ENV=development.
 *
 * @param {import('express').Express} app
 * @param {Object} [opts]
 * @param {string} [opts.serviceName='App'] Service label for responses.
 * @param {boolean} [opts.exposeStack=process.env.NODE_ENV==='development'] Include stack traces in JSON output.
 */
export function attachStandardNotFoundAndErrorHandlers(app, opts={}) {
  const { serviceName='App', exposeStack = process.env.NODE_ENV === 'development' } = opts;
  // 404
  app.use((req,res,next)=>{
    if (res.headersSent) return next();
    if (req.accepts('json')) return res.status(404).json({ ok:false, error:'NOT_FOUND', service: serviceName });
    res.status(404).type('txt').send('Not Found');
  });
  // Error handler
  app.use((err,req,res,_next)=>{
    Logger.error('ERROR', `${serviceName} unhandled`, { url:req.originalUrl, method:req.method, error: err?.message });
    if (res.headersSent) return; 
    if (req.accepts('json')) {
      return res.status(500).json({ ok:false, error:'SERVER_ERROR', service: serviceName, ...(exposeStack?{ stack:err?.stack }: {}) });
    }
    res.status(500).type('txt').send('Server Error');
  });
}
