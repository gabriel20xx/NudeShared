// Generation / queue router builder (extracted from NudeForge)
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { query as dbQuery } from '../db/db.js';

export function buildGenerationRouter(opts={}){
  const { queue, uploads, config, utils } = opts;
  if(!queue) throw new Error('queue required');
  if(!uploads) throw new Error('uploads (upload, uploadCopy) required');
  const {
    getProcessingQueue,
    getRequestStatus,
    getCurrentlyProcessingRequestId,
    getIsProcessing,
    processQueue,
    cancelAll,
    cancelRequest
  } = queue;
  const { upload, uploadCopy } = uploads;
  const { MAX_UPLOAD_FILES=4, OUTPUT_DIR } = config || {};
  const U = utils || console;
  const router = express.Router();

  router.get('/queue-status', (req,res)=>{
    const requestId = req.query.requestId;
    let yourPosition=-1, status='unknown', resultData=null;
    if(requestId){
      if(requestId === getCurrentlyProcessingRequestId()) { yourPosition=0; status='processing'; }
      else {
        const idx = getProcessingQueue().findIndex(i=>i.requestId===requestId);
        if(idx!==-1){ yourPosition=idx+1; status='pending'; }
        else if(getRequestStatus()[requestId]){ status=getRequestStatus()[requestId].status; resultData=getRequestStatus()[requestId].data; }
      }
    }
    res.json({ queueSize:getProcessingQueue().length, isProcessing:getIsProcessing(), yourPosition, status, result:resultData, uploadedFilename:getRequestStatus()[requestId]?.uploadedFilename });
  });

  router.post('/cancel', (req,res)=>{
    try { const result = cancelAll(req.app.get('io')); if(result && result.error) return res.status(500).json({ success:false, error: result.error}); res.json({ success:true, ...result }); }
    catch(e){ res.status(500).json({ success:false, error:e.message }); }
  });
  router.post('/cancel/:requestId', async (req,res)=>{
    try { const { requestId } = req.params; if(!requestId) return res.status(400).json({ success:false,error:'requestId required'}); const result = await cancelRequest(req.app.get('io'), requestId); if(result && result.error) return res.status(500).json({ success:false,error:result.error}); res.json({ success:true, ...result, active:getCurrentlyProcessingRequestId() }); }
    catch(e){ res.status(500).json({ success:false, error:e.message }); }
  });

  router.post('/upload', upload.array('image', MAX_UPLOAD_FILES), async (req,res)=>{
    try {
      const files = Array.isArray(req.files)? req.files : (req.file? [req.file]: []);
      if(!files.length) return res.status(400).json({ success:false, error:'No file uploaded'});
      const { prompt, steps, outputHeight, workflow: workflowNameRaw, saveNodeTarget, ...restSettings } = req.body;
      const initialQueueSize = getProcessingQueue().length;
      const createdIds = [];
      let resolvedUserName = null; try {
        const sessUser=req.session?.user;
        if(sessUser?.id){
          resolvedUserName = sessUser.username || (sessUser.email? sessUser.email.split('@')[0]: `user-${sessUser.id}`);
        } else {
          resolvedUserName = 'Anonymous';
        }
      } catch (e) { /* default to Anonymous */ resolvedUserName = 'Anonymous'; }
      for(const f of files){
        const uploadedFilename = f.filename; const originalFilename=f.originalname; const uploadedPathForComfyUI = path.posix.join('input', uploadedFilename); const requestId = crypto.randomUUID?.() || Math.random().toString(36).slice(2); createdIds.push(requestId);
  getRequestStatus()[requestId] = { status:'pending', totalNodesInWorkflow:0, originalFilename, uploadedFilename, settings:{ prompt, steps, outputHeight, ...restSettings }, workflowName: workflowNameRaw, userId:(req.session?.user?.id || null), userName: resolvedUserName, saveNodeTarget: saveNodeTarget || null };
        getProcessingQueue().push({ requestId, uploadedFilename, originalFilename, uploadedPathForComfyUI, workflowName: workflowNameRaw, userId:req.session?.user?.id || null, userName: resolvedUserName, saveNodeTarget: saveNodeTarget || null });
      }
      if(process.env.SKIP_QUEUE_PROCESSING!=='true') processQueue(req.app.get('io'));
      const firstRequestId = createdIds[0];
  res.status(202).json({ success:true, message:`${createdIds.length} item(s) queued`, queued: createdIds.length, requestId:firstRequestId, requestIds:createdIds, queueSize:getProcessingQueue().length, yourPosition: initialQueueSize + 1 });
    }catch(e){ res.status(500).json({ success:false, error:'Upload failed', detail:e.message }); }
  });

  router.post('/upload-copy', uploadCopy.single('image'), (req,res)=>{
    if(!req.file) return res.status(400).json({ success:false, error:'No file uploaded'});
    // return filename so client can update persisted preview source to /copy/<filename>
    res.json({ success:true, filename:req.file.filename });
  });

  router.get('/download/:requestId', async (req,res)=>{
    try {
      const requestId = req.params.requestId;
      const data = getRequestStatus()[requestId];
      if(!data || data.status!=='completed') return res.status(404).send('Not ready');
      if(!data.data?.outputImage) return res.status(404).send('Output missing');
      const outputRelativePath = data.data.outputImage;
      const mediaKey = path.basename(outputRelativePath);
      // Record download
      try{ await dbQuery('INSERT INTO media_downloads (user_id, media_key, app) VALUES ($1,$2,$3)', [req.session?.user?.id||null, mediaKey, 'NudeForge']); } catch (e) {
        // Non-fatal metrics insert failure
      }
      const outputFilename = path.basename(outputRelativePath);
      const outDir = OUTPUT_DIR || path.resolve(process.cwd(),'output');
      const abs = path.join(outDir, outputFilename);
      res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
      res.sendFile(abs);
    } catch(e){ res.status(500).send('Download error'); }
  });

  router.get('/download-zip', async (req,res)=>{
    try { let files=req.query.files; if(!files) return res.status(400).send('No files'); if(!Array.isArray(files)) files=[files]; const outDir=OUTPUT_DIR || path.resolve(process.cwd(),'output'); const safe=[]; for(const f of files){ const base=path.basename(f); if(base!==f) continue; if(!/\.(png|jpg|jpeg|webp|gif)$/i.test(base)) continue; const abs=path.join(outDir, base); try { await fs.promises.access(abs); safe.push({base,abs}); } catch (e) { /* ignore missing */ } } if(!safe.length) return res.status(404).send('No valid files'); const zipName = safe.length===1? `${path.parse(safe[0].base).name}.zip` : `outputs-${safe.length}.zip`; res.setHeader('Content-Type','application/zip'); res.setHeader('Content-Disposition',`attachment; filename="${zipName}"`); const archive=archiver('zip',{zlib:{level:9}}); archive.on('error',err=>{ try{res.status(500).end();}catch(e2){ /* ignore response end errors */ } }); archive.pipe(res); for(const {base,abs} of safe) archive.file(abs,{name:base}); await archive.finalize(); } catch(e){ try{ res.status(500).send('ZIP error'); }catch(e2){ /* ignore */ } }
  });

  return router;
}

export default { buildGenerationRouter };
