(function(){
  if (window.toast) return;
  const rootId='toast-root';
  function ensureRoot(){ let el=document.getElementById(rootId); if(!el){ el=document.createElement('div'); el.id=rootId; el.className='toast-root'; document.body.appendChild(el);} return el; }
  function create(type, message, opts={}){
    const root=ensureRoot();
    const ttl = opts.duration ?? 4800;
    const title = opts.title || ({info:'Info', success:'Success', warn:'Warning', error:'Error'}[type] || 'Notice');
    const el=document.createElement('div');
    el.className=`toast toast-${type}`;
    el.setAttribute('role','status'); el.setAttribute('aria-live','polite');
    el.innerHTML=`<div class="toast-body"><h4>${title}</h4><div class="toast-msg">${message}</div></div><button class="toast-close" aria-label="Dismiss">✕</button><div class="toast-progress" style="animation-duration:${ttl}ms"></div>`;
    const closeBtn=el.querySelector('.toast-close');
    let closed=false; function remove(){ if(closed) return; closed=true; el.style.animation='toast-out .35s forwards'; setTimeout(()=>{ el.remove(); if(root.childElementCount===0) root.style.display=''; }, 340); }
    closeBtn.addEventListener('click', remove);
    if(ttl>0){ setTimeout(remove, ttl); }
    root.appendChild(el);
    return { remove };
  }
  window.toast = {
    info:(m,o)=>create('info',m,o),
    success:(m,o)=>create('success',m,o),
    warn:(m,o)=>create('warn',m,o),
    error:(m,o)=>create('error',m,o)
  };
})();
