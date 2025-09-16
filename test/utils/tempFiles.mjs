// Utility for tracking and cleaning up temporary test artifacts.
// Usage:
//   import { trackTempFile, trackTempDir, cleanupTracked } from '../utils/tempFiles.mjs';
//   const file = trackTempFile(tmpPath);
//   try { ... test logic ... }
//   finally { await cleanupTracked(); }
// This ensures per-test cleanup even when running a single file.

import fs from 'fs';
import path from 'path';

const trackedFiles = new Set();
const trackedDirs = new Set();

export function trackTempFile(p){
  if (p) trackedFiles.add(p);
  return p;
}

export function trackTempDir(p){
  if (p) trackedDirs.add(p);
  return p;
}

async function removeFileSafe(p){
  try { if (p && fs.existsSync(p)) await fs.promises.unlink(p); } catch { /* ignore */ }
}

async function removeDirRecursive(p){
  try {
    if (!p || !fs.existsSync(p)) return;
    const stat = await fs.promises.stat(p);
    if (!stat.isDirectory()) return;
    const entries = await fs.promises.readdir(p);
    await Promise.all(entries.map(e=> removeDirRecursive(path.join(p,e))));
    await fs.promises.rmdir(p).catch(()=>{});
  } catch { /* ignore */ }
}

export async function cleanupTracked(){
  // Delete files first, then dirs.
  for (const f of Array.from(trackedFiles)) await removeFileSafe(f);
  for (const d of Array.from(trackedDirs)) await removeDirRecursive(d);
  trackedFiles.clear();
  trackedDirs.clear();
}
