import express from 'express';
import { query, getDriver } from '../db/db.js';

function defaultUtils(){
  return { success:(d,m='OK')=>({success:true,data:d,message:m}), error:(e)=>({success:false,error:e}), infoLog:()=>{}, errorLog:()=>{} };
}

export function buildAdminMediaRouter(options={}) {
  const { utils = defaultUtils(), requireAuth, requireAdmin, basePath='/admin' } = options;
  const U = utils || defaultUtils();
  const router = express.Router();
  const ensureAuth = requireAuth || ((req,res,next)=> req.session?.user?.id ? next() : res.status(401).json({ success:false, error:'Not authenticated'}));
  const ensureAdmin = requireAdmin || ((req,res,next)=>{ const u=req.session?.user; if(!u|| (u.role!=='admin' && u.role!=='superadmin')) return res.status(403).json({ success:false,error:'Forbidden'}); next(); });

  // Media listing with optional category & search filters
  router.get(`${basePath}/media`, ensureAuth, ensureAdmin, async (req,res)=>{
    try{
      const driver = getDriver();
      const cat = (req.query.category||'').toString().trim();
      const search = (req.query.search||'').toString().trim().toLowerCase();
      const params=[]; const where=[];
      if(cat){
        if(driver==='pg'){ params.push(cat); where.push(`category = $${params.length}`); }
        else { params.push(cat); where.push('category = ?'); }
      }
      if(search){
        if(driver==='pg'){
          const term = `%${search}%`; params.push(term); params.push(term); where.push(`(lower(title) LIKE $${params.length-1} OR lower(media_key) LIKE $${params.length})`);
        } else {
          const term = `%${search}%`; params.push(term, term); where.push('(lower(title) LIKE ? OR lower(media_key) LIKE ?)');
        }
      }
      // Build a driver-specific expression to get the part of the email before '@'
      const emailLocalExpr = driver==='pg'
        ? "split_part(u.email,'@',1)"
        : "CASE WHEN instr(u.email,'@')>1 THEN substr(u.email,1,instr(u.email,'@')-1) ELSE '' END";

      let sql = `SELECT m.id, m.media_key as "mediaKey", m.user_id as "userId", m.category, m.title, m.active, m.created_at as "createdAt",
        COALESCE(NULLIF(u.username,''), NULLIF(${emailLocalExpr},'')) as "generatorUsername", u.email as "generatorEmail"
        FROM media m LEFT JOIN users u ON u.id = m.user_id`;
      if(where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY m.created_at DESC LIMIT 500';
      const r = await query(sql, params);
      res.json({ success:true, media: r.rows });
    }catch(e){ U.errorLog?.('ADMIN_MEDIA','list', e); res.status(500).json({ success:false,error:'Failed to list media'}); }
  });

  // Engagement counts for a batch of media keys
  router.post(`${basePath}/media/engagement-counts`, ensureAuth, ensureAdmin, async (req,res)=>{
    try{
      const keys = Array.isArray(req.body?.keys) ? req.body.keys.map(k=>String(k||'').trim()).filter(Boolean) : [];
      if(!keys.length) return res.json({ success:true, counts:{} });
      const driver = getDriver();
      const inPg = keys.map((_,i)=>`$${i+1}`).join(',');
      const inLite = keys.map(()=> '?').join(',');
      const likeSql = `SELECT media_key as key, COUNT(1) AS cnt FROM media_likes WHERE media_key IN (${driver==='pg'?inPg:inLite}) GROUP BY media_key`;
      const saveSql = `SELECT media_key as key, COUNT(1) AS cnt FROM media_saves WHERE media_key IN (${driver==='pg'?inPg:inLite}) GROUP BY media_key`;
      const [likes, saves] = await Promise.all([ query(likeSql, keys), query(saveSql, keys) ]);
      const lmap = Object.fromEntries((likes.rows||[]).map(r=>[String(r.key), Number(r.cnt)]));
      const smap = Object.fromEntries((saves.rows||[]).map(r=>[String(r.key), Number(r.cnt)]));
      const out = {}; for(const k of keys){ out[k] = { likes: lmap[k]||0, saves: smap[k]||0 }; }
      res.json({ success:true, counts: out });
    }catch(e){ U.errorLog?.('ADMIN_MEDIA','counts', e); res.status(500).json({ success:false,error:'Failed to load counts'}); }
  });

  // List usernames of users who liked a media item
  router.get(`${basePath}/media/likers`, ensureAuth, ensureAdmin, async (req,res)=>{
    try{
      const key = String(req.query.mediaKey||'').trim(); if(!key) return res.status(400).json({ success:false,error:'mediaKey required' });
      const driver = getDriver();
      const sql = driver==='pg'
        ? 'SELECT u.id, u.username, u.email FROM media_likes l JOIN users u ON u.id = l.user_id WHERE l.media_key=$1 ORDER BY u.username ASC LIMIT 500'
        : 'SELECT u.id, u.username, u.email FROM media_likes l JOIN users u ON u.id = l.user_id WHERE l.media_key=? ORDER BY u.username ASC LIMIT 500';
      const r = await query(sql, [key]);
      res.json({ success:true, users: r.rows });
    }catch(e){ U.errorLog?.('ADMIN_MEDIA','likers', e); res.status(500).json({ success:false,error:'Failed to load likers'}); }
  });

  // List usernames of users who saved a media item
  router.get(`${basePath}/media/savers`, ensureAuth, ensureAdmin, async (req,res)=>{
    try{
      const key = String(req.query.mediaKey||'').trim(); if(!key) return res.status(400).json({ success:false,error:'mediaKey required' });
      const driver = getDriver();
      const sql = driver==='pg'
        ? 'SELECT u.id, u.username, u.email FROM media_saves s JOIN users u ON u.id = s.user_id WHERE s.media_key=$1 ORDER BY u.username ASC LIMIT 500'
        : 'SELECT u.id, u.username, u.email FROM media_saves s JOIN users u ON u.id = s.user_id WHERE s.media_key=? ORDER BY u.username ASC LIMIT 500';
      const r = await query(sql, [key]);
      res.json({ success:true, users: r.rows });
    }catch(e){ U.errorLog?.('ADMIN_MEDIA','savers', e); res.status(500).json({ success:false,error:'Failed to load savers'}); }
  });

  // Batch media actions
  router.post(`${basePath}/media/actions`, ensureAuth, ensureAdmin, async (req,res)=>{
    try{
      const { action, ids, title, category } = req.body||{};
      if(!Array.isArray(ids) || ids.length===0) return res.status(400).json({ success:false,error:'No ids'});
      const placeholdersPg = ids.map((_,i)=> `$${i+1}`).join(',');
      const placeholdersSqlite = ids.map(()=> '?').join(',');
      const driver = getDriver();
      let done=0; let r;
      switch(action){
        case 'rename': {
          if(!title) return res.status(400).json({ success:false,error:'title required'});
          if(driver==='pg') r = await query(`UPDATE media SET title=$${ids.length+1} WHERE id IN (${placeholdersPg})`, [...ids, title]);
          else r = await query(`UPDATE media SET title=? WHERE id IN (${placeholdersSqlite})`, [title, ...ids]);
          break;
        }
        case 'deactivate': {
          if(driver==='pg') r = await query(`UPDATE media SET active=0 WHERE id IN (${placeholdersPg})`, ids);
          else r = await query(`UPDATE media SET active=0 WHERE id IN (${placeholdersSqlite})`, ids);
          break;
        }
        case 'activate': {
          if(driver==='pg') r = await query(`UPDATE media SET active=1 WHERE id IN (${placeholdersPg})`, ids);
          else r = await query(`UPDATE media SET active=1 WHERE id IN (${placeholdersSqlite})`, ids);
          break;
        }
        case 'delete': {
          if(driver==='pg') r = await query(`DELETE FROM media WHERE id IN (${placeholdersPg})`, ids);
          else r = await query(`DELETE FROM media WHERE id IN (${placeholdersSqlite})`, ids);
          break;
        }
        case 'set_category': {
          if(!category) return res.status(400).json({ success:false,error:'category required'});
          if(driver==='pg') r = await query(`UPDATE media SET category=$${ids.length+1} WHERE id IN (${placeholdersPg})`, [...ids, category]);
          else r = await query(`UPDATE media SET category=? WHERE id IN (${placeholdersSqlite})`, [category, ...ids]);
          break;
        }
        default: return res.status(400).json({ success:false,error:'Unknown action'});
      }
      done = r?.rowCount ?? r?.changes ?? 0;
      res.json({ success:true, action, affected: done });
    }catch(e){ U.errorLog?.('ADMIN_MEDIA','actions', e); res.status(500).json({ success:false,error:'Action failed'}); }
  });

  return router;
}

export default { buildAdminMediaRouter };