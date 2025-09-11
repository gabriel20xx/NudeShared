import { test, expect } from 'vitest';
import { ensureTestDb } from './utils/testDb.mjs';
import { createApp } from '../../NudeFlow/src/app.js';
import http from 'http';

function requestJSON(options, body){
  return new Promise((resolve, reject)=>{ const req = http.request(options, res=>{ let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ let j=null; try{ j=JSON.parse(d||'{}'); }catch{} resolve({ status:res.statusCode, json:j, text:d, headers: res.headers }); }); }); req.on('error', reject); if(body) req.write(body); req.end(); });
}
const cookieHeader = jar => jar.join('; ');
function storeCookies(jar, headers){ const set = headers['set-cookie']; if(!set) return; const arr = Array.isArray(set)? set:[set]; for(const c of arr){ const semi=c.split(';')[0]; const [name]=semi.split('='); const idx=jar.findIndex(x=>x.startsWith(name+'=')); if(idx>=0) jar[idx]=semi; else jar.push(semi);} }

test('playlist reorder rejects invalid item id', async () => {
  await ensureTestDb();
  const app = await createApp();
  const server = app.listen(0); const port = server.address().port; const jar=[];
  try {
    const creds = { email: 'plreorder_'+Date.now()+'@ex.com', password:'secret12', username: 'plreorder'+Date.now() };
    let res = await requestJSON({ hostname:'127.0.0.1', port, path:'/auth/signup', method:'POST', headers:{'Content-Type':'application/json'} }, JSON.stringify(creds));
    if (res.status === 409) {
      res = await requestJSON({ hostname:'127.0.0.1', port, path:'/auth/login', method:'POST', headers:{'Content-Type':'application/json'} }, JSON.stringify({ email: creds.email, password: creds.password }));
    }
  expect(res.status).toBe(200); storeCookies(jar, res.headers||{});
    // Create playlist
    const cpl = await requestJSON({ hostname:'127.0.0.1', port, path:'/api/playlists', method:'POST', headers:{'Content-Type':'application/json','Cookie':cookieHeader(jar)} }, JSON.stringify({ name:'ReorderTest' }));
    expect(cpl.status).toBe(200); const playlistId = cpl.json?.data?.playlist?.id; expect(playlistId).toBeTruthy();
    // Add two items
    const mk1 = '/media/output/r1_'+Date.now()+'.mp4';
    const mk2 = '/media/output/r2_'+Date.now()+'.mp4';
    await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlistId}/items`, method:'POST', headers:{'Content-Type':'application/json','Cookie':cookieHeader(jar)} }, JSON.stringify({ mediaKey: mk1 }));
    await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlistId}/items`, method:'POST', headers:{'Content-Type':'application/json','Cookie':cookieHeader(jar)} }, JSON.stringify({ mediaKey: mk2 }));
    const items = await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlistId}/items`, method:'GET', headers:{'Cookie':cookieHeader(jar)} });
    expect(items.status).toBe(200); const ids = (items.json?.data?.items||[]).map(i=>i.id);
    expect(ids.length).toBe(2);
    const badId = Math.max(...ids) + 999;
    const reorder = await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlistId}/items/reorder`, method:'PATCH', headers:{'Content-Type':'application/json','Cookie':cookieHeader(jar)} }, JSON.stringify({ items:[...ids, badId] }));
    expect(reorder.status).toBe(400);
  } finally { server.close(); }
}, 30000);
