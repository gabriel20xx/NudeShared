import { describe, test, expect } from 'vitest';
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

describe('Shared auth & health', () => {
  test('health and /auth/me respond', async () => {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    app.get('/health', (_req,res)=>res.json({ status:'ok' }));
    app.use('/auth', buildAuthRouter(express.Router));
    const { srv, port } = await startServer(app);
    try {
      const statusHealth = await new Promise(r=>{ http.get({ hostname:'127.0.0.1', port, path:'/health' }, res=>{ res.resume(); res.on('end', ()=>r(res.statusCode)); }); });
      expect(statusHealth).toBe(200);
      const statusMe = await new Promise(r=>{ http.get({ hostname:'127.0.0.1', port, path:'/auth/me' }, res=>{ res.resume(); res.on('end', ()=>r(res.statusCode)); }); });
      expect(statusMe).toBe(200);
    } finally { srv.close(); }
  });
});
