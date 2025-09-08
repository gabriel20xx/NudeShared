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

  const localCandidate = path.join(projectDir, 'public', 'css', 'theme.css');
  if (fs.existsSync(localCandidate)) {
    app.get('/assets/theme.css', (req, res) => res.sendFile(localCandidate));
    logger.info?.('[theme] Mounted local theme.css', { path: localCandidate });
    return;
  }
  const candidates = [
    path.join(sharedDir, 'client', 'theme.css'),
    path.join(sharedDir, 'theme.css')
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (found) {
    app.get('/assets/theme.css', (req, res) => res.sendFile(found));
    logger.info?.('[theme] Mounted shared theme.css', { path: found });
  } else {
    logger.warn?.('[theme] theme.css not found (local or shared). /assets/theme.css will 404');
  }
}
