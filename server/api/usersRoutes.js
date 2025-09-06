import express from 'express';
import { query, getDriver } from '../db/db.js';

function defaultUtils(){
  return { success:(d,m='OK')=>({success:true,data:d,message:m}), error:(e)=>({success:false,error:e}), infoLog:()=>{}, errorLog:()=>{} };
}

function makePlaceholder(i){ return getDriver()==='pg' ? `$${i}` : '?'; }

export function buildUsersAdminRouter(options={}){
  const { utils = defaultUtils(), requireAuth, requireAdmin, basePath='/admin' } = options;
  const U = utils || defaultUtils();
  const router = express.Router();
  const ensureAuth = requireAuth || ((req,res,next)=> req.session?.user?.id ? next() : res.status(401).json({ success:false, error:'Not authenticated'}));
  const ensureAdmin = requireAdmin || ((req,res,next)=>{ const u=req.session?.user; if(!u|| (u.role!=='admin' && u.role!=='superadmin')) return res.status(403).json({ success:false,error:'Forbidden'}); next(); });

  // Users list
  router.get(`${basePath}/users`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      const search = (req.query.search||'').toString().trim().toLowerCase();
      let sql = 'SELECT id,email,username,role,disabled,mfa_enabled as "mfaEnabled",created_at as "createdAt" FROM users';
      const params=[];
      if(search){
        if(getDriver()==='pg'){
          sql += ' WHERE (lower(email) LIKE $1 OR lower(username) LIKE $2)';
          const term = `%${search}%`; params.push(term, term);
        } else {
          sql += ' WHERE (lower(email) LIKE ? OR lower(username) LIKE ?)';
          const term = `%${search}%`; params.push(term, term);
        }
      }
      sql += getDriver()==='pg'? ' ORDER BY id DESC LIMIT 500' : ' ORDER BY id DESC LIMIT 500';
      const result = await query(sql, params);
      res.json({ success:true, users: result.rows });
    }catch(e){ U.errorLog?.('USERS','list',e); res.status(500).json({ success:false, error:'Failed to list users' }); }
  });

  // Media summary for user
  router.get(`${basePath}/users/:id/media`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      const id = Number(req.params.id); if(!Number.isFinite(id)) return res.status(400).json({ success:false,error:'Invalid id'});
      const liked = await query('SELECT media_key as "mediaKey", created_at as "createdAt" FROM media_likes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200',[id]);
      const saved = await query('SELECT media_key as "mediaKey", created_at as "createdAt" FROM media_saves WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200',[id]);
      const generated = await query('SELECT media_key as "mediaKey", created_at as "createdAt" FROM media WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200',[id]);
      res.json({ success:true, liked: liked.rows, saved: saved.rows, generated: generated.rows });
    }catch(e){ U.errorLog?.('USERS','media', e); res.status(500).json({ success:false,error:'Failed to load user media'}); }
  });

  return router;
}

export default { buildUsersAdminRouter };
