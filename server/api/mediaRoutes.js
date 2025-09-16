import express from 'express';
import fs from 'fs';
import path from 'path';
import { query } from '../db/db.js';
import { ensureTableReady } from '../readiness/tableReadiness.js';

function defaultUtils(){
  return { createSuccessResponse:(data,m='OK')=>({success:true,data,message:m}), createErrorResponse:(e,c='ERR')=>({success:false,error:e,code:c}), debugLog:()=>{}, errorLog:()=>{} };
}

// Interaction
export function buildMediaInteractionRouter(utils = defaultUtils()){
  const U = utils || defaultUtils();
  const router = express.Router();
  function ensureAuth(req,res,next){ if(!req.session?.user?.id) return res.status(401).json(U.createErrorResponse('Not authenticated')); next(); }

  router.get('/media/state', async (req,res)=>{
    try {
      // Ensure media-related tables are ready (media_likes, media_saves) before querying
      await ensureTableReady('media_likes', { attempts:5, delayMs:50 });
      await ensureTableReady('media_saves', { attempts:5, delayMs:50 });
      const uid = req.session?.user?.id || null;
      const key = String(req.query?.mediaKey || '').trim();
      if(!key) return res.status(400).json(U.createErrorResponse('Missing mediaKey'));
      const { rows: likeCountRows } = await query('SELECT COUNT(1) AS c FROM media_likes WHERE media_key=$1',[key]);
      const likeCount = Number(likeCountRows?.[0]?.c || 0);
      let likedByUser=false, savedByUser=false;
      if(uid){
        const { rows: l } = await query('SELECT 1 FROM media_likes WHERE user_id=$1 AND media_key=$2 LIMIT 1',[uid,key]);
        const { rows: s } = await query('SELECT 1 FROM media_saves WHERE user_id=$1 AND media_key=$2 LIMIT 1',[uid,key]);
        likedByUser = !!(l && l.length); savedByUser = !!(s && s.length);
      }
      return res.json(U.createSuccessResponse({ mediaKey:key, likeCount, likedByUser, savedByUser }, 'State'));
    }catch(e){ U.errorLog?.('MEDIA','state','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });
  router.post('/media/like', ensureAuth, async (req,res)=>{
    try {
      await ensureTableReady('media_likes', { attempts:5, delayMs:50 });
      const uid = req.session.user.id; const { mediaKey, like } = req.body||{}; const key = String(mediaKey||'').trim();
      if(!key) return res.status(400).json(U.createErrorResponse('Missing mediaKey'));
      if(like===true){ await query('INSERT INTO media_likes (user_id, media_key) VALUES ($1,$2) ON CONFLICT DO NOTHING',[uid,key]); }
      else { await query('DELETE FROM media_likes WHERE user_id=$1 AND media_key=$2',[uid,key]); }
      const { rows } = await query('SELECT COUNT(1) AS c FROM media_likes WHERE media_key=$1',[key]);
      return res.json(U.createSuccessResponse({ likeCount:Number(rows?.[0]?.c||0), likedByUser: like===true }, 'Like updated'));
    }catch(e){ U.errorLog?.('MEDIA','like','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });
  router.post('/media/save', ensureAuth, async (req,res)=>{
    try {
      await ensureTableReady('media_saves', { attempts:5, delayMs:50 });
      const uid = req.session.user.id; const { mediaKey, save } = req.body||{}; const key = String(mediaKey||'').trim();
      if(!key) return res.status(400).json(U.createErrorResponse('Missing mediaKey'));
      if(save===true){ await query('INSERT INTO media_saves (user_id, media_key) VALUES ($1,$2) ON CONFLICT DO NOTHING',[uid,key]); }
      else { await query('DELETE FROM media_saves WHERE user_id=$1 AND media_key=$2',[uid,key]); }
      return res.json(U.createSuccessResponse({ savedByUser: save===true }, 'Save updated'));
    }catch(e){ U.errorLog?.('MEDIA','save','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });
  // Optional: record a media view event (called by front-ends like NudeFlow)
  router.post('/media/view', async (req,res)=>{
    try {
      const uid = req.session?.user?.id || null;
      const key = String(req.body?.mediaKey || req.query?.mediaKey || '').trim();
      if(!key) return res.status(400).json(U.createErrorResponse('Missing mediaKey'));
      await query('INSERT INTO media_views (user_id, media_key, app) VALUES ($1,$2,$3)', [uid, key, req.headers['x-app']||null]);
      return res.json(U.createSuccessResponse({ ok:true }, 'View recorded'));
    } catch(e){ U.errorLog?.('MEDIA','view','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });
  // Record a view session with explicit duration (ms)
  router.post('/media/view-session', async (req,res)=>{
    try {
      const uid = req.session?.user?.id || null;
      const key = String(req.body?.mediaKey || '').trim();
      const duration = Number(req.body?.durationMs || req.body?.duration || 0);
      if(!key) return res.status(400).json(U.createErrorResponse('Missing mediaKey'));
      if(!(duration > 0)) return res.status(400).json(U.createErrorResponse('Invalid duration'));
      await query('INSERT INTO media_view_sessions (user_id, media_key, duration_ms) VALUES ($1,$2,$3)', [uid, key, duration]);
      return res.json(U.createSuccessResponse({ ok:true }, 'View session recorded'));
    } catch(e){ U.errorLog?.('MEDIA','view-session','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });
  router.get('/media/saved', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id;
      const { rows } = await query('SELECT media_key, created_at FROM media_saves WHERE user_id=$1 ORDER BY created_at DESC',[uid]);
      const IMAGES = new Set(['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg']);
      const mapRow = (mk) => {
        try {
          const urlObj = new URL(mk, 'http://dummy');
          let p = urlObj.pathname || mk; if(p.startsWith('/media/')) p = p.slice('/media/'.length);
          const rel = p.replace(/^\/+/,'');
          const url = '/media/' + rel; const name = decodeURIComponent(rel.split('/').pop() || 'Media');
          const thumbnail = `/media/thumb/${rel}?w=360`; const ext = ('.' + (name.split('.').pop()||'')).toLowerCase();
          const mediaType = IMAGES.has(ext) ? 'static' : 'video';
          return { mediaKey: mk, url, thumbnail, name, mediaType };
        } catch {
          const name = decodeURIComponent(String(mk).split('/').pop()||'Media');
          return { mediaKey: mk, url: mk, thumbnail: mk, name, mediaType:'video' };
        }
      };
      const items = (rows||[]).map(r=> mapRow(r.media_key));
      return res.json(U.createSuccessResponse({ items }, 'Saved list'));
    } catch(e){ U.errorLog?.('MEDIA','saved','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });
  return router;
}

// Library / discovery
export function buildMediaLibraryRouter(options={}){
  const { utils = defaultUtils(), mediaService, outputDir } = options;
  if(!mediaService) throw new Error('mediaService required');
  const U = utils || defaultUtils();
  const router = express.Router();

  router.get('/search', (req,res)=>{
    const q = req.query.q; U.debugLog?.('LIB','search',{ q });
    if(!q) return res.json(U.createSuccessResponse([], 'No search query provided'));
    const results = mediaService.searchMedia(q).map(item=>({ ...item, thumbnail:`/media/thumb/${item.relativePath}?w=360`, url:`/media/${item.relativePath}` }));
    return res.json(U.createSuccessResponse(results,'Search results retrieved'));
  });
  router.get('/categories',(req,res)=>{
    const cats=(mediaService.getCategories()||[]).filter(c=>c && c.name && !c.name.startsWith('.'));
    return res.json(U.createSuccessResponse(cats,'Categories retrieved'));
  });
  router.get('/routes',(req,res)=>{
    const cats=(mediaService.getCategories()||[]).filter(c=>c && c.name && !c.name.startsWith('.'));
    return res.json(U.createSuccessResponse(cats.map(c=>c.name),'Routes retrieved'));
  });
  router.get('/categories/:categoryName',(req,res)=>{
    const { categoryName } = req.params;
    const data = mediaService.getAllMedia().filter(item=> item?.category && item.category.toLowerCase()===categoryName.toLowerCase())
        .map(item=>({ ...item, thumbnail:`/media/thumb/${item.relativePath}?w=360`, url:`/media/${item.relativePath}` }));
    return res.json(U.createSuccessResponse(data,'Category videos retrieved'));
  });
  router.get('/media/random/:category?',(req,res)=>{
    let { category } = req.params; const picked = (!category||String(category).trim()==='') ? 'all' : (String(category).toLowerCase()==='homepage'?'all':category);
    try {
      const randomMedia = mediaService.getRandomMedia(picked);
      if(!randomMedia) return res.status(404).json(U.createErrorResponse('No media found'));
      const mediaInfo = { ...randomMedia, thumbnail:`/media/thumb/${randomMedia.relativePath}?w=720`, url:`/media/${randomMedia.relativePath}` };
      return res.json(U.createSuccessResponse(mediaInfo,'Random media info retrieved'));
  }catch { return res.status(500).json(U.createErrorResponse('Internal server error')); }
  });
  if(outputDir){
    router.get('/library-images', async (req,res)=>{
      try {
  const folderParam = (req.query.folder||'').toString();
  const baseDir = (()=>{ if(!folderParam) return outputDir; const norm= path.normalize(folderParam).replace(/^\.+[\\/]?/,''); const candidate= path.join(outputDir, norm); const rel= path.relative(outputDir, candidate); if(rel.startsWith('..')|| path.isAbsolute(rel)) return outputDir; return candidate; })();
        const entries = await fs.promises.readdir(baseDir,{ withFileTypes:true });
        const files = entries.filter(d=>d.isFile() && !d.name.startsWith('.')).map(d=>d.name);
        const images = files.filter(f=>/\.(png|jpg|jpeg|gif|webp)$/i.test(f))
          .sort((a,b)=> fs.statSync(path.join(baseDir,b)).mtimeMs - fs.statSync(path.join(baseDir,a)).mtimeMs)
          .slice(0,1000);
        const folderSegments = (path.relative(outputDir, baseDir)||'').split(path.sep).filter(Boolean);
        const encodedFolder = folderSegments.map(encodeURIComponent).join('/');
        const items = images.map(name=>{ const encodedName = encodeURIComponent(name); const relUrl = encodedFolder ? `${encodedFolder}/${encodedName}` : encodedName; return { name, url:`/output/${relUrl}`, thumbnail:`/thumbs/output/${relUrl}?w=480` }; });
        return res.json(U.createSuccessResponse({ images: items, folder: folderParam || '' }, 'Library images'));
  }catch { return res.status(500).json(U.createErrorResponse('Failed to list library images')); }
    });
    router.get('/library-folders', async (req,res)=>{
      try {
  const dirParam = (req.query.folder||'').toString();
  const targetDir = (()=>{ if(!dirParam) return outputDir; const norm= path.normalize(dirParam).replace(/^\.+[\\/]?/,''); const candidate= path.join(outputDir, norm); const rel= path.relative(outputDir, candidate); if(rel.startsWith('..')|| path.isAbsolute(rel)) return outputDir; return candidate; })();
        const entries = await fs.promises.readdir(targetDir,{ withFileTypes:true });
        const subdirs = entries.filter(e=>e.isDirectory() && !e.name.startsWith('.')).map(e=>e.name);
        const results = [];
        for(const name of subdirs){
          const abs = path.join(targetDir, name); let files;
          try { files = await fs.promises.readdir(abs,{ withFileTypes:true }); } catch { continue; }
          const imageFiles = files.filter(f=> f.isFile() && !f.name.startsWith('.') && /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name)).map(f=>f.name);
          if(imageFiles.length===0){ results.push({ path:path.relative(outputDir, abs).split(path.sep).join('/'), name, displayName:name, count:0, preview:null }); continue; }
          const newest = imageFiles.sort((a,b)=> fs.statSync(path.join(abs,b)).mtimeMs - fs.statSync(path.join(abs,a)).mtimeMs)[0];
          const relFolder = path.relative(outputDir, abs).split(path.sep).join('/');
          const relFile = `${relFolder}/${newest}`; const encodedRel = relFile.split('/').map(encodeURIComponent).join('/');
          results.push({ path: relFolder, name, displayName:name, count:imageFiles.length, preview:`/thumbs/output/${encodedRel}?w=360` });
        }
        results.sort((a,b)=> a.displayName.localeCompare(b.displayName, undefined, { sensitivity:'base', numeric:true }));
        return res.json(U.createSuccessResponse({ folders: results, folder: dirParam || '' }, 'Library folders'));
  }catch { return res.status(500).json(U.createErrorResponse('Failed to list library folders')); }
    });
  }
  return router;
}

export default { buildMediaInteractionRouter, buildMediaLibraryRouter };
