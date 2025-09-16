#!/usr/bin/env node
/**
 * Lint all monorepo packages sequentially with clear section headers.
 * Exits non‑zero if any package fails its lint step.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');

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
  // Use npx eslint directly to avoid nested npm invocation issues on Windows shells.
  const result = spawnSync('npx eslint . --ext .js,.mjs --max-warnings=0', {
    cwd: pkgDir,
    stdio: 'inherit',
    env: process.env,
    shell: true
  });
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
