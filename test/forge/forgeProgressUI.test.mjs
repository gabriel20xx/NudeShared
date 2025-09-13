import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Lightweight DOM shim reused from original Forge test
class Element { constructor(id){ this.id=id; this.style={}; this.textContent=''; this.children=[]; this.listeners={}; const self=this; this.classList={ _set:new Set(), add(c){ self.classList._set.add(c);}, remove(c){ self.classList._set.delete(c);}, contains(c){ return self.classList._set.has(c); } }; }
  appendChild(c){ this.children.push(c); }
  querySelector(){ return null; }
  removeAttribute(attr){ delete this[attr]; }
  addEventListener(type,fn){ (this.listeners[type] ||= []).push(fn); }
  dispatchEvent(evt){ (this.listeners[evt.type]||[]).forEach(fn=>fn(evt)); }
}
class Document { constructor(){ this.map=new Map(); }
  getElementById(id){ if(!this.map.has(id)) this.map.set(id,new Element(id)); return this.map.get(id); }
  querySelectorAll(){ return []; }
  createElement(tag){ return new Element(tag); }
  addEventListener(){}
}

describe('Forge progress UI', () => {
  test('updates progress elements', () => {
    const document = new Document();
    ['processingStatus','queueMeta','progressPct','processingProgressBarWrapper','processingProgressBar','processingProgressLabel'].forEach(id=>document.getElementById(id));
    document.getElementById('processingStatus').textContent='Idle';
    const window = { document, ClientLogger:{ info(){}, warn(){}, error(){} }, addEventListener(){}, removeEventListener(){} };
    global.window = window; global.document=document; global.ClientLogger=window.ClientLogger;
  // Resolve forge main.js relative to repo root (cwd is typically NudeShared in test runs)
  let mainPath = path.resolve(process.cwd(), '..', 'NudeForge', 'src', 'public', 'js', 'main.js');
  if (!fs.existsSync(mainPath)) {
    mainPath = path.resolve(process.cwd(), 'NudeForge', 'src', 'public', 'js', 'main.js');
  }
    const source = fs.readFileSync(mainPath,'utf8');
    const sanitized = source.replace(/(^|\n)import[^;]+;?/g,'').replace(/export\s+\{[^}]+\};?/g,'');
    new Function(sanitized)();
    const api = window.__nudeForge;
    expect(api).toBeTruthy();
    api.updateStatusUI({ status:'queued', yourPosition:2, progress:{ value:0, max:100 }});
    expect(document.getElementById('processingStatus').textContent).toBe('Queued');
  });
});
