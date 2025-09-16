// Centralized binary & streaming helpers (moved from app test suites)
import http from 'http';

export function binaryRequest(urlStr, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + (u.search || ''), method, headers }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => { res.buffer = Buffer.concat(chunks); resolve(res); });
    });
    req.on('error', reject); req.end();
  });
}
export function streamRequest(urlStr, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + (u.search || ''), method, headers }, res => {
      res.collect = () => new Promise(r2 => { const chunks=[]; res.on('data', c=>chunks.push(c)); res.on('end', ()=>r2(Buffer.concat(chunks))); });
      resolve(res);
    });
    req.on('error', reject); req.end();
  });
}
export function streamRequestIter(urlStr, { method='GET', headers={} } = {}, { delayMs=0, sliceBytes=0 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + (u.search||''), method, headers }, res => {
      async function * iterator(){
        for await (const rawChunk of res) {
          const chunks = [];
            if (sliceBytes && sliceBytes > 0 && rawChunk.length > sliceBytes) {
              for (let i=0;i<rawChunk.length;i+=sliceBytes) chunks.push(rawChunk.subarray(i, i+sliceBytes));
            } else { chunks.push(rawChunk); }
            for (const c of chunks) { if (delayMs>0) await new Promise(r=>setTimeout(r, delayMs)); yield c; }
        }
      }
      iterator.collect = async () => { const parts=[]; for await (const c of iterator()) parts.push(c); return Buffer.concat(parts); };
      resolve({ res, iterator });
    });
    req.on('error', reject); req.end();
  });
}
export async function backpressureSimulator(urlStr, reqOpts={}, controlOpts={}) { const { iterator } = await streamRequestIter(urlStr, reqOpts, controlOpts); return iterator; }

export default { binaryRequest, streamRequest, streamRequestIter, backpressureSimulator };
