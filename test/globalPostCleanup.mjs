// Global post-test cleanup: remove stray temp dirs produced during tests.
// Invoked manually (e.g., via an npm script) after vitest run; non-fatal on errors.
import fs from 'fs';
import os from 'os';
import path from 'path';

function safeRm(p){
  try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
}

function listDirNames(dir){
  try { return fs.readdirSync(dir); } catch { return []; }
}

function scanAndClean(){
  const cwd = process.cwd();
  const candidates = [];
  // Patterns we know: nudeadmin-out-*, tmp-shared-test-*, vote-media-* (no directory), mkdtemp OS tmp pref.
  try {
    for (const name of fs.readdirSync(os.tmpdir())) {
      if (/^nudeadmin-out-/i.test(name)) candidates.push(path.join(os.tmpdir(), name));
    }
  } catch {}
  try {
    for (const name of fs.readdirSync(cwd)) {
      if (/^tmp-shared-test-/i.test(name) && fs.statSync(path.join(cwd,name)).isDirectory()) candidates.push(path.join(cwd,name));
    }
  } catch {}
  let removed = 0;
  for (const c of candidates) { safeRm(c); removed++; }

  // Residual artifact scan for common writable dirs – list remaining entries (non-fatal, informational)
  const writableRoots = ['output','input','copy'];
  const residual = {};
  for (const r of writableRoots){
    const abs = path.join(cwd, '..', r); // parent of NudeShared (monorepo root assumption)
    residual[r] = listDirNames(abs);
  }

  console.log(JSON.stringify({ ok:true, removed, candidates, residual }));
}

scanAndClean();