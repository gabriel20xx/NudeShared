import assert from 'assert';
import { test } from 'vitest';
import { ensureTestDb } from '../testUtils.js';
import { createApp } from '../../../NudeFlow/src/app.js';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

// Focus: Clicking #tagsOverlayBtn reveals #tagsOverlay (aria-hidden becomes false) using NCOverlay controller.

async function bootstrapFlowHome(base){
  const res = await fetch(base + '/');
  assert.strictEqual(res.status, 200, 'home page 200');
  const html = await res.text();
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: base + '/' });
  await new Promise(r => setTimeout(r, 400));
  return dom;
}

test('tags overlay opens on button click', async () => {
  await ensureTestDb({ memory: true, fresh: true });
  const http = await import('http');
  const app = await createApp();
  const server = http.createServer(app);
  await new Promise(r=> server.listen(0,r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const dom = await bootstrapFlowHome(base);
    const { window } = dom;
    const btn = window.document.getElementById('tagsOverlayBtn');
    const overlay = window.document.getElementById('tagsOverlay');
    assert(btn, 'tags button exists');
    assert(overlay, 'overlay exists');
    assert(overlay.hidden === true, 'overlay initially hidden');
    btn.click();
    // Poll for overlay becoming visible (showDelay 150 + network + rendering)
    const start = Date.now();
    let visible = false;
    while(Date.now() - start < 1500){
      if(overlay.hidden === false && overlay.getAttribute('aria-hidden') === 'false') { visible = true; break; }
      await new Promise(r=> setTimeout(r, 75));
    }
    assert(visible, 'overlay becomes visible after click');
    assert(overlay.classList.contains('active'), 'overlay has active class');
  } finally { server.close(); }
}, 15000);
