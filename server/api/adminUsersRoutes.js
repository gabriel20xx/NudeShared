import express from 'express';
import { query, getDriver } from '../db/db.js';

function defaultUtils(){
  return { success:(d,m='OK')=>({success:true,data:d,message:m}), error:(e)=>({success:false,error:e}), infoLog:()=>{}, errorLog:()=>{} };
}

export function buildAdminUsersRouter(options={}) {
  const { utils = defaultUtils(), requireAuth, requireAdmin, basePath='/admin' } = options;
  const U = utils || defaultUtils();
  const router = express.Router();
  const ensureAuth = requireAuth || ((req,res,next)=> req.session?.user?.id ? next() : res.status(401).json({ success:false, error:'Not authenticated'}));
  const ensureAdmin = requireAdmin || ((req,res,next)=>{ const u=req.session?.user; if(!u|| (u.role!=='admin' && u.role!=='superadmin')) return res.status(403).json({ success:false,error:'Forbidden'}); next(); });
  const driver = getDriver();

  // Users list with search filter
  router.get(`${basePath}/users`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      const search = (req.query.search||'').toString().trim().toLowerCase();
      const params=[];
      let where = '';
      if(search){
        if(driver==='pg'){ const term = `%${search}%`; params.push(term, term); where = 'WHERE (lower(email) LIKE $1 OR lower(username) LIKE $2)'; }
        else { const term = `%${search}%`; params.push(term, term); where = 'WHERE (lower(email) LIKE ? OR lower(username) LIKE ?)'; }
      }
      // Base user fields
      const baseSql = `SELECT id,email,username,role,disabled,mfa_enabled as "mfaEnabled",created_at as "createdAt", last_login_at as "lastLoginAt" FROM users ${where} ORDER BY id DESC LIMIT 500`;
      const result = await query(baseSql, params);
      const users = result.rows || [];
      if(!users.length) return res.json({ success:true, users: [] });
      // Fetch counts for media/likes/saves in batch
      const ids = users.map(u=>u.id);
      const inPg = ids.map((_,i)=>`$${i+1}`).join(',');
      const inLite = ids.map(()=>'?').join(',');
      const likeSql = `SELECT user_id as id, COUNT(1) as cnt FROM media_likes WHERE user_id IN (${driver==='pg'?inPg:inLite}) GROUP BY user_id`;
      const saveSql = `SELECT user_id as id, COUNT(1) as cnt FROM media_saves WHERE user_id IN (${driver==='pg'?inPg:inLite}) GROUP BY user_id`;
      const genSql  = `SELECT user_id as id, COUNT(1) as cnt FROM media WHERE user_id IN (${driver==='pg'?inPg:inLite}) GROUP BY user_id`;
      const [likes, saves, gens] = await Promise.all([
        query(likeSql, ids), query(saveSql, ids), query(genSql, ids)
      ]);
      const lmap = Object.fromEntries((likes.rows||[]).map(r=>[Number(r.id), Number(r.cnt)]));
      const smap = Object.fromEntries((saves.rows||[]).map(r=>[Number(r.id), Number(r.cnt)]));
      const gmap = Object.fromEntries((gens.rows||[]).map(r=>[Number(r.id), Number(r.cnt)]));
      const out = users.map(u=>({ ...u,
        likedCount: lmap[u.id]||0,
        savedCount: smap[u.id]||0,
        generatedCount: gmap[u.id]||0
      }));
      res.json({ success:true, users: out });
    }catch(e){ U.errorLog?.('ADMIN_USERS','list', e); res.status(500).json({ success:false, error:'Failed to list users'}); }
  });

  // Update a single user's fields (username/email/role)
  router.post(`${basePath}/users/:id/update`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      const id = Number(req.params.id); if(!Number.isFinite(id)) return res.status(400).json({ success:false, error:'Invalid id' });
      const { username, email, role } = req.body || {};
      const sets=[]; const params=[];
      if(typeof email === 'string'){ sets.push('email = ' + (driver==='pg'?`$${params.length+1}`:'?')); params.push(email.trim().toLowerCase()); }
      if(typeof username === 'string'){ sets.push('username = ' + (driver==='pg'?`$${params.length+1}`:'?')); params.push(username.trim()); }
      if(typeof role === 'string'){ sets.push('role = ' + (driver==='pg'?`$${params.length+1}`:'?')); params.push(role.trim()); }
      if(!sets.length) return res.json({ success:true, updated:0 });
      params.push(id);
      const sql = `UPDATE users SET ${sets.join(', ')} WHERE id = ${driver==='pg'?`$${params.length}`:'?'}`;
      const r = await query(sql, params);
      res.json({ success:true, updated: r.rowCount ?? r.changes ?? 0 });
    } catch(e){ U.errorLog?.('ADMIN_USERS','update', e); res.status(500).json({ success:false, error:'Update failed' }); }
  });

  // User media summary
  router.get(`${basePath}/users/:id/media`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      const id = Number(req.params.id); if(!Number.isFinite(id)) return res.status(400).json({ success:false,error:'Invalid id'});
      const liked = await query('SELECT media_key as "mediaKey", created_at as "createdAt" FROM media_likes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200',[id]);
      const saved = await query('SELECT media_key as "mediaKey", created_at as "createdAt" FROM media_saves WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200',[id]);
      const generated = await query('SELECT media_key as "mediaKey", created_at as "createdAt" FROM media WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200',[id]);
      res.json({ success:true, liked: liked.rows, saved: saved.rows, generated: generated.rows });
    }catch(e){ U.errorLog?.('ADMIN_USERS','media', e); res.status(500).json({ success:false,error:'Failed to load user media'}); }
  });

  // Batch user actions
  router.post(`${basePath}/users/actions`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      const { action, ids, role, permissions } = req.body || {};
      if(!Array.isArray(ids) || ids.length===0) return res.status(400).json({ success:false,error:'No ids'});
      const placeholdersPg = ids.map((_,i)=>`$${i+1}`).join(',');
      const placeholdersLite = ids.map(()=>'?').join(',');
      let r; let affected=0;
      switch(action){
        case 'disable': {
          r = driver==='pg' ? await query(`UPDATE users SET disabled=1 WHERE id IN (${placeholdersPg})`, ids)
                             : await query(`UPDATE users SET disabled=1 WHERE id IN (${placeholdersLite})`, ids);
          break;
        }
        case 'enable': {
          r = driver==='pg' ? await query(`UPDATE users SET disabled=0 WHERE id IN (${placeholdersPg})`, ids)
                             : await query(`UPDATE users SET disabled=0 WHERE id IN (${placeholdersLite})`, ids);
          break;
        }
        case 'delete': {
          r = driver==='pg' ? await query(`DELETE FROM users WHERE id IN (${placeholdersPg})`, ids)
                             : await query(`DELETE FROM users WHERE id IN (${placeholdersLite})`, ids);
          break;
        }
        case 'reset_mfa': {
          r = driver==='pg' ? await query(`UPDATE users SET totp_secret=NULL, mfa_enabled=0 WHERE id IN (${placeholdersPg})`, ids)
                             : await query(`UPDATE users SET totp_secret=NULL, mfa_enabled=0 WHERE id IN (${placeholdersLite})`, ids);
          break;
        }
        case 'reset_password': {
          r = driver==='pg' ? await query(`UPDATE users SET password_hash='*reset*', password_reset_token=NULL WHERE id IN (${placeholdersPg})`, ids)
                             : await query(`UPDATE users SET password_hash='*reset*', password_reset_token=NULL WHERE id IN (${placeholdersLite})`, ids);
          break;
        }
        case 'change_role': {
          if(!role) return res.status(400).json({ success:false,error:'role required'});
          r = driver==='pg' ? await query(`UPDATE users SET role=$${ids.length+1} WHERE id IN (${placeholdersPg})`, [...ids, role])
                             : await query(`UPDATE users SET role=? WHERE id IN (${placeholdersLite})`, [role, ...ids]);
          break;
        }
        case 'set_permissions': {
          const permStr = JSON.stringify(permissions||{});
            r = driver==='pg' ? await query(`UPDATE users SET permissions=$${ids.length+1} WHERE id IN (${placeholdersPg})`, [...ids, permStr])
                               : await query(`UPDATE users SET permissions=? WHERE id IN (${placeholdersLite})`, [permStr, ...ids]);
          break;
        }
        default: return res.status(400).json({ success:false,error:'Unknown action'});
      }
      affected = r?.rowCount ?? r?.changes ?? 0;
      res.json({ success:true, action, affected });
    }catch(e){ U.errorLog?.('ADMIN_USERS','actions', e); res.status(500).json({ success:false,error:'Action failed'}); }
  });

  return router;
}

export default { buildAdminUsersRouter };