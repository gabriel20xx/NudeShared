import assert from 'assert';
import { test } from 'vitest';
import { ensureTestDb } from '../testUtils.js';
import { createApp } from '../../../NudeFlow/src/app.js';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

// Focus: Floating controls (.floating-controls) remain present after simulated fullscreen enter/exit events.
// We cannot trigger real fullscreen in jsdom; instead we simulate by toggling document.fullscreenElement
// via a monkey patch and dispatching the fullscreenchange event. The syncFullscreenUi method should
// update the fullscreen button icon but most importantly the controls container must still exist.

async function bootstrapFlowHome(base){
  const res = await fetch(base + '/');
  assert.strictEqual(res.status, 200, 'home page 200');
  const html = await res.text();
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: base + '/' });
  // Wait a tick for scripts (defer) to run
  await new Promise(r => setTimeout(r, 350));
  return dom;
}

test('fullscreen controls persist after simulated fullscreen toggles', async () => {
  await ensureTestDb({ memory: true, fresh: true });
  const http = await import('http');
  const app = await createApp();
  const server = http.createServer(app);
  await new Promise(r=> server.listen(0,r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const dom = await bootstrapFlowHome(base);
    const { window } = dom;
    // Precondition: controls should exist because feed page has #home-container
    let controls = window.document.querySelector('.floating-controls');
    assert(controls, 'controls exist initially');

    // Monkey patch document.fullscreenElement and dispatch event
    const doc = window.document;
    let fakeFsEl = null;
    Object.defineProperty(doc, 'fullscreenElement', { get(){ return fakeFsEl; } });

    function dispatchFsChange(){
      const ev = new window.Event('fullscreenchange');
      doc.dispatchEvent(ev);
    }

    // Simulate entering fullscreen
    fakeFsEl = doc.body; // pretend body is fullscreen element
    dispatchFsChange();
    await new Promise(r=> setTimeout(r, 30));
    controls = window.document.querySelector('.floating-controls');
    assert(controls, 'controls still exist after entering fullscreen');

    // Simulate exiting fullscreen
    fakeFsEl = null;
    dispatchFsChange();
    await new Promise(r=> setTimeout(r, 30));
    controls = window.document.querySelector('.floating-controls');
    assert(controls, 'controls still exist after exiting fullscreen');
  } finally { server.close(); }
}, 15000);
