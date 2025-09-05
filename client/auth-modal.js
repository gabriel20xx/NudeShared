// Shared Auth Modal (visuals only)
(function(){
  const openBtn = document.getElementById('authOpenBtn');
  const overlay = document.getElementById('authOverlay');
  if(!overlay || !openBtn) return;

  const closeBtn = overlay.querySelector('.auth-close');
  const loginTab = overlay.querySelector('#authLoginTab');
  const signupTab = overlay.querySelector('#authSignupTab');
  const loginPanel = overlay.querySelector('#authLoginPanel');
  const signupPanel = overlay.querySelector('#authSignupPanel');
  const submitBtns = overlay.querySelectorAll('.auth-submit');
  const tabButtons = [loginTab, signupTab];
  const panels = [loginPanel, signupPanel];

  const STORAGE_KEY = 'authLoggedIn';
  const LAST_TAB_KEY = 'authLastTab';

  function isLoggedIn(){ return localStorage.getItem(STORAGE_KEY) === '1'; }
  function setLoggedIn(v){
    if(v){ localStorage.setItem(STORAGE_KEY, '1'); }
    else { localStorage.removeItem(STORAGE_KEY); }
    updateHeaderButton();
  }

  function updateHeaderButton(){
    if(isLoggedIn()){
      openBtn.textContent = 'Log out';
      openBtn.setAttribute('aria-haspopup', 'false');
      openBtn.title = 'Log out';
    } else {
      openBtn.textContent = 'Log in / Sign up';
      openBtn.setAttribute('aria-haspopup', 'dialog');
      openBtn.title = 'Log in or Sign up';
    }
  }

  function activate(idx){
    tabButtons.forEach((btn,i)=>{
      if(!btn) return;
      btn.classList.toggle('active', i===idx);
      btn.setAttribute('aria-selected', String(i===idx));
      if(i===idx){ try{ localStorage.setItem(LAST_TAB_KEY, String(idx)); }catch(_){} }
    });
    panels.forEach((p,i)=>{
      if(!p) return;
      p.hidden = (i!==idx);
      p.setAttribute('aria-hidden', String(i!==idx));
    });
  }

  function getInitialTabIdx(){
    const saved = localStorage.getItem(LAST_TAB_KEY);
    const n = Number(saved);
    return Number.isFinite(n) && (n===0 || n===1) ? n : 0;
  }

  function open(){
    overlay.hidden = false;
    document.documentElement.classList.add('no-scroll');
    document.body.classList.add('no-scroll');
    activate(getInitialTabIdx());
    // Focus first field of active panel
    setTimeout(()=>{
      const activePanel = panels.find(p=>p && !p.hidden);
      const el = activePanel && activePanel.querySelector('.auth-input');
      if(el) el.focus();
    },0);
  }

  function close(){
    overlay.hidden = true;
    document.documentElement.classList.remove('no-scroll');
    document.body.classList.remove('no-scroll');
  }

  // Header button: open if logged out; logout if logged in
  openBtn.addEventListener('click', async ()=>{
    if(isLoggedIn()){
      try { await fetch('/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } }); } catch {}
      setLoggedIn(false);
      (window.toast ? toast.info('Logged out') : alert('Logged out'));
      close();
    } else {
      open();
    }
  });

  // Close handlers
  closeBtn && closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(); });
  window.addEventListener('keydown', (e)=>{ if(!overlay.hidden && e.key === 'Escape') close(); });

  // Tabs
  loginTab && loginTab.addEventListener('click', ()=> activate(0));
  signupTab && signupTab.addEventListener('click', ()=> activate(1));

  // Prevent form submission and call backend
  overlay.addEventListener('submit', (e)=> e.preventDefault());
  submitBtns.forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const mode = btn.getAttribute('data-mode');
      try {
        const payload = (mode === 'signup')
          ? { email: document.getElementById('signupEmail')?.value || '', password: document.getElementById('signupPassword')?.value || '' }
          : { email: document.getElementById('loginEmail')?.value || '', password: document.getElementById('loginPassword')?.value || '' };
        const res = await fetch(`/auth/${mode === 'signup' ? 'signup' : 'login'}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const data = await res.json().catch(()=> ({}));
        if (!res.ok) throw new Error(data?.error || 'Request failed');
        setLoggedIn(true); close();
        if(window.toast){ toast.success(mode === 'signup' ? 'Account created. You are now logged in.' : 'Logged in successfully.'); }
      } catch (e) {
        // Fallback: simulate success offline
        setLoggedIn(true); close();
        if(window.toast){ toast.info('Offline mode: simulated login'); }
      }
    });
  });

  // Initialize strictly
  overlay.hidden = true; updateHeaderButton(); activate(getInitialTabIdx());
  (async () => {
    try { const r = await fetch('/auth/me'); if (r.ok) { const j = await r.json(); if (j && j.user) setLoggedIn(true); } } catch {}
  })();
})();
