(function(){
  const storageKey='app-theme-preference';
  const root=document.documentElement;
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  function apply(t){ if(!t) return; root.setAttribute('data-theme', t); const btn=document.getElementById('themeToggleBtn'); if(btn) btn.textContent = t==='dark'?'🌙':'☀️'; }
  function init(){
    const stored = localStorage.getItem(storageKey);
    if(stored){ apply(stored); }
    else { apply(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'); }
    const btn=document.getElementById('themeToggleBtn');
    if(btn){ btn.addEventListener('click', ()=>{
      const cur = root.getAttribute('data-theme')||'dark';
      const next = cur==='dark'?'light':'dark';
      try{ localStorage.setItem(storageKey,next);}catch(_e){}
      apply(next);
    });}
  }
  document.addEventListener('DOMContentLoaded', init);
  mqDark.addEventListener('change', e=>{ if(!localStorage.getItem(storageKey)) apply(e.matches?'dark':'light'); });
  window.addEventListener('storage', e=>{ if(e.key===storageKey) apply(e.newValue); });
})();
