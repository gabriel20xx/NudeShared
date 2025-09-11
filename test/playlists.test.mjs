import { describe, test, expect } from 'vitest';
import http from 'http';
import { createApp } from '../../NudeFlow/src/app.js';
import { ensureTestDb } from './utils/testDb.mjs';

function requestJSON(options, body){
  return new Promise((resolve, reject)=>{
    const req = http.request(options, res=>{
      let data='';
      res.on('data', c=> data+=c);
      res.on('end', ()=>{
        try { resolve({ status: res.statusCode, json: JSON.parse(data||'{}'), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, json: null, text: data, headers: res.headers }); }
      });
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
const cookieHeader = jar => jar.join('; ');
function storeCookies(jar, headers){
  const set = headers['set-cookie']; if (!set) return; const arr = Array.isArray(set)? set : [set];
  for (const cookie of arr){ const semi = cookie.split(';')[0]; const [name] = semi.split('='); const idx=jar.findIndex(c=>c.startsWith(name+'=')); if(idx>=0) jar[idx]=semi; else jar.push(semi);} }

describe('Playlists API smoke', () => {
  test('full create / add / list / remove / delete cycle', async () => {
  await ensureTestDb();
  const app = await createApp();
  const server = app.listen(0); const port = server.address().port; const jar=[];
    try {
      const creds = { email: 'pltest@example.com', password: 'secret12', username: 'pltest' };
      let res = await requestJSON({ hostname:'127.0.0.1', port, path:'/auth/signup', method:'POST', headers:{'Content-Type':'application/json'} }, JSON.stringify(creds));
      if (res.status === 409){
        res = await requestJSON({ hostname:'127.0.0.1', port, path:'/auth/login', method:'POST', headers:{'Content-Type':'application/json'} }, JSON.stringify({ email: creds.email, password: creds.password }));
        expect(res.status).toBe(200);
      } else { expect(res.status).toBe(200); }
      storeCookies(jar, res.headers);
      expect(res.json).toBeTruthy();
      // create playlist
      res = await requestJSON({ hostname:'127.0.0.1', port, path:'/api/playlists', method:'POST', headers:{'Content-Type':'application/json','Cookie':cookieHeader(jar)}}, JSON.stringify({ name:'My First List'}));
      expect(res.status).toBe(200); const playlistId = res.json?.data?.playlist?.id; expect(playlistId).toBeTruthy();
      // list
      res = await requestJSON({ hostname:'127.0.0.1', port, path:'/api/playlists', method:'GET', headers:{'Cookie':cookieHeader(jar)} });
      expect(res.status).toBe(200);
      // add item
      await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlistId}/items`, method:'POST', headers:{'Content-Type':'application/json','Cookie':cookieHeader(jar)}}, JSON.stringify({ mediaKey:'/media/output/sample.mp4' }));
      // get items
      res = await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlistId}/items`, method:'GET', headers:{'Cookie':cookieHeader(jar)} });
      expect(res.status).toBe(200);
      // remove
      await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlistId}/items?mediaKey=${encodeURIComponent('/media/output/sample.mp4')}`, method:'DELETE', headers:{'Cookie':cookieHeader(jar)} });
      // delete
      await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlistId}`, method:'DELETE', headers:{'Cookie':cookieHeader(jar)} });
    } finally { server.close(); }
  }, 30000);
});
