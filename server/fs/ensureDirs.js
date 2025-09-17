import fs from 'fs';
import Logger from '../logger/serverLogger.js';

/** ensureDirs(dirs: string[]) – idempotently create directories (recursive). */
export function ensureDirs(dirs = []) {
  for (const d of dirs) {
    if (!d) continue;
    try {
      fs.mkdirSync(d, { recursive: true });
    } catch (e) {
      Logger.warn('FS', 'Failed ensuring directory', { dir: d, error: e?.message });
    }
  }
}

export default ensureDirs;
