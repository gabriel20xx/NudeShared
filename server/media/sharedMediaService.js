// Shared media service extracted from NudeFlow for reuse (scans external MEDIA_PATH)
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import fsSync from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEDIA_PATH = process.env.MEDIA_PATH || '../media';
const MEDIA_SCAN_INTERVAL = parseInt(process.env.MEDIA_SCAN_INTERVAL || '300000',10);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function getMediaDirectory(){
  if(MEDIA_PATH.startsWith('../')) return path.resolve(PROJECT_ROOT, MEDIA_PATH);
  return path.resolve(PROJECT_ROOT, MEDIA_PATH);
}

let mediaCache=[]; let categoriesCache=[]; let initialized=false;

function validateMediaFileType(name){ return /\.(mp4|mov|mkv|webm|png|jpg|jpeg|gif|webp)$/i.test(name); }
function determineMimeType(name){ const ext=path.extname(name).toLowerCase(); if(['.png','.jpg','.jpeg','.gif','.webp'].includes(ext)) return `image/${ext.replace('.','')==='jpg'?'jpeg':ext.replace('.','')}`; if(['.mp4','.mov','.mkv','.webm'].includes(ext)) return 'video/mp4'; return 'application/octet-stream'; }
function getMediaType(name){ return /\.(png|jpg|jpeg|gif|webp)$/i.test(name)? 'static':'video'; }

async function scanMedia(){
  try {
    const tempMedia=[]; const tempCats=new Set(); const mediaDir=getMediaDirectory(); let items=[];
    try { items = await fs.readdir(mediaDir,{withFileTypes:true}); } catch(e){ if(e.code==='ENOENT'){ await fs.mkdir(mediaDir,{recursive:true}); } return; }
    for(const item of items){ if(!item||!item.name|| item.name.startsWith('.')) continue; if(item.isDirectory()){ const categoryName=item.name; tempCats.add(categoryName); const categoryPath=path.join(mediaDir, categoryName);
        const walk = async (currentDir, relativePrefix='')=>{ let entries=[]; try { entries = await fs.readdir(currentDir,{withFileTypes:true}); } catch { return; } for(const entry of entries){ if(!entry||!entry.name|| entry.name.startsWith('.')) continue; const entryPath=path.join(currentDir, entry.name); if(entry.isDirectory()){ const nextPrefix = relativePrefix? `${relativePrefix}/${entry.name}`: entry.name; await walk(entryPath,nextPrefix); } else { if(validateMediaFileType(entry.name)){ const rel = relativePrefix? `${categoryName}/${relativePrefix}/${entry.name}`: `${categoryName}/${entry.name}`; tempMedia.push({ name:path.basename(entry.name, path.extname(entry.name)), filename:entry.name, category:categoryName, relativePath:rel, mimeType:determineMimeType(entry.name), mediaType:getMediaType(entry.name) }); } } } };
        await walk(categoryPath); }
    }
    if(tempCats.size>0) tempCats.add('all');
    mediaCache=tempMedia; categoriesCache=Array.from(tempCats).map(name=>({name,displayName:name}));
  } catch {}
}

export async function initializeSharedMediaService(){ if(initialized) return; await scanMedia(); if(process.env.NODE_ENV!=='test'){ setInterval(scanMedia, MEDIA_SCAN_INTERVAL); } initialized=true; }
export function getAllMedia(){ return mediaCache; }
export function getCategories(){ return categoriesCache; }
export function getRandomMedia(category=null){ let filtered=mediaCache; if(category){ const lc=String(category).toLowerCase(); if(lc==='all'){ filtered=mediaCache.filter(i=>i.relativePath.includes('/')); } else { filtered=mediaCache.filter(i=> i.category.toLowerCase()===lc); } } if(!filtered.length) return null; return filtered[Math.floor(Math.random()*filtered.length)]; }
export function searchMedia(q){ const s=String(q||'').toLowerCase().trim(); if(!s) return []; return mediaCache.filter(i=> i.name.toLowerCase().includes(s)|| i.category.toLowerCase().includes(s)); }
export function getMediaPath(rel){ const base=getMediaDirectory(); return path.resolve(base, rel); }
export function getMediaBasePath(){ return getMediaDirectory(); }

export default { initializeSharedMediaService, getAllMedia, getCategories, getRandomMedia, searchMedia, getMediaPath, getMediaBasePath };
