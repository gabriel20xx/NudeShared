// Shared thumbnail fallback helper
// Returns an object { contentType, buffer } representing a 1x1 transparent PNG
// This is used when thumbnail generation fails but the original media exists.
// Keep tiny binary inline to avoid fs or encoding overhead.
// PNG file generated via: sharp({create:{width:1,height:1,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer()
// Hex -> Buffer for portability.
import Logger from '../logger/serverLogger.js';

const ONE_BY_ONE_TRANSPARENT_PNG_HEX = '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a20b0e0000000049454e44ae426082';
let cachedBuffer = null;

export function getThumbnailFallbackBuffer() {
  if (!cachedBuffer) {
    try { cachedBuffer = Buffer.from(ONE_BY_ONE_TRANSPARENT_PNG_HEX, 'hex'); }
    catch (e) {
      Logger.warn('THUMB_FALLBACK', 'Failed constructing fallback buffer, generating dynamic.', e);
      // Last resort dynamic generation (should not normally occur)
      cachedBuffer = Buffer.from([]);
    }
  }
  return { contentType: 'image/png', buffer: cachedBuffer };
}

// Convenience wrapper used by routes: attemptFn should throw on failure
export async function withThumbnailFallback(originalAbsPath, attemptFn) {
  try {
    return await attemptFn();
  } catch (err) {
    // If original exists but processing failed, return fallback
    try {
      const fs = await import('fs');
      if (fs.existsSync(originalAbsPath)) {
        Logger.warn('THUMB_FALLBACK', 'Serving fallback thumbnail after processing error: ' + (err?.message||err));
        return getThumbnailFallbackBuffer();
      }
    } catch { /* ignore */ }
    throw err; // Upstream will handle 404
  }
}

export default { getThumbnailFallbackBuffer, withThumbnailFallback };