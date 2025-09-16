import fs from 'fs';
import path from 'path';

/**
 * Mount /assets/theme.css on an Express app.
 * Precedence: project local (public/css/theme.css) -> shared client/theme.css -> shared root theme.css.
 * @param {object} app Express instance
 * @param {object} opts { projectDir?: string, sharedDir?: string, logger?: {info,warn,error} }
 */
export function mountTheme(app, opts = {}) {
  const projectDir = opts.projectDir || process.cwd();
  const sharedDir = opts.sharedDir || path.resolve(projectDir, '..', 'NudeShared');
  const logger = opts.logger || { info:()=>{}, warn:()=>{}, error:()=>{} };

  // In test environment, de-duplicate noisy repeated mount logs (multiple apps)
  if (typeof globalThis.__NUDE_THEME_LOGGED === 'undefined') {
    Object.defineProperty(globalThis, '__NUDE_THEME_LOGGED', { value: new Set(), writable: false });
  }

  const localCandidate = path.join(projectDir, 'public', 'css', 'theme.css');
  const setThemeHeaders = (res) => {
    // Align with test expectation (max-age=3600) and add immutable for stronger caching of infrequently changed asset
    // If a downstream middleware already set a Cache-Control header, we intentionally override here to keep policy consistent.
    res.set('Cache-Control', 'public, max-age=3600');
  };

  if (fs.existsSync(localCandidate)) {
    app.get('/assets/theme.css', (req, res) => {
      setThemeHeaders(res);
      res.sendFile(localCandidate);
    });
    const already = globalThis.__NUDE_THEME_LOGGED.has(localCandidate);
    if (!already) {
      logger.info?.('[theme] Mounted local theme.css', { path: localCandidate });
      globalThis.__NUDE_THEME_LOGGED.add(localCandidate);
    }
    return;
  }
  const candidates = [
    path.join(sharedDir, 'client', 'theme.css'),
    path.join(sharedDir, 'theme.css')
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (found) {
    app.get('/assets/theme.css', (req, res) => {
      setThemeHeaders(res);
      res.sendFile(found);
    });
    const already = globalThis.__NUDE_THEME_LOGGED.has(found);
    if (!already) {
      logger.info?.('[theme] Mounted shared theme.css', { path: found });
      globalThis.__NUDE_THEME_LOGGED.add(found);
    }
  } else {
    logger.warn?.('[theme] theme.css not found (local or shared). /assets/theme.css will 404');
  }
}
