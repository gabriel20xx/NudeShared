import fs from 'fs';
import path from 'path';
import express from 'express';

/**
 * Mount /shared static asset directories with consistent caching policies.
 * Replaces duplicated logic across NudeForge, NudeFlow, NudeAdmin.
 *
 * Caching tiers:
 *  - CSS/JS: public, max-age=3600
 *  - Images: public, max-age=86400, stale-while-revalidate=604800
 *
 * @param {import('express').Express} app
 * @param {Object} opts
 * @param {string[]} [opts.candidates] Ordered list of directory candidates to mount.
 * @param {Object} [opts.logger] Logger with info/warn methods.
 * @returns {string|undefined} first existing mounted directory
 */
export function mountSharedStatic(app, opts = {}) {
  const {
    candidates = [],
    logger = console
  } = opts;

  const sharedStaticOptions = {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (/\.(css|js)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      }
    }
  };

  let firstFound;
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) {
        if (!firstFound) firstFound = candidate;
      }
    } catch { /* ignore */ }
    // Always register to preserve fallback chain semantics used previously
    app.use('/shared', express.static(candidate, sharedStaticOptions));
  }
  if (firstFound) {
    logger.info?.('SHARED_STATIC', `Mounted /shared assets (first existing: ${firstFound})`);
  } else {
    logger.warn?.('SHARED_STATIC', 'No shared asset directory found; /shared fallbacks registered anyway');
  }
  return firstFound;
}

/** Helper to build default candidate list relative to a service directory */
export function defaultSharedCandidates(serviceDir) {
  return [
    process.env.NUDESHARED_DIR,
    '/app/NudeShared',
    path.resolve(serviceDir, '..', '..', 'NudeShared'),
    path.resolve(serviceDir, '..', '..', 'shared')
  ].filter(Boolean);
}
