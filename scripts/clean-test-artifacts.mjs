#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

// Directories to clean (relative to repo root)
const TARGET_DIRS = [
  'database',
  'input',
  'output',
  'copy'
];

function rimrafChildren(dir) {
  if (!fs.existsSync(dir)) return { skipped: true };
  let removed = 0;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    try {
      fs.rmSync(full, { recursive: true, force: true });
      removed++;
    } catch (e) {
      console.error('[CLEAN] Failed removing', full, e.message);
    }
  }
  return { removed };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const results = [];
for (const rel of TARGET_DIRS) {
  const abs = path.join(repoRoot, rel);
  ensureDir(abs);
  const res = rimrafChildren(abs);
  results.push({ dir: rel, ...res });
}

// Remove NudeShared/tmp-fallback-* directories (entire directories)
const nudeSharedDir = path.join(repoRoot, 'NudeShared');
let fallbackRemoved = 0;
if (fs.existsSync(nudeSharedDir)) {
  for (const entry of fs.readdirSync(nudeSharedDir)) {
    if (entry.startsWith('tmp-fallback-')) {
      const full = path.join(nudeSharedDir, entry);
      try {
        fs.rmSync(full, { recursive: true, force: true });
        fallbackRemoved++;
      } catch (e) {
        console.error('[CLEAN] Failed removing fallback dir', full, e.message);
      }
    }
  }
}

const summary = { ok: true, cleaned: results, fallbackRemoved };
console.log(JSON.stringify(summary, null, 2));
