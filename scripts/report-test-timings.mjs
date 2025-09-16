#!/usr/bin/env node
// Simple timing harness: runs vitest in JSON reporter mode and summarizes collection vs test execution time.
import { spawn } from 'node:child_process';

const args = ['vitest', 'run', '--reporter=json'];
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { stdio: ['ignore', 'pipe', 'inherit'] });

let json = '';
child.stdout.on('data', d => { json += d.toString(); });
child.on('close', code => {
  if (code !== 0) {
    console.error('vitest exited with code', code);
    process.exit(code);
  }
  // Vitest JSON reporter may output multiple JSON objects; take last complete JSON object.
  const matches = json.trim().match(/\{[\s\S]*$/); // naive: last JSON-like block
  let data;
  try {
    data = JSON.parse(matches ? matches[0] : json);
  } catch {
    console.error('Failed to parse vitest JSON output');
    process.exit(1);
  }
  // timings variable removed (unused) – JSON summary below is sufficient
  const summary = data?.summary || {};
  const out = {
    testFiles: summary.testFiles ?? summary.files ?? 'n/a',
    tests: summary.tests ?? 'n/a',
    durationMs: summary.duration ?? 'n/a',
    failed: summary.failed ?? 0,
    skipped: summary.skipped ?? 0,
    passed: summary.passed ?? 0,
    // Vitest does not expose collect vs run granularly in JSON; we could extend later by parsing stdout.
    note: 'For deeper phase timing, run "npx vitest run --reporter basic" and inspect breakdown.'
  };
  console.log(JSON.stringify(out, null, 2));
});