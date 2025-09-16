#!/usr/bin/env node
/**
 * Run eslint for each package and emit a single JSON summary.
 * Does NOT print per-file diagnostics unless a failure occurs; keeps CI logs lean while enabling
 * machine parsing. Exit code is non-zero if any package reports errors or warnings (configurable).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function discoverRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'NudeShared', 'package.json'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(startDir, '../..');
}

const root = discoverRoot(__dirname);

const packages = [
  { name: 'NudeShared', path: 'NudeShared' },
  { name: 'NudeAdmin', path: 'NudeAdmin' },
  { name: 'NudeFlow', path: 'NudeFlow' },
  { name: 'NudeForge', path: 'NudeForge' }
];

const summary = { timestamp: new Date().toISOString(), packages: [], ok: true };
let hadFailure = false;

for (const pkg of packages) {
  const pkgDir = resolve(root, pkg.path);
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  let result = spawnSync(npxCmd, ['eslint', '.', '--format', 'json', '--max-warnings=0'], {
    cwd: pkgDir,
    encoding: 'utf8',
    shell: true
  });
  if (result.status === null || result.error) {
    const localEslint = resolve(root, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
    if (existsSync(localEslint)) {
      result = spawnSync(localEslint, ['.', '--format', 'json', '--max-warnings=0'], {
        cwd: pkgDir,
        encoding: 'utf8',
        shell: true
      });
    }
  }

  if (result.error) {
    summary.packages.push({ name: pkg.name, error: result.error.message, ok: false });
    hadFailure = true;
    continue;
  }

  let parsed = [];
  try {
    parsed = JSON.parse(result.stdout || '[]');
  } catch (e) {
    summary.packages.push({ name: pkg.name, parseError: e.message, raw: (result.stdout||'').slice(0,2000), ok: false });
    hadFailure = true;
    continue;
  }

  let errorCount = 0; let warningCount = 0; let fileCount = 0;
  for (const file of parsed) {
    fileCount++;
    errorCount += file.errorCount || 0;
    warningCount += file.warningCount || 0;
  }

  const ok = errorCount === 0 && warningCount === 0; // treat warnings as failures for consistency with --max-warnings=0
  if (!ok) hadFailure = true;
  summary.packages.push({ name: pkg.name, fileCount, errorCount, warningCount, ok });
}

summary.ok = !hadFailure;
const json = JSON.stringify(summary, null, 2);
console.log(json);
if (hadFailure) process.exit(1);