// Centralized shared HTTP helpers (moved from individual apps)
import http from 'http';

export function httpRequest(method, base, path, data, extraHeaders={}) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const url = new URL(path, base);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + (url.search || ''),
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...extraHeaders
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        res.body = Buffer.concat(chunks).toString('utf8');
        resolve(res);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function apiJson(method, base, path, data, cookie){
  const res = await httpRequest(method, base, path, data, cookie ? { Cookie: cookie } : {});
  let json = null;
  try { json = JSON.parse(res.body); } catch { /* non-JSON response */ }
  return { res, json };
}

export default { httpRequest, apiJson };
