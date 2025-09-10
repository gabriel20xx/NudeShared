import express from 'express';
import { query } from '../db/db.js';

function defaultUtils(){
  return { createSuccessResponse:(data,m='OK')=>({success:true,data,message:m}), createErrorResponse:(e,c='ERR')=>({success:false,error:e,code:c}), debugLog:()=>{}, errorLog:()=>{} };
}

export function buildPlaylistsRouter(utils = defaultUtils()){
  const U = utils || defaultUtils();
  const router = express.Router();
  const ensureAuth = (req,res,next)=>{ if(!req.session?.user?.id) return res.status(401).json(U.createErrorResponse('Not authenticated')); next(); };

  function mapMediaKeyToInfo(mk){
    try {
      const urlObj = new URL(mk, 'http://dummy');
      let p = urlObj.pathname || mk; if(p.startsWith('/media/')) p = p.slice('/media/'.length);
      const rel = p.replace(/^\/+/, '');
      const url = '/media/' + rel;
      const name = decodeURIComponent(rel.split('/').pop() || 'Media');
      const ext = ('.' + (name.split('.').pop()||'')).toLowerCase();
      const isImg = /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(ext);
      const thumbnail = `/media/thumb/${rel}?w=360`;
      const mediaType = isImg ? 'static' : 'video';
      return { url, thumbnail, name, mediaType, relativePath: rel };
    } catch {
      const name = decodeURIComponent(String(mk).split('/').pop()||'Media');
      return { url: mk, thumbnail: mk, name, mediaType: 'video', relativePath: mk };
    }
  }

  // List user's playlists
  router.get('/playlists', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id;
      const { rows } = await query('SELECT id, name, created_at FROM playlists WHERE user_id=$1 ORDER BY created_at DESC',[uid]);
      return res.json(U.createSuccessResponse({ playlists: rows||[] }, 'Playlists'));
    } catch(e){ U.errorLog?.('PLAYLISTS','list','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });

  // Summary with counts and preview thumbnail
  router.get('/playlists/summary', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id;
      // Counts
      const { rows: counts } = await query('SELECT p.id, p.name, COUNT(i.id) AS item_count FROM playlists p LEFT JOIN playlist_items i ON p.id=i.playlist_id WHERE p.user_id=$1 GROUP BY p.id, p.name ORDER BY p.created_at DESC',[uid]);
      // Preview: latest item per playlist
      const out = [];
      for (const row of counts || []){
        let preview = null;
        try {
          const { rows: prev } = await query('SELECT media_key FROM playlist_items WHERE playlist_id=$1 ORDER BY created_at DESC LIMIT 1',[row.id]);
          if (prev && prev[0]) {
            const info = mapMediaKeyToInfo(prev[0].media_key);
            preview = info.thumbnail;
          }
        } catch {}
        out.push({ id: row.id, name: row.name, item_count: Number(row.item_count||0), preview });
      }
      return res.json(U.createSuccessResponse({ playlists: out }, 'Playlists summary'));
    } catch(e){ U.errorLog?.('PLAYLISTS','summary','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });

  // Playlist meta
  router.get('/playlists/:id', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id; const id = Number(req.params.id);
      const { rows } = await query('SELECT id, name, created_at FROM playlists WHERE id=$1 AND user_id=$2',[id, uid]);
      if(!rows || !rows.length) return res.status(404).json(U.createErrorResponse('Not found'));
      return res.json(U.createSuccessResponse({ playlist: rows[0] }, 'Playlist meta'));
    } catch(e){ U.errorLog?.('PLAYLISTS','meta','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });

  // Create a playlist
  router.post('/playlists', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id;
      const name = String(req.body?.name || '').trim();
      if(!name) return res.status(400).json(U.createErrorResponse('Name required'));
      // Upsert-like: ignore if exists
      await query('INSERT INTO playlists (user_id, name) VALUES ($1,$2) ON CONFLICT DO NOTHING',[uid, name]);
      const { rows } = await query('SELECT id, name, created_at FROM playlists WHERE user_id=$1 AND lower(name)=lower($2) LIMIT 1',[uid, name]);
      return res.json(U.createSuccessResponse({ playlist: rows?.[0] || null }, 'Playlist created'));
    } catch(e){ U.errorLog?.('PLAYLISTS','create','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });

  // Delete a playlist
  router.delete('/playlists/:id', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id; const id = Number(req.params.id);
      if(!id) return res.status(400).json(U.createErrorResponse('Invalid id'));
      // Ensure ownership
      const { rows: chk } = await query('SELECT id FROM playlists WHERE id=$1 AND user_id=$2',[id, uid]);
      if(!chk || chk.length===0) return res.status(404).json(U.createErrorResponse('Not found'));
      await query('DELETE FROM playlist_items WHERE playlist_id=$1',[id]);
      await query('DELETE FROM playlists WHERE id=$1',[id]);
      return res.json(U.createSuccessResponse({ ok:true }, 'Playlist deleted'));
    } catch(e){ U.errorLog?.('PLAYLISTS','delete','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });

  // List items in a playlist
  router.get('/playlists/:id/items', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id; const id = Number(req.params.id);
      if(!id) return res.status(400).json(U.createErrorResponse('Invalid id'));
      // Ensure ownership
      const { rows: chk } = await query('SELECT id FROM playlists WHERE id=$1 AND user_id=$2',[id, uid]);
      if(!chk || chk.length===0) return res.status(404).json(U.createErrorResponse('Not found'));
      const { rows } = await query('SELECT id, media_key, position, created_at FROM playlist_items WHERE playlist_id=$1 ORDER BY COALESCE(position, 0), created_at',[id]);
      const items = (rows||[]).map(r=>{ const info = mapMediaKeyToInfo(r.media_key); return { id:r.id, media_key:r.media_key, position:r.position, created_at:r.created_at, url: info.url, thumbnail: info.thumbnail, name: info.name, mediaType: info.mediaType, relativePath: info.relativePath }; });
      return res.json(U.createSuccessResponse({ items }, 'Playlist items'));
    } catch(e){ U.errorLog?.('PLAYLISTS','list_items','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });

  // Add media to playlist
  router.post('/playlists/:id/items', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id; const id = Number(req.params.id);
      const mediaKey = String(req.body?.mediaKey || '').trim();
      if(!id) return res.status(400).json(U.createErrorResponse('Invalid id'));
      if(!mediaKey) return res.status(400).json(U.createErrorResponse('Missing mediaKey'));
      // Ensure ownership
      const { rows: chk } = await query('SELECT id FROM playlists WHERE id=$1 AND user_id=$2',[id, uid]);
      if(!chk || chk.length===0) return res.status(404).json(U.createErrorResponse('Not found'));
      await query('INSERT INTO playlist_items (playlist_id, media_key) VALUES ($1,$2) ON CONFLICT DO NOTHING',[id, mediaKey]);
      const { rows } = await query('SELECT id, media_key, position, created_at FROM playlist_items WHERE playlist_id=$1 AND media_key=$2',[id, mediaKey]);
      return res.json(U.createSuccessResponse({ item: rows?.[0] || null }, 'Item added'));
    } catch(e){ U.errorLog?.('PLAYLISTS','add_item','Failed',e); return res.status(500).json(U.createErrorResponse('Failed'));
    }
  });

  // Remove media from playlist
  router.delete('/playlists/:id/items', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id; const id = Number(req.params.id);
      const mediaKey = String(req.body?.mediaKey || req.query?.mediaKey || '').trim();
      if(!id) return res.status(400).json(U.createErrorResponse('Invalid id'));
      if(!mediaKey) return res.status(400).json(U.createErrorResponse('Missing mediaKey'));
      // Ensure ownership
      const { rows: chk } = await query('SELECT id FROM playlists WHERE id=$1 AND user_id=$2',[id, uid]);
      if(!chk || chk.length===0) return res.status(404).json(U.createErrorResponse('Not found'));
      await query('DELETE FROM playlist_items WHERE playlist_id=$1 AND media_key=$2',[id, mediaKey]);
      return res.json(U.createSuccessResponse({ ok:true }, 'Item removed'));
    } catch(e){ U.errorLog?.('PLAYLISTS','remove_item','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });

  // Random media from playlist for feed usage
  router.get('/playlists/:id/random', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id; const id = Number(req.params.id);
      if(!id) return res.status(400).json(U.createErrorResponse('Invalid id'));
      const { rows: chk } = await query('SELECT id, name FROM playlists WHERE id=$1 AND user_id=$2',[id, uid]);
      if(!chk || !chk.length) return res.status(404).json(U.createErrorResponse('Not found'));
      const { rows } = await query('SELECT media_key FROM playlist_items WHERE playlist_id=$1 ORDER BY RANDOM() LIMIT 1',[id]);
      if(!rows || !rows.length) return res.status(404).json(U.createErrorResponse('No media in playlist'));
      const info = mapMediaKeyToInfo(rows[0].media_key);
      const mediaInfo = { mediaType: info.mediaType, name: info.name, filename: info.name, relativePath: info.relativePath, url: info.url, thumbnail: info.thumbnail };
      return res.json(U.createSuccessResponse(mediaInfo, 'Random playlist media'));
    } catch(e){ U.errorLog?.('PLAYLISTS','random','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });

  // Reorder items in a playlist (sets explicit positions by array order)
  router.patch('/playlists/:id/items/reorder', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id; const id = Number(req.params.id);
      const items = Array.isArray(req.body?.items) ? req.body.items.map(n=>Number(n)).filter(Number.isFinite) : [];
      if(!id) return res.status(400).json(U.createErrorResponse('Invalid id'));
      if(!items.length) return res.status(400).json(U.createErrorResponse('No items provided'));
      // Ensure ownership
      const { rows: chk } = await query('SELECT id FROM playlists WHERE id=$1 AND user_id=$2',[id, uid]);
      if(!chk || chk.length===0) return res.status(404).json(U.createErrorResponse('Not found'));
      // Validate that all provided items belong to this playlist
      const { rows: have } = await query('SELECT id FROM playlist_items WHERE playlist_id=$1 AND id = ANY($2::int[])',[id, items]);
      const haveIds = new Set((have||[]).map(r=>Number(r.id)));
      for (const it of items){ if (!haveIds.has(it)) return res.status(400).json(U.createErrorResponse('Invalid item in list')); }
      // Assign positions based on array order starting from 0
      for (let i=0;i<items.length;i++){
        await query('UPDATE playlist_items SET position=$1 WHERE playlist_id=$2 AND id=$3',[ i, id, items[i] ]);
      }
      return res.json(U.createSuccessResponse({ ok:true }, 'Reordered'));
    } catch(e){ U.errorLog?.('PLAYLISTS','reorder','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });

  return router;
}

export default { buildPlaylistsRouter };
