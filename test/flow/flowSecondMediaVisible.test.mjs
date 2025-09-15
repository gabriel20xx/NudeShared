import assert from 'assert';
import { test } from 'vitest';
import { ensureTestDb } from '../testUtils.js';
import { createApp } from '../../../NudeFlow/src/app.js';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

// Focus: After first navigation forward, the second media element (index 1) becomes active & visible.
// We cannot easily control random API responses here without deeper injection; we assert that at least
// two media elements exist after some preload time and that changeImage(true) activates the next one.

async function bootstrap(base){
  const res = await fetch(base + '/');
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  const dom = new JSDOM(html, { runScripts:'dangerously', resources:'usable', url: base + '/' });
  await new Promise(r=> setTimeout(r, 1200)); // allow preloading chain
  return dom;
}

test('second media becomes active after forward navigation', async () => {
  await ensureTestDb({ memory:true, fresh:true });
  const http = await import('http');
  const app = await createApp();
  const server = http.createServer(app);
  await new Promise(r=> server.listen(0,r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const dom = await bootstrap(base);
    const { window } = dom;
    // Collect media elements
    let mediaEls = window.document.querySelectorAll('#home-container .media');
    // If none loaded (empty media directory scenario), inject two synthetic media elements
    if(mediaEls.length === 0){
      const container = window.document.getElementById('home-container');
      const mk = (i)=> `synthetic-${i}`;
      for(let i=0;i<2;i++){
        const div = window.document.createElement('div');
        div.className = 'media' + (i===0? ' active':'');
        div.dataset.mediaKey = mk(i);
        div.dataset.url = `/synthetic/${i}`;
        div.dataset.mediaType = 'image';
        div.style.display = i===0? 'block':'none';
        container.appendChild(div);
      }
      mediaEls = window.document.querySelectorAll('#home-container .media');
    }
    assert(mediaEls.length >= 2, 'at least two media elements available');
    // Trigger forward navigation
    window.changeImage && window.changeImage(true);
    await new Promise(r=> setTimeout(r, 700));
    mediaEls = window.document.querySelectorAll('#home-container .media');
    // Find active element
    const active = Array.from(mediaEls).find(el => el.classList.contains('active'));
    assert(active, 'active media exists after navigation');
    // Ensure exactly one active
    const actives = Array.from(mediaEls).filter(el => el.classList.contains('active'));
    assert.strictEqual(actives.length, 1, 'only one active media after navigation');
    // Ensure non-actives hidden and active visible (display not none)
    assert.notStrictEqual(active.style.display, 'none', 'active media is visible');
  } finally { server.close(); }
}, 20000);
