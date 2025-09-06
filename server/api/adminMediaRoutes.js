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
      const cat = (req.query.category||'').toString().trim();
      const search = (req.query.search||'').toString().trim().toLowerCase();
      const params=[]; const where=[];
      if(cat){
        if(getDriver()==='pg'){ params.push(cat); where.push(`category = $${params.length}`); }
        else { params.push(cat); where.push('category = ?'); }
      }
      if(search){
        if(getDriver()==='pg'){
          const term = `%${search}%`; params.push(term); params.push(term); where.push(`(lower(title) LIKE $${params.length-1} OR lower(media_key) LIKE $${params.length})`);
        } else {
          const term = `%${search}%`; params.push(term, term); where.push('(lower(title) LIKE ? OR lower(media_key) LIKE ?)');
        }
      }
      let sql = 'SELECT id, media_key as "mediaKey", user_id as "userId", category, title, active, created_at as "createdAt" FROM media';
      if(where.length) sql += ' WHERE ' + where.join(' AND ');
      sql += ' ORDER BY created_at DESC LIMIT 500';
      const r = await query(sql, params);
      res.json({ success:true, media: r.rows });
    }catch(e){ U.errorLog?.('ADMIN_MEDIA','list', e); res.status(500).json({ success:false,error:'Failed to list media'}); }
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