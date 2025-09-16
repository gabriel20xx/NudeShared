import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'http';
import { mountSharedStatic, registerCachePolicyEndpoint } from '../server/index.js';
import path from 'path';
import fs from 'fs';
import { trackTempDir, trackTempFile, cleanupTracked } from './utils/tempFiles.mjs';

function startServer(app){
  return new Promise(resolve=>{
    const server = http.createServer(app);
    server.listen(0, ()=>{
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

describe('HTTP Helpers', () => {
  it('mountSharedStatic logs first existing candidate and serves asset', async () => {
    const app = express();
    const tempDir = trackTempDir(fs.mkdtempSync(path.join(process.cwd(), 'tmp-shared-test-')));
    const cssPath = trackTempFile(path.join(tempDir, 'test.css'));
    fs.writeFileSync(cssPath, 'body{color:#000}');
    const logs = [];
    mountSharedStatic(app, { candidates: [tempDir], logger: { info: (...a)=>logs.push(a.join(' ')), warn: (...a)=>logs.push(a.join(' ')) } });
    const { server, port } = await startServer(app);
    try {
      const res = await fetch(`http://localhost:${port}/shared/test.css`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('body');
      const logJoined = logs.join('\n');
      expect(logJoined).toMatch(/Mounted \/shared assets/);
    } finally {
      server.close();
      await cleanupTracked();
    }
  });

  it('registerCachePolicyEndpoint returns expected JSON and rate limits after burst', async () => {
    const app = express();
    registerCachePolicyEndpoint(app, { service: 'UnitTestService', getPolicies: () => ({ sample: 'cache-control-here' }) });
    const { server, port } = await startServer(app);
    try {
      // First request
      let res = await fetch(`http://localhost:${port}/__cache-policy`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.service).toBe('UnitTestService');
      expect(json.policies.sample).toBe('cache-control-here');
      // Fire a bunch more quickly and expect eventually 429 or still 200 if threshold not crossed in timing
      let got429 = false;
      for (let i=0;i<75;i++) {
        const r = await fetch(`http://localhost:${port}/__cache-policy`);
        if (r.status === 429) { got429 = true; break; }
      }
      expect(got429).toBe(true);
    } finally { server.close(); }
  });
});
