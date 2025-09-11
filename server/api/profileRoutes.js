import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query } from '../db/db.js';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';

function defaultUtils(){
  return {
    createSuccessResponse: (data, message='OK') => ({ success:true, data, message }),
    createErrorResponse: (error, code='ERR') => ({ success:false, error, code }),
    debugLog: ()=>{}, infoLog: ()=>{}, errorLog: ()=>{}
  };
}

export function buildProfileRouter(options={}){
  const { utils = defaultUtils(), avatarsDir: customAvatarsDir, siteTitle = process.env.SITE_TITLE || 'App' } = options;
  const U = utils || defaultUtils();
  const router = express.Router();

  // Helpers
  function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
    return `${salt}:${hash}`;
  }
  function verifyPassword(password, stored) {
    try {
      const [salt, hash] = String(stored).split(':');
      const check = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
    } catch { return false; }
  }
  const normEmail = (e)=>String(e||'').trim().toLowerCase();
  const validEmail=(e)=>/.+@.+\..+/.test(normEmail(e));
  const validPassword=(p)=>String(p||'').length>=6;
  function ensureAuth(req,res,next){ if(!req.session?.user?.id) return res.status(401).json(U.createErrorResponse('Not authenticated')); next(); }

  // Avatar storage
  const avatarsDir = customAvatarsDir || path.resolve(process.cwd(), 'avatars');
  try { fs.mkdirSync(avatarsDir,{recursive:true}); } catch (e) { /* ignore mkdir race */ }
  const storage = multer.diskStorage({
    destination: (req,file,cb)=> cb(null, avatarsDir),
    filename: (req,file,cb)=>{ const ext = path.extname(file.originalname||'')||'.png'; cb(null, `u${req.session?.user?.id||'anon'}_${Date.now()}${ext}`); }
  });
  const upload = multer({ storage, limits:{ fileSize: Number(process.env.MAX_FILE_SIZE_BYTES || 2*1024*1024) } });

  // Profile GET
  router.get('/profile', async (req,res)=>{
    try {
      const uid = req.session?.user?.id;
      if(!uid) return res.json(U.createSuccessResponse({ username:'Anonymous', bio:'No bio yet.', mfaEnabled:false }, 'Profile retrieved'));
      const { rows } = await query('SELECT id,email,username,bio,avatar_url,mfa_enabled FROM users WHERE id=$1',[uid]);
      const u = rows?.[0];
      if(!u) return res.json(U.createSuccessResponse({ username:'Anonymous', bio:'No bio yet.', mfaEnabled:false }, 'Profile retrieved'));
      const profile = { id:u.id, email:u.email, username:u.username||'Anonymous', bio:u.bio||'', profilePicture: u.avatar_url || '/images/default-avatar.png', mfaEnabled: !!u.mfa_enabled };
      return res.json(U.createSuccessResponse(profile,'Profile retrieved'));
    }catch(e){ U.errorLog?.('PROFILE','get','Failed', e); return res.status(500).json(U.createErrorResponse('Failed to load profile')); }
  });

  // Profile update
  router.put('/profile', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id;
      const { username, email, bio } = req.body||{};
      const fields=[]; const values=[];
      if(typeof username==='string'){
        const nu = (username||'').trim();
        if(nu.toLowerCase()==='anonymous') return res.status(400).json(U.createErrorResponse('Username not allowed'));
        fields.push('username'); values.push(nu);
      }
      if(typeof bio==='string'){ fields.push('bio'); values.push(bio.trim()); }
      if(typeof email==='string'){
        const e = normEmail(email); if(!validEmail(e)) return res.status(400).json(U.createErrorResponse('Invalid email'));
        const { rows: existing } = await query('SELECT id FROM users WHERE email=$1 AND id<>$2',[e, uid]);
        if(existing && existing.length) return res.status(409).json(U.createErrorResponse('Email already in use'));
        fields.push('email'); values.push(e);
      }
      if(!fields.length) return res.json(U.createSuccessResponse({},'No changes'));
      const sets = fields.map((f,i)=>`${f}=$${i+1}`).join(', ');
      await query(`UPDATE users SET ${sets} WHERE id=$${fields.length+1}`,[...values, uid]);
      if(fields.includes('email')) req.session.user.email = values[fields.indexOf('email')];
      return res.json(U.createSuccessResponse({},'Profile updated'));
    }catch(e){ U.errorLog?.('PROFILE','update','Failed',e); return res.status(500).json(U.createErrorResponse('Failed to update profile')); }
  });

  // Change password
  router.post('/profile/password', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id;
      const { currentPassword, newPassword } = req.body||{};
      if(!validPassword(newPassword)) return res.status(400).json(U.createErrorResponse('New password too short'));
      const { rows } = await query('SELECT password_hash FROM users WHERE id=$1',[uid]);
      const row = rows?.[0];
      if(!row || !verifyPassword(currentPassword||'', row.password_hash)) return res.status(401).json(U.createErrorResponse('Current password incorrect'));
      const pw = hashPassword(newPassword);
      await query('UPDATE users SET password_hash=$1 WHERE id=$2',[pw, uid]);
      return res.json(U.createSuccessResponse({},'Password updated'));
    }catch(e){ U.errorLog?.('PROFILE','password','Failed',e); return res.status(500).json(U.createErrorResponse('Failed to change password')); }
  });

  // Upload avatar
  router.post('/profile/avatar', ensureAuth, upload.single('avatar'), async (req,res)=>{
    try {
      if(!req.file) return res.status(400).json(U.createErrorResponse('No file uploaded'));
      const uid = req.session.user.id;
      const rel = `/images/avatars/${req.file.filename}`;
      await query('UPDATE users SET avatar_url=$1 WHERE id=$2',[rel, uid]);
      return res.json(U.createSuccessResponse({ profilePicture: rel }, 'Avatar updated'));
    }catch(e){ U.errorLog?.('PROFILE','avatar','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });

  // MFA TOTP flows
  router.get('/security/totp/initiate', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id;
      const secret = authenticator.generateSecret();
      const label = `${siteTitle}:${req.session.user.email || 'user'}`;
      const otpauth = authenticator.keyuri(label, siteTitle, secret);
      const qr = await qrcode.toDataURL(otpauth);
      req.session.pendingTotp = { uid, secret };
      return res.json(U.createSuccessResponse({ otpauth, qr }, 'TOTP initiated'));
    }catch(e){ U.errorLog?.('PROFILE','totp:init','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });
  router.post('/security/totp/verify', ensureAuth, async (req,res)=>{
    try {
      const { token } = req.body||{}; const pend = req.session.pendingTotp;
      if(!pend || pend.uid !== req.session.user.id) return res.status(400).json(U.createErrorResponse('No pending setup'));
      const ok = authenticator.check(String(token||''), pend.secret);
      if(!ok) return res.status(400).json(U.createErrorResponse('Invalid code'));
      await query('UPDATE users SET totp_secret=$1, mfa_enabled=$2 WHERE id=$3',[pend.secret, true, pend.uid]);
      delete req.session.pendingTotp;
      return res.json(U.createSuccessResponse({ enabled:true }, 'MFA enabled'));
    }catch(e){ U.errorLog?.('PROFILE','totp:verify','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });
  router.post('/security/totp/disable', ensureAuth, async (req,res)=>{
    try {
      const uid = req.session.user.id; const { currentPassword } = req.body||{};
      const { rows } = await query('SELECT password_hash FROM users WHERE id=$1',[uid]);
      const row = rows?.[0];
      if(!row || !verifyPassword(currentPassword||'', row.password_hash)) return res.status(401).json(U.createErrorResponse('Current password incorrect'));
      await query('UPDATE users SET totp_secret=NULL, mfa_enabled=$1 WHERE id=$2',[false, uid]);
      return res.json(U.createSuccessResponse({ enabled:false }, 'MFA disabled'));
    }catch(e){ U.errorLog?.('PROFILE','totp:disable','Failed',e); return res.status(500).json(U.createErrorResponse('Failed')); }
  });

  return router;
}

export default { buildProfileRouter };
