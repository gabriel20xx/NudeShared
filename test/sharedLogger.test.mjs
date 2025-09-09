import assert from 'assert';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';

function startServer(app){
  return new Promise((resolve)=>{
    const srv = http.createServer(app);
    srv.listen(0, ()=>{ resolve({ srv, port: srv.address().port }); });
  });
}

(async () => {
  // Build a tiny app that exposes /shared from this NudeShared directory
  const app = express();
  const sharedDir = path.resolve(__dirname, '..');
  if (!fs.existsSync(sharedDir)) throw new Error('Shared dir missing');
  app.use('/shared', express.static(sharedDir));
  app.get('/health', (_req,res)=>res.json({ status:'ok' }));

  const { srv, port } = await startServer(app);
  try {
    // Client logger should be available
    await new Promise((resolve, reject)=>{
      http.get({ hostname:'127.0.0.1', port, path:'/shared/client/clientLogger.js' }, res=>{
        const chunks=[]; res.on('data',c=>chunks.push(c)); res.on('end', ()=>{
          try { assert.equal(res.statusCode, 200, 'clientLogger 200'); resolve(); } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
    console.log('Shared sharedLogger test passed');
  } finally { srv.close(); }
})();
