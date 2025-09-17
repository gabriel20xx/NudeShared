import http from 'http';
import https from 'https';
import fs from 'fs';
import Logger from '../logger/serverLogger.js';

/**
 * createHttpOrHttpsServer(app, opts)
 * Unified helper to create an HTTP or HTTPS server with optional self-signed certificate generation.
 * Options:
 *  - enableHttps (boolean)
 *  - keyPath / certPath (explicit existing certs)
 *  - selfSigned (boolean, default true) allow on-the-fly self-signed generation for dev
 *  - commonName (string) CN for generated cert (default localhost)
 *  - logDomain (string) logger domain token (default HTTPS)
 *  - serviceName (string) for log metadata
 * Returns Node http(s) server instance.
 */
export async function createHttpOrHttpsServer(app, opts = {}) {
  const {
    enableHttps = false,
    keyPath,
    certPath,
    selfSigned = true,
    commonName = 'localhost',
    logDomain = 'HTTPS',
    serviceName = 'service'
  } = opts;

  if (!enableHttps) return http.createServer(app);

  let key; let cert;
  const haveProvided = keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath);
  if (haveProvided) {
    try {
      key = fs.readFileSync(keyPath);
      cert = fs.readFileSync(certPath);
      Logger.success(logDomain, 'Loaded provided certificate + key', { serviceName, keyPath, certPath });
    } catch (e) {
      Logger.error(logDomain, 'Failed reading provided cert/key – will attempt self-signed', { error: e?.message });
    }
  }
  if ((!key || !cert) && selfSigned) {
    try {
      const selfsigned = (await import('selfsigned')).default;
      const attrs = [{ name: 'commonName', value: commonName }];
      const pems = selfsigned.generate(attrs, { days: 365, keySize: 2048, algorithm: 'sha256' });
      key = pems.private; cert = pems.cert;
      Logger.warn(logDomain, 'Using generated self-signed certificate (development only)', { serviceName, commonName });
    } catch (e) {
      Logger.error(logDomain, 'Self-signed certificate generation failed – falling back to HTTP', { error: e?.message });
      return http.createServer(app);
    }
  }
  if (!key || !cert) {
    Logger.warn(logDomain, 'HTTPS requested but no certs available; falling back to HTTP', { serviceName });
    return http.createServer(app);
  }
  return https.createServer({ key, cert }, app);
}

export default createHttpOrHttpsServer;
