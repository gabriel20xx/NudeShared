import express from 'express';
import { query, getDriver } from '../db/db.js';

function defaultUtils(){
  return { success:(d,m='OK')=>({success:true,data:d,message:m}), error:(e)=>({success:false,error:e}), infoLog:()=>{}, errorLog:()=>{} };
}

export function buildAdminMediaRouter(options={}) {
  const { utils = defaultUtils(), requireAuth, requireAdmin, basePath='/admin' } = options;
  const U = utils || defaultUtils(); // Intentional use; kept (rename to _U if remains unused later)
  const router = express.Router();
  // Simple in-memory cache (process scoped) for lightweight analytics endpoints
  const _cache = new Map(); // key -> { exp:number, data:any }
  const CACHE_TTL_MS = 60_000; // 60s
  function cacheKey(req){
    // Exclude nocache param
    const url = new URL(req.protocol + '://' + (req.get?.('host')||'local') + req.originalUrl);
    url.searchParams.delete('nocache');
    return url.pathname + '?' + url.searchParams.toString();
  }
  function getCached(req){
    const key = cacheKey(req);
    const entry = _cache.get(key);
    if(entry && Date.now() < entry.exp) return entry.data;
    if(entry) _cache.delete(key);
    return null;
  }
  function setCached(req, data){
    const key = cacheKey(req);
    _cache.set(key, { exp: Date.now()+CACHE_TTL_MS, data });
  }
  const ensureAuth = requireAuth || ((req,res,next)=> req.session?.user?.id ? next() : res.status(401).json({ success:false, error:'Not authenticated'}));
  const ensureAdmin = requireAdmin || ((req,res,next)=>{ const u=req.session?.user; if(!u|| (u.role!=='admin' && u.role!=='superadmin')) return res.status(403).json({ success:false,error:'Forbidden'}); next(); });

  // Media listing with optional tag (or legacy category) & search filters
  router.get(`${basePath}/media`, ensureAuth, ensureAdmin, async (req,res)=>{
    try{
      U.infoLog?.('ADMIN_MEDIA','list_start',{ tag:req.query.tag, tagMode:req.query.tagMode, search:req.query.search });
      const driver = getDriver();
  const tagFilterRaw = (req.query.tag || req.query.tags || '').toString().trim();
  const tagMode = (req.query.tagMode||'any').toString().toLowerCase(); // 'any' (default) or 'all'
      const catLegacy = (req.query.category||'').toString().trim(); // transitional
      const tagFilter = tagFilterRaw || '';
      const search = (req.query.search||'').toString().trim().toLowerCase();
      const params=[]; const where=[];
      // Legacy single category equality still supported while migrating to tags
      if(catLegacy){
        if(driver==='pg'){ params.push(catLegacy); where.push(`category = $${params.length}`); }
        else { params.push(catLegacy); where.push('category = ?'); }
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
      let rows = r.rows;
      // Attach tags aggregation
      if(rows.length){
        const ids = rows.map(m=> m.id);
        const inPg = ids.map((_,i)=> `$${i+1}`).join(',');
        const inLite = ids.map(()=> '?').join(',');
        const tagSql = `SELECT media_id as mid, tag FROM media_tags WHERE media_id IN (${driver==='pg'?inPg:inLite})`;
        const tr = await query(tagSql, ids);
        const tagMap = {};
        for(const t of tr.rows){ if(!tagMap[t.mid]) tagMap[t.mid]=[]; tagMap[t.mid].push(t.tag); }
        rows = rows.map(m=> ({ ...m, tags: tagMap[m.id]||[] }));
        // Apply tagFilter (comma or space separated) after fetching if provided
        if(tagFilter){
          const wanted = Array.from(new Set(tagFilter.split(/[ ,]+/).map(s=> s.trim().toLowerCase()).filter(Boolean)));
          if(wanted.length){
            rows = rows.filter(m=> {
              const mtags = (m.tags||[]).map(t=> t.toLowerCase());
              if(tagMode === 'all') return wanted.every(w=> mtags.includes(w));
              return wanted.some(w=> mtags.includes(w)); // default ANY
            });
          }
        }
      }
      res.json({ success:true, media: rows });
      U.infoLog?.('ADMIN_MEDIA','list_success',{ count: rows.length });
    }catch(e){ U.errorLog?.('ADMIN_MEDIA','list', e); res.status(500).json({ success:false,error:'Failed to list media'}); }
  });

  // Engagement counts for a batch of media keys
  router.post(`${basePath}/media/engagement-counts`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      U.infoLog?.('ADMIN_MEDIA','counts_start',{ keys: Array.isArray(req.body?.keys)? req.body.keys.length : 0 });
      const keys = Array.isArray(req.body?.keys) ? req.body.keys.map(k=>String(k||'').trim()).filter(Boolean) : [];
      if(!keys.length) return res.json({ success:true, counts:{} });
      const driver = getDriver();
      const inPg = keys.map((_,i)=>`$${i+1}`).join(',');
      const inLite = keys.map(()=> '?').join(',');
  const likeSql = `SELECT media_key as key, COUNT(1) AS cnt FROM media_likes WHERE media_key IN (${driver==='pg'?inPg:inLite}) GROUP BY media_key`;
  const saveSql = `SELECT media_key as key, COUNT(1) AS cnt FROM media_saves WHERE media_key IN (${driver==='pg'?inPg:inLite}) GROUP BY media_key`;
  const viewSql = `SELECT media_key as key, COUNT(1) AS cnt FROM media_views WHERE media_key IN (${driver==='pg'?inPg:inLite}) GROUP BY media_key`;
  const downloadSql = `SELECT media_key as key, COUNT(1) AS cnt FROM media_downloads WHERE media_key IN (${driver==='pg'?inPg:inLite}) GROUP BY media_key`;
  const [likes, saves, views, downloads] = await Promise.all([ query(likeSql, keys), query(saveSql, keys), query(viewSql, keys), query(downloadSql, keys) ]);
      const mapFrom = (rows)=> Object.fromEntries((rows.rows||[]).map(r=>[String(r.key), Number(r.cnt)]));
      const lmap = mapFrom(likes);
      const smap = mapFrom(saves);
  const vmap = mapFrom(views);
  const dmap = mapFrom(downloads);
  const out = {}; for(const k of keys){ out[k] = { likes: lmap[k]||0, saves: smap[k]||0, views: vmap[k]||0, downloads: dmap[k]||0 }; }
      res.json({ success:true, counts: out });
      U.infoLog?.('ADMIN_MEDIA','counts_success',{ keys: Object.keys(out).length });
    } catch(e){ U.errorLog?.('ADMIN_MEDIA','counts', e); res.status(500).json({ success:false,error:'Failed to load counts'}); }
  });

  // List usernames of users who liked a media item
  router.get(`${basePath}/media/likers`, ensureAuth, ensureAdmin, async (req,res)=>{
    try{
      U.infoLog?.('ADMIN_MEDIA','likers_start',{ mediaKey: req.query.mediaKey });
      const key = String(req.query.mediaKey||'').trim(); if(!key) return res.status(400).json({ success:false,error:'mediaKey required' });
      const driver = getDriver();
      const sql = driver==='pg'
        ? 'SELECT u.id, u.username, u.email FROM media_likes l JOIN users u ON u.id = l.user_id WHERE l.media_key=$1 ORDER BY u.username ASC LIMIT 500'
        : 'SELECT u.id, u.username, u.email FROM media_likes l JOIN users u ON u.id = l.user_id WHERE l.media_key=? ORDER BY u.username ASC LIMIT 500';
      const r = await query(sql, [key]);
      res.json({ success:true, users: r.rows });
      U.infoLog?.('ADMIN_MEDIA','likers_success',{ mediaKey: key, users: r.rows.length });
    }catch(e){ U.errorLog?.('ADMIN_MEDIA','likers', e); res.status(500).json({ success:false,error:'Failed to load likers'}); }
  });

  // List usernames of users who saved a media item
  router.get(`${basePath}/media/savers`, ensureAuth, ensureAdmin, async (req,res)=>{
    try{
      U.infoLog?.('ADMIN_MEDIA','savers_start',{ mediaKey: req.query.mediaKey });
      const key = String(req.query.mediaKey||'').trim(); if(!key) return res.status(400).json({ success:false,error:'mediaKey required' });
      const driver = getDriver();
      const sql = driver==='pg'
        ? 'SELECT u.id, u.username, u.email FROM media_saves s JOIN users u ON u.id = s.user_id WHERE s.media_key=$1 ORDER BY u.username ASC LIMIT 500'
        : 'SELECT u.id, u.username, u.email FROM media_saves s JOIN users u ON u.id = s.user_id WHERE s.media_key=? ORDER BY u.username ASC LIMIT 500';
      const r = await query(sql, [key]);
      res.json({ success:true, users: r.rows });
      U.infoLog?.('ADMIN_MEDIA','savers_success',{ mediaKey: key, users: r.rows.length });
    }catch(e){ U.errorLog?.('ADMIN_MEDIA','savers', e); res.status(500).json({ success:false,error:'Failed to load savers'}); }
  });

  // Batch media actions
  router.post(`${basePath}/media/actions`, ensureAuth, ensureAdmin, async (req,res)=>{
    try{
      U.infoLog?.('ADMIN_MEDIA','actions_start',{ action: req.body?.action, ids: Array.isArray(req.body?.ids)? req.body.ids.length:0 });
  const { action, ids, title, tags } = req.body||{}; // removed unused legacy category field
      if(!Array.isArray(ids) || ids.length===0) return res.status(400).json({ success:false,error:'No ids'});
      const placeholdersPg = ids.map((_,i)=> `$${i+1}`).join(',');
      const placeholdersSqlite = ids.map(()=> '?').join(',');
      const driver = getDriver();
      let done=0; let r;
      const parseTags = (val)=>{
        if(!val) return [];
        return Array.from(new Set(String(val).split(/[ ,]+/).map(s=> s.trim().toLowerCase()).filter(Boolean).map(s=> s.slice(0,40))));
      };
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
        case 'add_tags': {
          const tagList = parseTags(tags);
          if(!tagList.length) return res.status(400).json({ success:false,error:'tags required'});
          // Insert ignore duplicates
          let inserted = 0;
          for(const mid of ids){
            for(const tg of tagList){
              try {
                if(driver==='pg') await query('INSERT INTO media_tags (media_id, tag) VALUES ($1,$2) ON CONFLICT DO NOTHING', [mid, tg]);
                else await query('INSERT OR IGNORE INTO media_tags (media_id, tag) VALUES (?,?)', [mid, tg]);
                inserted++;
              } catch {/* ignore */}
            }
          }
          done = inserted; r = { rowCount: inserted };
          break;
        }
        case 'remove_tags': {
          const tagList = parseTags(tags);
          if(!tagList.length) return res.status(400).json({ success:false,error:'tags required'});
          // paramsBase removed (unused legacy variable)
          if(driver==='pg'){
            const idParams = ids.map((_,i)=> `$${i+1}`).join(',');
            const tagParams = tagList.map((_,i)=> `$${ids.length + i + 1}`).join(',');
            r = await query(`DELETE FROM media_tags WHERE media_id IN (${idParams}) AND tag IN (${tagParams})`, [...ids, ...tagList]);
          } else {
            const idMarks = ids.map(()=> '?').join(',');
            const tagMarks = tagList.map(()=> '?').join(',');
            r = await query(`DELETE FROM media_tags WHERE media_id IN (${idMarks}) AND tag IN (${tagMarks})`, [...ids, ...tagList]);
          }
          break;
        }
        case 'replace_tags': {
          const tagList = parseTags(tags);
            // Delete existing tags for those media ids then add new set (if any)
          if(driver==='pg') await query(`DELETE FROM media_tags WHERE media_id IN (${placeholdersPg})`, ids);
          else await query(`DELETE FROM media_tags WHERE media_id IN (${placeholdersSqlite})`, ids);
          let inserted = 0;
          for(const mid of ids){
            for(const tg of tagList){
              try {
                if(driver==='pg') await query('INSERT INTO media_tags (media_id, tag) VALUES ($1,$2) ON CONFLICT DO NOTHING', [mid, tg]);
                else await query('INSERT OR IGNORE INTO media_tags (media_id, tag) VALUES (?,?)', [mid, tg]);
                inserted++;
              } catch {/* ignore */}
            }
          }
          r = { rowCount: inserted };
          break;
        }
        default: return res.status(400).json({ success:false,error:'Unknown action'});
      }
      done = r?.rowCount ?? r?.changes ?? 0;
      res.json({ success:true, action, affected: done });
      U.infoLog?.('ADMIN_MEDIA','actions_success',{ action, affected: done });
    }catch(e){ U.errorLog?.('ADMIN_MEDIA','actions', e); res.status(500).json({ success:false,error:'Action failed'}); }
  });

  // Category usage audit (legacy deprecation support)
  // Returns remaining non-null category count and up to top 10 distinct categories (name + usage count)
  // Intentionally read-only; helps determine readiness for full column removal.
  router.get(`${basePath}/schema/category-usage`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      U.infoLog?.('ADMIN_MEDIA','category_usage_start');
      const { rows: remain } = await query(`SELECT COUNT(1) AS c FROM media WHERE category IS NOT NULL AND category <> ''`);
      const { rows: distinct } = await query(`SELECT category, COUNT(1) AS uses FROM media WHERE category IS NOT NULL AND category <> '' GROUP BY category ORDER BY uses DESC LIMIT 10`);
      const payload = { success:true, remaining: Number(remain?.[0]?.c||0), distinct: distinct.map(r=> ({ category: r.category, uses: Number(r.uses) })) };
      res.json(payload);
      U.infoLog?.('ADMIN_MEDIA','category_usage_success',{ remaining: payload.remaining, distinct: payload.distinct.length });
    } catch(e){
      U.errorLog?.('ADMIN_MEDIA','category_usage', e); res.status(500).json({ success:false,error:'Failed to load category usage'});
    }
  });

  // Tag suggestions endpoint: returns top N tags ordered by frequency desc, then alphabetically for ties
  router.get(`${basePath}/media/tags/suggestions`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      if(!('nocache' in req.query)){
        const c = getCached(req); if(c){ return res.json(c); }
      }
      U.infoLog?.('ADMIN_MEDIA','tag_suggestions_start',{ limit: req.query.limit });
      let limit = Number(req.query.limit || 20);
      if(!Number.isFinite(limit) || limit <= 0) limit = 20;
      if(limit > 200) limit = 200; // hard cap
      // Use aggregated query across media_tags
      const sql = `SELECT tag, COUNT(1) AS uses FROM media_tags GROUP BY tag ORDER BY uses DESC, tag ASC LIMIT ${limit}`; // safe limit interpolation (validated numeric bounds above)
      const { rows } = await query(sql, []);
      const out = { success:true, tags: rows.map(r=> ({ tag: r.tag, uses: Number(r.uses) })), cached: false };
      if(!('nocache' in req.query)) setCached(req, { ...out, cached:true });
      res.json(out);
      U.infoLog?.('ADMIN_MEDIA','tag_suggestions_success',{ count: out.tags.length, cached: out.cached });
    } catch(e){
      U.errorLog?.('ADMIN_MEDIA','tag_suggestions', e); res.status(500).json({ success:false,error:'Failed to load tag suggestions'});
    }
  });

  // Tag co-occurrence endpoint: returns top tag pairs by joint usage with basic association metrics
  // Response: { success:true, pairs:[{ a, b, count, jaccard, lift }] }
  router.get(`${basePath}/media/tags/cooccurrence`, ensureAuth, ensureAdmin, async (req,res)=> {
    try {
      if(!('nocache' in req.query)){
        const c = getCached(req); if(c){ return res.json(c); }
      }
      U.infoLog?.('ADMIN_MEDIA','tag_cooccurrence_start',{ limit: req.query.limit });
      let limit = Number(req.query.limit || 50);
      if(!Number.isFinite(limit) || limit <= 0) limit = 50;
      if(limit > 300) limit = 300; // safety cap
      // We compute pair counts by self-joining media_tags on same media_id with ordered tag pairs (a < b) to avoid duplicates.
      // Then compute support counts for individual tags for lift / jaccard.
      // Works in both Postgres & SQLite without window functions.
      const driver = getDriver();
      // Base pair counts
      const pairSql = `SELECT t1.tag AS a, t2.tag AS b, COUNT(1) AS cnt
        FROM media_tags t1
        JOIN media_tags t2 ON t1.media_id = t2.media_id AND t1.tag < t2.tag
        GROUP BY t1.tag, t2.tag
        HAVING cnt > 0
        ORDER BY cnt DESC, a ASC, b ASC
        LIMIT ${limit}`;
      const { rows: pairRows } = await query(pairSql, []);
      if(!pairRows.length) return res.json({ success:true, pairs: [] });
      // Collect distinct tags appearing in pairs to fetch their individual supports
      const tagSet = new Set();
      for(const r of pairRows){ tagSet.add(r.a); tagSet.add(r.b); }
      const tags = Array.from(tagSet);
      const inPg = tags.map((_,i)=> `$${i+1}`).join(',');
      const inLite = tags.map(()=> '?').join(',');
      const supportSql = `SELECT tag, COUNT(DISTINCT media_id) AS c FROM media_tags WHERE tag IN (${driver==='pg'?inPg:inLite}) GROUP BY tag`;
      const { rows: supportRows } = await query(supportSql, tags);
      const supportMap = Object.fromEntries(supportRows.map(r=> [r.tag, Number(r.c)]));
      // Total media used for individual supports (needed for lift denominator). Use distinct media_ids that have ANY of these tags.
      const totalSql = `SELECT COUNT(DISTINCT media_id) AS total FROM media_tags WHERE tag IN (${driver==='pg'?inPg:inLite})`;
      const { rows: totalRows } = await query(totalSql, tags);
      const totalMedia = Number(totalRows?.[0]?.total || 0) || 1;
      const pairs = pairRows.map(r=> {
        const count = Number(r.cnt);
        const supA = supportMap[r.a] || 1;
        const supB = supportMap[r.b] || 1;
        const jaccard = count / (supA + supB - count);
        // Lift = P(A,B) / (P(A)*P(B)) approximated via counts => (count/total) / ((supA/total)*(supB/total)) = count * total / (supA*supB)
        const lift = (count * totalMedia) / (supA * supB);
        return { a: r.a, b: r.b, count, jaccard: Number(jaccard.toFixed(4)), lift: Number(lift.toFixed(4)) };
      });
      const out = { success:true, pairs, cached:false };
      if(!('nocache' in req.query)) setCached(req, { ...out, cached:true });
      res.json(out);
      U.infoLog?.('ADMIN_MEDIA','tag_cooccurrence_success',{ pairs: pairs.length, cached: out.cached });
    } catch(e){
      U.errorLog?.('ADMIN_MEDIA','tag_cooccurrence', e); res.status(500).json({ success:false,error:'Failed to load tag cooccurrence'});
    }
  });

  // Tag coverage endpoint: summarizes how many tags media items have.
  // GET /api/admin/media/tags/coverage?min=1
  // Response: { success:true, total, withMin, percent, distribution:[{ tagCount, items }], topUntaggedSample:[...] }
  router.get(`${basePath}/media/tags/coverage`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      U.infoLog?.('ADMIN_MEDIA','tag_coverage_start',{ min: req.query.min, limit: req.query.limit, full: req.query.full });
      let min = Number(req.query.min || 1);
      if(!Number.isFinite(min) || min < 1) min = 1; if(min > 10) min = 10; // clamp
      const driver = getDriver();
      // Optional limit (row scan cap) and full override
      let limit = Number(req.query.limit || 2000);
      if(!Number.isFinite(limit) || limit <= 0) limit = 2000;
      if(limit > 10000) limit = 10000; // hard safety cap
      const full = String(req.query.full||'').toLowerCase()==='1' || String(req.query.full||'').toLowerCase()==='true';
      // Aggregate tag counts per media id (LEFT JOIN to include zero-tag media)
      // Use parameter placeholders only for safety with future filters (none yet).
      const limitClause = full ? '' : ` LIMIT ${limit}`;
      const tagCountSql = driver==='pg'
        ? `SELECT m.id, m.media_key, m.title, m.created_at, COUNT(mt.tag) AS tag_count
            FROM media m LEFT JOIN media_tags mt ON m.id = mt.media_id
            GROUP BY m.id
            ORDER BY m.id DESC${limitClause}`
        : `SELECT m.id, m.media_key, m.title, m.created_at, COUNT(mt.tag) AS tag_count
            FROM media m LEFT JOIN media_tags mt ON m.id = mt.media_id
            GROUP BY m.id
            ORDER BY m.id DESC${limitClause}`;
      const { rows } = await query(tagCountSql, []);
      const total = rows.length;
      const histogram = new Map();
      let withMin = 0;
      for(const r of rows){
        const c = Number(r.tag_count||0);
        histogram.set(c, (histogram.get(c)||0)+1);
        if(c >= min) withMin++;
      }
      const distribution = Array.from(histogram.entries()).sort((a,b)=> a[0]-b[0]).map(([tagCount, items])=> ({ tagCount, items }));
      const percent = total ? withMin / total : 0;
      // Sample a few untagged media (tagCount = 0)
      const topUntaggedSample = rows.filter(r=> Number(r.tag_count||0)===0).slice(0,10).map(r=> ({ id:r.id, mediaKey:r.media_key, title:r.title, createdAt: r.created_at }));
      const payload = { success:true, total, withMin, percent: Number(percent.toFixed(4)), distribution, topUntaggedSample, min, limit: full?null:limit, full };
      res.json(payload);
      U.infoLog?.('ADMIN_MEDIA','tag_coverage_success',{ total, withMin, percent: payload.percent });
    } catch(e){
      U.errorLog?.('ADMIN_MEDIA','tag_coverage', e); res.status(500).json({ success:false,error:'Failed to load tag coverage'});
    }
  });

  // Tag typo candidates endpoint: suggests groups of similar tags (Levenshtein distance <= provided threshold)
  // GET /api/admin/media/tags/typo-candidates?distance=2&max=50&minUses=1
  // Response: { success:true, groups:[{ normalized, variants:[{ tag, uses }], size }] }
  router.get(`${basePath}/media/tags/typo-candidates`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      U.infoLog?.('ADMIN_MEDIA','tag_typo_candidates_start',{ distance: req.query.distance, max: req.query.max, minUses: req.query.minUses });
      let distance = Number(req.query.distance || 2);
      if(!Number.isFinite(distance) || distance < 1) distance = 2; if(distance > 3) distance = 3; // clamp expensive
      let max = Number(req.query.max || 50); if(!Number.isFinite(max) || max <=0) max=50; if(max>200) max=200;
      let minUses = Number(req.query.minUses || 1); if(!Number.isFinite(minUses) || minUses<1) minUses=1;
      // Pull a superset of tags (limit higher than max to allow grouping)
      const fetchLimit = Math.min(400, max*4);
      const { rows } = await query(`SELECT tag, COUNT(1) AS uses FROM media_tags GROUP BY tag HAVING COUNT(1) >= $1 ORDER BY uses DESC, tag ASC LIMIT ${fetchLimit}`, [minUses]);
      const tags = rows.map(r=> ({ tag:r.tag, uses:Number(r.uses) }));
      // Simple Levenshtein implementation (iterative DP) optimized with early exit by length diff
      function lev(a,b){
        if(a===b) return 0; const la=a.length, lb=b.length; const ld=Math.abs(la-lb); if(ld>distance) return ld; // quick fail
        const v0=new Array(lb+1), v1=new Array(lb+1); for(let i=0;i<=lb;i++) v0[i]=i;
        for(let i=0;i<la;i++){
          v1[0]=i+1; let minRow=v1[0]; const ca=a.charCodeAt(i);
          for(let j=0;j<lb;j++){
            const cost = ca===b.charCodeAt(j)?0:1;
            let val = Math.min(
              v1[j]+1,      // deletion
              v0[j+1]+1,    // insertion
              v0[j]+cost    // substitution
            );
            v1[j+1]=val; if(val<minRow) minRow=val;
          }
          if(minRow>distance) return minRow; // early exit
          for(let j=0;j<=lb;j++) v0[j]=v1[j];
        }
        return v0[lb];
      }
      const used = new Set();
      const groups = [];
      for(let i=0;i<tags.length && groups.length<max;i++){
        const t = tags[i]; if(used.has(t.tag)) continue;
        const variants=[t];
        for(let j=i+1;j<tags.length;j++){
          const u = tags[j]; if(used.has(u.tag)) continue;
          const d = lev(t.tag, u.tag); if(d<=distance){ variants.push(u); }
        }
        if(variants.length>1){
          variants.sort((a,b)=> b.uses - a.uses || a.tag.localeCompare(b.tag));
          const normalized = variants[0].tag; // choose most frequent as normalized form
          for(const v of variants) used.add(v.tag);
          groups.push({ normalized, variants, size: variants.length });
        }
      }
      res.json({ success:true, groups });
      U.infoLog?.('ADMIN_MEDIA','tag_typo_candidates_success',{ groups: groups.length });
    } catch(e){
      U.errorLog?.('ADMIN_MEDIA','tag_typo_candidates', e); res.status(500).json({ success:false,error:'Failed to load typo candidates'});
    }
  });

  // Tag recency endpoint: per-tag first/last usage + age metrics
  // GET /api/admin/media/tags/recency?limit=50
  // Response: { success:true, tags:[{ tag, uses, firstUsed, lastUsed, spanDays, ageDays }] }
  router.get(`${basePath}/media/tags/recency`, ensureAuth, ensureAdmin, async (req,res)=>{
    try {
      U.infoLog?.('ADMIN_MEDIA','tag_recency_start',{ limit: req.query.limit });
      let limit = Number(req.query.limit || 50); if(!Number.isFinite(limit) || limit<=0) limit=50; if(limit>300) limit=300;
      const driver = getDriver();
      const sql = driver==='pg'
        ? `SELECT tag, COUNT(1) AS uses, MIN(created_at) AS first_used, MAX(created_at) AS last_used FROM media_tags GROUP BY tag ORDER BY last_used DESC LIMIT ${limit}`
        : `SELECT tag, COUNT(1) AS uses, MIN(created_at) AS first_used, MAX(created_at) AS last_used FROM media_tags GROUP BY tag ORDER BY last_used DESC LIMIT ${limit}`;
      const { rows } = await query(sql, []);
      const now = Date.now();
      const out = rows.map(r=>{
        const first = new Date(r.first_used).toISOString();
        const last = new Date(r.last_used).toISOString();
        const spanDays = Math.max(0, (new Date(r.last_used)- new Date(r.first_used)) / 86400000);
        const ageDays = Math.max(0, (now - new Date(r.first_used)) / 86400000);
        return { tag: r.tag, uses:Number(r.uses), firstUsed:first, lastUsed:last, spanDays: Number(spanDays.toFixed(3)), ageDays: Number(ageDays.toFixed(3)) };
      });
      res.json({ success:true, tags: out });
      U.infoLog?.('ADMIN_MEDIA','tag_recency_success',{ count: out.length });
    } catch(e){
      U.errorLog?.('ADMIN_MEDIA','tag_recency', e); res.status(500).json({ success:false,error:'Failed to load tag recency'});
    }
  });

  return router;
}

export default { buildAdminMediaRouter };