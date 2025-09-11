import { describe, test, expect } from 'vitest';
import { ensureTestDb } from './utils/testDb.mjs';
import { createApp } from '../../NudeFlow/src/app.js';
import http from 'http';

function requestJSON(options, body){
  return new Promise((resolve, reject)=>{
    const req = http.request(options, res=>{
      let data=''; res.on('data',c=>data+=c); res.on('end',()=>{ let json=null; try{ json=JSON.parse(data||'{}'); }catch{} resolve({ status:res.statusCode, json, headers: res.headers }); });
    });
    req.on('error', reject); if(body) req.write(body); req.end();
  });
}
const cookieHeader = jar => jar.join('; ');
function storeCookies(jar, headers){ const set = headers['set-cookie']; if(!set) return; const arr = Array.isArray(set)? set:[set]; for(const c of arr){ const semi=c.split(';')[0]; const [name]=semi.split('='); const idx=jar.findIndex(x=>x.startsWith(name+'=')); if(idx>=0) jar[idx]=semi; else jar.push(semi);} }

describe('Playlist edge cases', () => {
  test('duplicates, idempotent removal, summary & random behaviors', async () => {
    await ensureTestDb();
    const app = await createApp();
    const server = app.listen(0); const port = server.address().port; const jar=[];
    try {
      const creds = { email: 'pledge_'+Date.now()+'@example.com', password: 'secret12', username: 'plEdge'+Date.now() };
      let res = await requestJSON({ hostname:'127.0.0.1', port, path:'/auth/signup', method:'POST', headers:{'Content-Type':'application/json'} }, JSON.stringify(creds));
      if (res.status === 409) {
        res = await requestJSON({ hostname:'127.0.0.1', port, path:'/auth/login', method:'POST', headers:{'Content-Type':'application/json'} }, JSON.stringify({ email: creds.email, password: creds.password }));
      }
      expect(res.status).toBe(200); storeCookies(jar, res.headers);

      // Create two playlists (one for empty random test, one for normal flow)
      const mkPlaylist = async (name)=>{
        const r = await requestJSON({ hostname:'127.0.0.1', port, path:'/api/playlists', method:'POST', headers:{'Content-Type':'application/json','Cookie':cookieHeader(jar)}}, JSON.stringify({ name }));
        expect(r.status).toBe(200); return r.json?.data?.playlist?.id; };
      const playlistEmpty = await mkPlaylist('EmptyList_'+Date.now());
      const playlist = await mkPlaylist('EdgeList_'+Date.now());

      // Random on empty playlist should 404
      const randEmpty = await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlistEmpty}/random`, method:'GET', headers:{'Cookie':cookieHeader(jar)} });
      expect(randEmpty.status).toBe(404);

      // Add item twice (duplicate)
      const mediaKey = '/media/output/dupEdge_'+Date.now()+'.mp4';
      let add1 = await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlist}/items`, method:'POST', headers:{'Content-Type':'application/json','Cookie':cookieHeader(jar)}}, JSON.stringify({ mediaKey }));
      expect(add1.status).toBe(200);
      let add2 = await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlist}/items`, method:'POST', headers:{'Content-Type':'application/json','Cookie':cookieHeader(jar)}}, JSON.stringify({ mediaKey }));
      expect(add2.status).toBe(200); // should not error, ON CONFLICT DO NOTHING

      // Items list should have exactly one instance
      let itemsList = await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlist}/items`, method:'GET', headers:{'Cookie':cookieHeader(jar)} });
      expect(itemsList.status).toBe(200);
      const items = itemsList.json?.data?.items || [];
      expect(items.length).toBe(1);

      // Remove non-existent mediaKey should still succeed (idempotent deletion)
      const nonExistent = await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlist}/items?mediaKey=${encodeURIComponent('/media/output/never_'+Date.now()+'.mp4')}`, method:'DELETE', headers:{'Cookie':cookieHeader(jar)} });
      expect(nonExistent.status).toBe(200);

      // Remove real item
      const remReal = await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlist}/items?mediaKey=${encodeURIComponent(mediaKey)}`, method:'DELETE', headers:{'Cookie':cookieHeader(jar)} });
      expect(remReal.status).toBe(200);

      // Now add another and test random succeeds
      const mk2 = '/media/output/another_'+Date.now()+'.mp4';
      await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlist}/items`, method:'POST', headers:{'Content-Type':'application/json','Cookie':cookieHeader(jar)}}, JSON.stringify({ mediaKey: mk2 }));
      const randFilled = await requestJSON({ hostname:'127.0.0.1', port, path:`/api/playlists/${playlist}/random`, method:'GET', headers:{'Cookie':cookieHeader(jar)} });
      expect(randFilled.status).toBe(200);

      // Summary should list both playlists with accurate counts (empty one 0, main one 1)
      const summary = await requestJSON({ hostname:'127.0.0.1', port, path:'/api/playlists/summary', method:'GET', headers:{'Cookie':cookieHeader(jar)} });
      expect(summary.status).toBe(200);
      const summaries = summary.json?.data?.playlists || [];
      const emptyEntry = summaries.find(p=>p.id===playlistEmpty);
      const mainEntry = summaries.find(p=>p.id===playlist);
      expect(emptyEntry?.item_count).toBe(0);
      expect(mainEntry?.item_count).toBe(1);
    } finally { server.close(); }
  }, 30000);
});
