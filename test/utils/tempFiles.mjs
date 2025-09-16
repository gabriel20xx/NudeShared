// Utility for tracking and cleaning up temporary test artifacts.
// Usage:
//   import { trackTempFile, trackTempDir, cleanupTracked } from '../utils/tempFiles.mjs';
//   const file = trackTempFile(tmpPath);
//   try { ... test logic ... }
//   finally { await cleanupTracked(); }
// This ensures per-test cleanup even when running a single file.

import fs from 'fs';
import path from 'path';
import os from 'os';

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

// Snapshot a directory's contents (recursive = false). Returns Set of immediate entry names.
export async function snapshotDir(dir){
  try {
    const entries = await fs.promises.readdir(dir);
    return new Set(entries);
  } catch {
    return new Set();
  }
}

// Remove any new immediate entries created between before/after snapshot.
export async function cleanupNewEntries(dir, before){
  try {
    const after = await fs.promises.readdir(dir);
    const removals = [];
    for (const name of after){
      if (!before.has(name)) removals.push(path.join(dir, name));
    }
    // Attempt to remove files or dirs (shallow)
    await Promise.all(removals.map(async p => {
      try {
        const st = await fs.promises.stat(p);
        if (st.isDirectory()) {
          // quick directory removal (non-recursive). If not empty, fall back to recursive.
          await fs.promises.rmdir(p).catch(async () => {
            await removeDirRecursive(p);
          });
        } else {
          await fs.promises.unlink(p);
        }
      } catch { /* ignore */ }
    }));
  } catch { /* ignore */ }
}

// Convenience: create a temp directory with prefix, run async fn(dir), ensure cleanup of that dir only.
export async function withTempDir(prefix, fn, { keep = false } = {}) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
  trackTempDir(dir);
  try {
    return await fn(dir);
  } finally {
    if (!keep) await cleanupTracked();
  }
}

// Convenience: create a temp file (optionally with data) inside OS temp dir; run fn(filePath); ensure removal.
export async function withTempFile(prefix, data, fn, { keep = false } = {}) {
  const file = path.join(await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix)), 'tmp');
  trackTempDir(path.dirname(file));
  await fs.promises.writeFile(file, data || '');
  trackTempFile(file);
  try {
    return await fn(file);
  } finally {
    if (!keep) await cleanupTracked();
  }
}
