#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

// Run vitest with JSON reporter and parse skipped tests/suites.
// Usage: node scripts/list-skipped-tests.mjs [--ci]
// Exits with code 0 if none skipped, 1 if any skipped (unless --ci omitted, still 1 for visibility).

// Resolve local vitest binary (avoid relying on npx which can be absent in some CI / shells)
function resolveVitestBin() {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve('vitest/package.json');
    const binDir = path.dirname(pkgPath);
    // Vitest exposes a bin field pointing to dist/cli.js; require it to ensure path stability
    const pkg = require('vitest/package.json');
    if (pkg && pkg.bin && pkg.bin.vitest) {
      return path.join(binDir, pkg.bin.vitest);
    }
    // Fallback: common location
    return path.join(binDir, 'dist', 'cli.js');
  } catch (err) {
    console.error('[list-skipped-tests] Unable to resolve vitest binary:', err.message);
    process.exit(2);
  }
}

const vitestBin = resolveVitestBin();
const nodeExec = process.execPath; // Use current Node runtime

// Always pass explicit config to ensure identical file set as normal test run.
// Use 'run' subcommand to execute once (no watch) and JSON reporter for machine parsing.
const args = [vitestBin, 'run', '--config', 'vitest.config.mjs', '--reporter=json'];
const child = spawn(nodeExec, args, { stdio: ['ignore','pipe','inherit'] });
let jsonBlock = '';
child.stdout.on('data', d => {
  const text = d.toString();
  // Capture last JSON object emitted by vitest reporter (it prints progress lines + final JSON)
  jsonBlock += text;
});
child.on('close', _code => {
  // Attempt to find the final JSON object (Vitest prints *only* JSON in our current mode but be defensive)
  const match = jsonBlock.match(/(\{[\s\S]*\})\s*$/);
  if (!match) {
    console.error('[list-skipped-tests] Failed to parse Vitest JSON output');
    process.exit(2);
  }
  let report;
  try { report = JSON.parse(match[1]); } catch (e) {
    console.error('[list-skipped-tests] JSON parse error', e);
    process.exit(2);
  }

  // Vitest JSON reporter structure (observed):
  // { numTotalTests, testResults: [ { name, assertionResults: [ { title, status } ] } ] }
  // Legacy / alternative structure we previously attempted: { testFiles: [ { file, tests:[{ state }] } ] }
  const skipped = [];
  let totalFiles = 0;

  if (Array.isArray(report.testResults)) {
    totalFiles = report.testResults.length;
    for (const tr of report.testResults) {
      const filePath = tr.name || tr.file || 'unknown';
      (tr.assertionResults || []).forEach(ar => {
        // Vitest marks skipped tests with status === 'skipped'. Support 'todo' & 'pending' for completeness.
        if (ar.status === 'skipped' || ar.status === 'todo' || ar.status === 'pending') {
          skipped.push({ file: filePath, test: ar.fullName || ar.title, state: ar.status });
        }
      });
    }
  } else if (Array.isArray(report.testFiles)) { // fallback structure
    totalFiles = report.testFiles.length;
    for (const f of report.testFiles) {
      if (!f) continue;
      const filePath = f.file || f.name || 'unknown';
      (f.tests || []).forEach(t => {
        if (t.state === 'skip' || t.state === 'todo' || t.state === 'pending') {
          skipped.push({ file: filePath, test: t.name, state: t.state });
        }
      });
    }
  } else {
    console.error('[list-skipped-tests] Unrecognized Vitest JSON structure');
    process.exit(2);
  }

  const summary = { totalFiles, skippedCount: skipped.length, skipped };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(skipped.length > 0 ? 1 : 0);
});
