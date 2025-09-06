import express from 'express';
import { query, getDriver } from '../db/db.js';

function defaultUtils(){
  return { success:(d,m='OK')=>({success:true,data:d,message:m}), error:(e)=>({success:false,error:e}), infoLog:()=>{}, errorLog:()=>{} };
}

export function buildAdminSettingsRouter(options={}){
  const { utils = defaultUtils(), requireAuth, requireAdmin, basePath='/admin' } = options;
  const U = utils || defaultUtils();
  const router = express.Router();
  const ensureAuth = requireAuth || ((req,res,next)=> req.session?.user?.id ? next() : res.status(401).json({ success:false,error:'Not authenticated'}));
  const ensureAdmin = requireAdmin || ((req,res,next)=>{ const u=req.session?.user; if(!u|| (u.role!=='admin' && u.role!=='superadmin')) return res.status(403).json({ success:false,error:'Forbidden'}); next(); });

  // GET settings
  router.get(`${basePath}/settings`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      const r = await query('SELECT key,value FROM settings');
      const out={}; for(const row of r.rows) out[row.key] = row.value;
      res.json({ success:true, settings: out });
    } catch(e){ U.errorLog?.('ADMIN_SETTINGS','get', e); res.status(500).json({ success:false,error:'Failed to load settings'}); }
  });

  // Batch update settings
  router.post(`${basePath}/settings`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      const updates = req.body || {};
      const entries = Object.entries(updates).slice(0,100);
      for(const [k,v] of entries){
        if(getDriver()==='pg'){
          await query('INSERT INTO settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()', [k, String(v)]);
        } else {
          await query('INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime("now")) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime("now")', [k, String(v)]);
        }
      }
      res.json({ success:true, updated: entries.length });
    } catch(e){ U.errorLog?.('ADMIN_SETTINGS','set', e); res.status(500).json({ success:false,error:'Failed to update settings'}); }
  });

  return router;
}

export default { buildAdminSettingsRouter };