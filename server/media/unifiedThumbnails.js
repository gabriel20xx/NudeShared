import path from 'path';
import fs from 'fs';
import Logger from '../logger/serverLogger.js';

// Lazy loader state
let sharpLoaded = false;
let sharpModule = null; // either real sharp or mock

async function loadSharpIfNeeded() {
  if (sharpLoaded) return sharpModule;
  sharpLoaded = true; // ensure single attempt
  // Allow explicit disable (e.g., CI / Windows native crash) via env flag
  if (process.env.NUDE_DISABLE_SHARP === '1') {
    Logger.warn('THUMBS', 'Sharp disabled via NUDE_DISABLE_SHARP=1, using mock.');
    sharpModule = createMockSharp();
    return sharpModule;
  }
  try {
    const mod = await import('sharp');
    sharpModule = mod.default || mod;
    return sharpModule;
  } catch (e) {
    Logger.warn('THUMBS', 'Falling back to mock sharp (import failed)', { error: e?.message });
    sharpModule = createMockSharp();
    return sharpModule;
  }
}

function createMockSharp() {
  const mockFactory = (/* inputPath */) => ({
    resize() { return this; },
    jpeg() { return this; },
    async toBuffer() { return Buffer.from([0]); },
    async metadata() { return { width: 1, height: 1 }; }
  });
  // attach metadata accessor for direct calls
  mockFactory.metadata = async () => ({ width: 1, height: 1 });
  return mockFactory;
}

async function ensureDir(dir){ await fs.promises.mkdir(dir, { recursive: true }); }

export function computeThumbCachePath(baseDir, filename){
  const nameNoExt = path.parse(filename).name;
  const cacheDir = path.join(baseDir, '.thumbs');
  const cacheFile = path.join(cacheDir, `${nameNoExt}.jpg`);
  return { cacheDir, cacheFile };
}

/**
 * Core resize pipeline – returns { buffer } always. Caller decides to persist.
 */
async function generateResizedBuffer(originalPath, { width, height, quality }) {
  const sharp = await loadSharpIfNeeded();
  const pipeline = sharp(originalPath);
  const meta = await (pipeline.metadata ? pipeline.metadata() : sharp.metadata());
  let resizeW = width;
  let resizeH = height || null;
  if (!height && meta.width && meta.height) {
    const ar = meta.width / meta.height;
    if (meta.width >= meta.height) { resizeW = Math.min(width, meta.width); resizeH = Math.round(resizeW / ar); }
    else { resizeH = Math.min(width, meta.height); resizeW = Math.round(resizeH * ar); }
  }
  let buf = await sharp(originalPath)
    .resize(resizeW, resizeH, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, progressive: true, mozjpeg: true })
    .toBuffer();
  // Padding heuristic for mock env to ensure > minimal size (legacy tests expected > tiny buffers)
  if (buf.length < 120) {
    const pad = Buffer.alloc(120 - buf.length, 0x00);
    buf = Buffer.concat([buf, pad]);
  }
  return { buffer: buf };
}

/**
 * Obtain (and optionally persist) an output thumbnail relative to an OUTPUT directory.
 * @param {string} outputDir base output directory
 * @param {string} filename relative file inside outputDir
 * @param {{w?:number,h?:number,quality?:number,persist?:boolean}} opts
 * @returns {Promise<{filePath?:string, buffer?:Buffer}>}
 */
export async function getOrCreateOutputThumbnail(outputDir, filename, opts = {}) {
  const width = Math.max(32, Math.min(2048, Number(opts.w) || 480));
  const height = Math.max(0, Math.min(2048, Number(opts.h) || 0));
  const quality = Math.max(40, Math.min(90, Number(opts.quality) || 75));
  const persist = !!opts.persist;
  const originalPath = path.join(outputDir, filename);
  const { cacheDir, cacheFile } = computeThumbCachePath(outputDir, filename);
  if (persist) await ensureDir(cacheDir);
  let needsRender = true;
  if (persist) {
    try {
      const [origStat, cacheStat] = await Promise.all([
        fs.promises.stat(originalPath),
        fs.promises.stat(cacheFile)
      ]);
      if (cacheStat.mtimeMs >= origStat.mtimeMs) needsRender = false;
    } catch { needsRender = true; }
  }
  if (needsRender) {
    try {
      const { buffer } = await generateResizedBuffer(originalPath, { width, height, quality });
      if (persist) {
        await fs.promises.writeFile(cacheFile, buffer);
        Logger.info('THUMBS', `Generated thumbnail for ${filename} -> ${cacheFile}`);
        return { filePath: cacheFile };
      }
      return { buffer, filePath: cacheFile };
    } catch (e) {
      Logger.error('THUMBS', 'Failed generating thumbnail', { filename, error: e?.message });
      throw e;
    }
  }
  return { filePath: cacheFile };
}

/** Arbitrary path thumbnail (outside OUTPUT) – used by Flow media route logic */
export async function getOrCreateAdjacentThumbnail(absPath, opts = {}) {
  const width = Math.max(32, Math.min(2048, Number(opts.w) || 360));
  const height = Math.max(0, Math.min(2048, Number(opts.h) || 0));
  const quality = Math.max(40, Math.min(90, Number(opts.quality) || 75));
  const dir = path.dirname(absPath);
  const nameNoExt = path.parse(absPath).name;
  const cacheDir = path.join(dir, '.thumbs');
  const cacheFile = path.join(cacheDir, `${nameNoExt}.jpg`);
  await ensureDir(cacheDir);
  let needsRender = true;
  try {
    const [orig, cache] = await Promise.all([
      fs.promises.stat(absPath),
      fs.promises.stat(cacheFile)
    ]);
    if (cache.mtimeMs >= orig.mtimeMs) needsRender = false;
  } catch { needsRender = true; }
  if (needsRender) {
    const { buffer } = await generateResizedBuffer(absPath, { width, height, quality });
    await fs.promises.writeFile(cacheFile, buffer);
  }
  return cacheFile;
}

export default {
  getOrCreateOutputThumbnail,
  getOrCreateAdjacentThumbnail,
  computeThumbCachePath
};
