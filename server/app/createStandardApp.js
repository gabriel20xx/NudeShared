import express from 'express';
import path from 'path';
import fs from 'fs';
import { applySharedBase } from './applySharedBase.js';
import { createStandardSessionMiddleware } from '../middleware/sessionFactory.js';
import { buildAuthRouter } from '../api/authRoutes.js';
import { ensureDatabaseReady } from '../db/db.js';

/**
 * createStandardApp
 * Unified baseline Express app factory for NudeAdmin, NudeFlow, NudeForge.
 * Responsibilities:
 *  - etag strong + shared hardening + shared static/theme (applySharedBase)
 *  - json & urlencoded body parsers
 *  - standardized session middleware
 *  - mount /auth routes AFTER session
 *  - configure EJS view engine with optional graceful fallback shim (Flow previously had a custom shim)
 *  - provide helper to run DB init/migrations exactly once via ensureDatabaseReady()
 * Not responsible for: sockets, app‑specific routes, carousel/thumbnail logic, admin layout helper, etc.
 */
export async function createStandardApp(options = {}) {
  const {
    serviceName = 'App',
    projectDir = process.cwd(),
    sharedDir, // explicit NudeShared path (recommended in monorepo)
    sessionOptions = {}, // passed to createStandardSessionMiddleware
    view = {},
    locals = {},
    mountAuth = true, // mount /auth routes (all current apps defer until after session so leave true here)
    additionalMiddleware = [], // array of functions(app)
    ejsFallbackShim = true, // allow fallback when ejs not installed (Flow pattern)
    cachePolicies, // optional object describing caching tiers; when provided we expose /__cache-policy
    cachePolicyNote = ''
  } = options;

  const app = express();
  // Apply shared base WITHOUT auth (we will always mount after session for consistent cookie/session usage)
  applySharedBase(app, { serviceName, projectDir, sharedDir, mountAuth: false, locals, cachePolicies, cachePolicyNote });

  // Body parsers
  app.use(express.json({ limit: process.env.MAX_FILE_SIZE || '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: process.env.MAX_FILE_SIZE || '10mb' }));

  // Session
  app.set('trust proxy', 1);
  const sessionMw = await createStandardSessionMiddleware({ serviceName, ...sessionOptions });
  app.use(sessionMw);

  // Auth after session
  if (mountAuth) {
    app.use('/auth', buildAuthRouter(express.Router));
  }

  // View engine (attempt real EJS, fallback shim if requested & not present)
  const viewPaths = Array.isArray(view.paths) ? view.paths : (view.paths ? [view.paths] : []);
  const resolvedSharedViews = path.resolve(projectDir, '..', 'NudeShared', 'views');
  const finalViewPaths = [...viewPaths, resolvedSharedViews].filter(Boolean);

  let ejsLoaded = false;
  try {
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const ejsMod = req('ejs');
    if (ejsMod && typeof ejsMod.__express === 'function') {
      app.engine('ejs', ejsMod.__express);
      ejsLoaded = true;
    }
  } catch { /* ejs not installed */ }

  if (!ejsLoaded && ejsFallbackShim) {
    const fsPromises = fs.promises;
    app.engine('ejs', async (filePath, options, callback) => {
      try {
        let raw = await fsPromises.readFile(filePath, 'utf8');
        // Minimal substitutions used by Flow fallback previously
        raw = raw.replace(/<%-? *include\([^)]*\) *%>/g, '');
        try {
          raw = raw.replace(/<% *if *\(!isAuthenticated\) *\{ *%>([\s\S]*?)<% *\} *else *\{ *%>([\s\S]*?)<% *\} *%>/, (_m, unauth, auth) => {
            return options && options.isAuthenticated ? auth : unauth;
          });
        } catch { /* ignore conditional rewrite errors */ }
        raw = raw.replace(/<%= *siteTitle *%>/g, options.siteTitle || serviceName);
        raw = raw.replace(/<%[=]?[^%]*%>/g, '');
        callback(null, raw);
      } catch (e) { callback(e); }
    });
  }
  app.set('view engine', 'ejs');
  if (finalViewPaths.length) app.set('views', finalViewPaths);

  // Extra middleware hooks
  for (const fn of additionalMiddleware) {
    if (typeof fn === 'function') fn(app);
  }

  // Health alias already added by hardening inside applySharedBase; do not duplicate.

  return app;
}

/** Convenience wrapper used by app modules to expose createApp() semantics */
export async function createStandardInitializedApp(options) {
  await ensureDatabaseReady({ silentMigrations: true });
  return await createStandardApp(options);
}

export default createStandardApp;
