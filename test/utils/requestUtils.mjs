// Minimal JSON request helper reused by factories
import http from 'http';

export function requestJson(urlOrBase, options = {}, body){
  return new Promise((resolve, reject) => {
    let urlObj;
    if (typeof urlOrBase === 'string') {
      try { urlObj = new URL(urlOrBase); } catch { urlObj = new URL('http://127.0.0.1'+urlOrBase); }
    } else { throw new Error('url required'); }
    const opts = { hostname: urlObj.hostname, port: urlObj.port, path: urlObj.pathname + urlObj.search, method:'GET', ...options };
    const req = http.request(opts, res => {
      let data='';
      res.on('data', c=> data+=c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data||'{}'), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, text: data, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export default { requestJson };
