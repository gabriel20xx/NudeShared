#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(sharedRoot, '..');

// Single unified run: only execute vitest once using shared config.
// Legacy per-app tests are stubs; if needed you could extend this to run app-local extras.

function run(cmd, args, cwd){
  return new Promise((resolve,reject)=>{
    const p = spawn(cmd, args, { stdio:'inherit', cwd, shell: process.platform === 'win32' });
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(cmd+ ' exit ' + code)));
  });
}

(async () => {
  try {
    console.log('Running unified Vitest suite (NudeShared/tests)...');
    await run('npx', ['vitest','run','--config','vitest.config.mjs','--reporter','basic'], sharedRoot);
    console.log('\nAll tests completed.');
  } catch (e) {
    console.error('Test run failed:', e.message);
    process.exit(1);
  }
})();