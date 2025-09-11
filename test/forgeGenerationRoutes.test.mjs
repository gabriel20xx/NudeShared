import { test, expect } from 'vitest';
import path from 'path';

function randomPort(){ return 3900 + Math.floor(Math.random()*300); }
async function fetchJson(url, options={}){ const res = await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}}); const txt = await res.text(); let data; try{ data = JSON.parse(txt);}catch{ data={ raw: txt }; } return { status: res.status, json: data, headers: res.headers }; }

test('Forge generation routes basic smoke', async () => {
  process.env.NODE_ENV='test';
  process.env.SKIP_WEBSOCKET='true';
  process.env.SKIP_QUEUE_PROCESSING='true';
  const port = randomPort();
  process.env.PORT=String(port);

  const { startServer } = await import(path.resolve('..','NudeForge','src','app.js'));
  // startServer resolves once server is listening (per implementation returns listener via resolve)
  const listener = await startServer(port);
  try {
    const health = await fetchJson(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    const qs = await fetchJson(`http://127.0.0.1:${port}/api/queue-status`);
    expect(qs.status).toBe(200);
  } finally {
    listener && listener.close && listener.close();
  }
}, 30000);
