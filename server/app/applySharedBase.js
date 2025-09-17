import express from 'express';
import path from 'path';
import fs from 'fs';
import { applyStandardAppHardening, attachStandardNotFoundAndErrorHandlers } from '../middleware/hardening.js';
import { mountSharedStatic, defaultSharedCandidates } from '../http/sharedStatic.js';
import { mountTheme } from '../theme/mountTheme.js';
import { buildAuthRouter } from '../api/authRoutes.js';
import { registerCachePolicyEndpoint } from '../http/cachePolicyEndpoint.js';

/**
 * Shared base setup for service apps (reduces duplicated boilerplate across Admin/Flow/Forge).
 * Caller remains responsible for sessions, view engine, HTTPS/server, sockets, domain routes.
 */
export function applySharedBase(app, opts = {}) {
  if (app.__sharedBaseApplied) return app;
  const {
    serviceName = 'App',
    projectDir = process.cwd(),
    sharedDir,
    mountAuth = true,
    locals,
    cachePolicies,
    cachePolicyNote = '',
    logger = console,
    attachErrorHandlers = false
  } = opts;

  try { app.set('etag', 'strong'); } catch { /* ignore etag init errors */ }
  applyStandardAppHardening(app, { serviceName });

  const candidates = sharedDir ? [sharedDir, ...defaultSharedCandidates(projectDir)] : defaultSharedCandidates(projectDir);
  mountSharedStatic(app, { candidates, logger });
  mountTheme(app, { projectDir, sharedDir, logger });

  // Ensure /shared/overlay.js is always available (tests & Flow home overlay rely on it)
  if (sharedDir) {
    try {
      const overlayPath = path.resolve(sharedDir, 'client', 'overlay.js');
      if (fs.existsSync(overlayPath)) {
        app.get('/shared/overlay.js', (req, res, next) => {
          fs.access(overlayPath, fs.constants.R_OK, (err) => {
            if (err) return next();
            res.type('application/javascript');
            res.sendFile(overlayPath);
          });
        });
      }
    } catch { /* ignore overlay route issues */ }
  }

  if (mountAuth) {
    app.use('/auth', buildAuthRouter(express.Router));
  }

  if (typeof locals === 'function') {
    app.use(locals);
  } else if (locals && typeof locals === 'object') {
    app.use((req, res, next) => {
      for (const [k,v] of Object.entries(locals)) {
        res.locals[k] = typeof v === 'function' ? v(req,res) : v;
      }
      next();
    });
  }

  if (cachePolicies) {
    registerCachePolicyEndpoint(app, {
      service: serviceName,
      getPolicies: () => cachePolicies,
      note: cachePolicyNote
    });
  }

  if (attachErrorHandlers) {
    attachStandardNotFoundAndErrorHandlers(app, { serviceName });
  }

  app.__sharedBaseApplied = true;
  return app;
}

export default applySharedBase;
