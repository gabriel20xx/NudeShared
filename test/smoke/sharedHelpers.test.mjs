import { describe, test, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createStandardApp } from '../../server/app/createStandardApp.js';
import { attachLayoutHelper } from '../../server/app/layoutEjsHelper.js';
import { ensureDirs } from '../../server/fs/ensureDirs.js';
import { createHttpOrHttpsServer } from '../../server/http/createHttpOrHttpsServer.js';

// Simple helper to perform HTTP request without external deps
function simpleRequest(server, pathName){
  return new Promise((resolve,reject)=>{
    const addr = server.address();
    const port = addr.port;
    const http = require('http');
    const req = http.request({ hostname:'127.0.0.1', port, path: pathName, method:'GET' }, res=>{
      let data=''; res.on('data', c=> data+=c); res.on('end', ()=> resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject); req.end();
  });
}

describe('shared helpers', () => {
  test('ensureDirs creates directories', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'nc-shared-'));
    const target = path.join(tmp,'a','b','c');
    ensureDirs([target]);
    expect(fs.existsSync(target)).toBe(true);
  });

  test('layout helper injects body into layout', async () => {
    const app = await createStandardApp({ serviceName:'TestService', ejsFallbackShim:true });
    attachLayoutHelper(app);
    // create temp view + layout in memory by monkey patching render engine (fallback shim returns raw string)
    // We'll simulate by calling res.render on a fake response.
    const routePromise = new Promise((resolve)=>{
      app.get('/demo', (req,res)=>{
        res.locals.layout('layout-demo');
        // monkey patch underlying engine: express views expects real files; we bypass by overriding app.render for test brevity
        res.app.render = function(view, opts, cb){
          if (view === 'layout-demo') return cb(null, `<html><body><div id='layout'>${opts.body}</div></body></html>`);
          return cb(null, `<p id='content'>Hello</p>`);
        };
        res.render('content', {});
      });
      app.use((req,res)=> res.status(404).end());
      const server = app.listen(0, async ()=>{
        const r = await simpleRequest(server,'/demo');
        server.close();
        resolve(r);
      });
    });
    const resp = await routePromise;
    expect(resp.body.includes("id='layout'")).toBe(true);
    expect(resp.body.includes("id='content'"));
  });

  test('createHttpOrHttpsServer falls back to HTTP when disabled', async () => {
    const app = await createStandardApp({ serviceName:'HTTPOnly' });
    const server = await createHttpOrHttpsServer(app, { enableHttps:false, serviceName:'HTTPOnly'});
    await new Promise(r=> server.listen(0,r));
    const res = await simpleRequest(server,'/healthz');
    expect(res.status).toBe(200);
    server.close();
  });
});
