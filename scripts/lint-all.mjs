#!/usr/bin/env node
/**
 * Lint all monorepo packages sequentially with clear section headers.
 * Exits non‑zero if any package fails its lint step.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dynamically discover monorepo root by walking upward until we find NudeShared/package.json
function discoverRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 6; i++) { // safety bound
    if (existsSync(join(dir, 'NudeShared', 'package.json'))) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: previous relative assumption (two levels up) – better than overshooting
  return resolve(startDir, '../..');
}

const root = discoverRoot(__dirname);

const packages = [
  { name: 'NudeShared', path: 'NudeShared' },
  { name: 'NudeAdmin', path: 'NudeAdmin' },
  { name: 'NudeFlow', path: 'NudeFlow' },
  { name: 'NudeForge', path: 'NudeForge' }
];

let failures = 0;

for (const pkg of packages) {
  const pkgDir = resolve(root, pkg.path);
  console.log(`\n===== LINT: ${pkg.name} (${pkg.path}) =====`);
  if (!existsSync(pkgDir)) {
    failures++;
    console.error(`✖ Lint failed for ${pkg.name} (directory not found at ${pkgDir})`);
    continue;
  }
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  let result = spawnSync(npxCmd, ['eslint', '.', '--max-warnings=0'], {
    cwd: pkgDir,
    stdio: 'inherit',
    env: process.env,
    shell: true // shell true improves Windows resolution of npx.cmd in some PowerShell contexts
  });
  if (result.status === null || result.error) {
    // Fallback: attempt direct node_modules eslint path within workspace root
    const localEslint = resolve(root, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
    if (existsSync(localEslint)) {
      console.log('[lint-all] Falling back to local eslint binary');
      result = spawnSync(localEslint, ['.', '--max-warnings=0'], {
        cwd: pkgDir,
        stdio: 'inherit',
        env: process.env,
        shell: true
      });
    }
  }
  if (result.status !== 0) {
    failures++;
    console.error(`✖ Lint failed for ${pkg.name}`);
  } else {
    console.log(`✔ Lint passed for ${pkg.name}`);
  }
}

if (failures > 0) {
  console.error(`\nLint completed with ${failures} failing package(s).`);
  process.exit(1);
}
console.log('\nAll packages linted successfully.');
