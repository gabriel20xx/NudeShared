import assert from 'assert';
import express from 'express';
import session from 'express-session';
import http from 'http';
import { buildAuthRouter } from '../server/api/authRoutes.js';

function startServer(app){
  return new Promise((resolve)=>{
    const srv = http.createServer(app);
    srv.listen(0, ()=>{ resolve({ srv, port: srv.address().port }); });
  });
}

(async () => {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.get('/health', (_req,res)=>res.json({ status:'ok' }));
  app.use('/auth', buildAuthRouter(express.Router));

  const { srv, port } = await startServer(app);
  try {
    // Health
    await new Promise((resolve, reject)=>{
      http.get({ hostname:'127.0.0.1', port, path:'/health' }, res=>{ res.resume(); res.on('end', ()=>{ try{ assert.equal(res.statusCode,200); resolve(); }catch(e){ reject(e); } }); }).on('error', reject);
    });
    // Auth me (no session)
    await new Promise((resolve, reject)=>{
      http.get({ hostname:'127.0.0.1', port, path:'/auth/me' }, res=>{ res.resume(); res.on('end', ()=>{ try{ assert.equal(res.statusCode,200); resolve(); }catch(e){ reject(e); } }); }).on('error', reject);
    });
    console.log('Shared authHealth passed');
  } finally { srv.close(); }
})();
