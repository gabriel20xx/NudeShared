// Shared Auth Modal (visuals only)
(function(){
  const openBtn = document.getElementById('authOpenBtn');
  const overlay = document.getElementById('authOverlay');
  if(!overlay || !openBtn) return;

  const closeBtn = overlay.querySelector('.auth-close');
  const loginPanel = overlay.querySelector('#authLoginPanel');
  const signupPanel = overlay.querySelector('#authSignupPanel');
  const switchBtn = overlay.querySelector('#authSwitch');
  const submitBtns = overlay.querySelectorAll('.auth-submit');
  const panels = [loginPanel, signupPanel].filter(Boolean);
  const pwInput = document.getElementById('signupPassword');
  const pwMeter = document.getElementById('signupPwMeter');
  const pwFeedback = document.getElementById('signupPwFeedback');
  const pwConfirm = document.getElementById('signupConfirm');
  const pwConfirmErr = document.getElementById('signupConfirmError');

  const STORAGE_KEY = 'authLoggedIn';
  // Default view policy: always start with Login unless admin bootstrap (no admin exists)

  function isLoggedIn(){ return localStorage.getItem(STORAGE_KEY) === '1'; }
  function setLoggedIn(v){
    if(v){ localStorage.setItem(STORAGE_KEY, '1'); }
    else { localStorage.removeItem(STORAGE_KEY); }
    updateHeaderButton();
  }

  function updateHeaderButton(){
    const loginOnly = !signupPanel; // admin mode without signup
    if(isLoggedIn()){
      openBtn.textContent = 'Log out';
      openBtn.setAttribute('aria-haspopup', 'false');
      openBtn.title = 'Log out';
    } else {
      openBtn.textContent = loginOnly ? 'Log in' : 'Log in / Sign up';
      openBtn.setAttribute('aria-haspopup', 'dialog');
      openBtn.title = loginOnly ? 'Log in' : 'Log in or Sign up';
    }
  }

  function activate(idx){
    if (idx !== 0 && idx !== 1) idx = 0;
    panels.forEach((p,i)=>{
      if(!p) return;
      p.hidden = (i!==idx);
      p.setAttribute('aria-hidden', String(i!==idx));
    });
    updateSwitchLabel();
  }

  function getInitialTabIdx(){
    // If admin bootstrap is active, default to signup; otherwise, login
    if (isBootstrapLocked && signupPanel) {
      return panels.indexOf(signupPanel);
    }
    return 0;
  }

  function updateSwitchLabel(){
    if(!switchBtn) return;
    const loginVisible = loginPanel && !loginPanel.hidden;
    switchBtn.textContent = loginVisible ? "Don't have an account? Sign up" : 'Already have an account? Log in';
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

  // Header button: open if logged out; logout if logged in (verify server state first)
  openBtn.addEventListener('click', async ()=>{
    if(isLoggedIn()){
      try {
        const r = await fetch('/auth/me');
        const j = await r.json().catch(()=>({}));
        if (!r.ok || !j?.user) {
          // Session expired on server; clear local flag and open login modal
          setLoggedIn(false);
          open();
          return;
        }
      } catch {}
      try { await fetch('/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } }); } catch {}
      setLoggedIn(false);
      (window.toast ? toast.info('Logged out') : alert('Logged out'));
      close();
    } else {
      open();
    }
  });

  // Close handlers
  // Close logic disabled when bootstrap admin (modal element has data-admin-bootstrap).
  // Additionally, if overlay has data-lock-close (set by NudeAdmin), backdrop click will not close.
  const isBootstrapLocked = !!overlay.querySelector('[data-admin-bootstrap]');
  if(closeBtn && !isBootstrapLocked){ closeBtn.addEventListener('click', close); }
  overlay.addEventListener('click', (e)=>{
    const lockBackdrop = overlay.hasAttribute('data-lock-close');
    if(e.target === overlay && !isBootstrapLocked && !lockBackdrop) close();
  });
  window.addEventListener('keydown', (e)=>{ if(!overlay.hidden && e.key === 'Escape') close(); });

  // Bottom switch instead of tabs
  if(switchBtn && signupPanel){
    if(isBootstrapLocked){ switchBtn.style.display = 'none'; }
    switchBtn.addEventListener('click', ()=>{
      const loginVisible = loginPanel && !loginPanel.hidden;
      if(loginVisible){ activate( panels.indexOf(signupPanel) ); }
      else { activate(0); }
    });
  } else if (switchBtn && !signupPanel) {
    // No signup available
    switchBtn.style.display = 'none';
  }

  // Prevent form submission and call backend
  overlay.addEventListener('submit', (e)=> e.preventDefault());
  // Password strength evaluation
  function scorePassword(p){
    if(!p) return 0;
    let score = 0;
    const length = p.length;
    if(length >= 6) score += 1;
    if(length >= 10) score += 1;
    if(/[a-z]/.test(p) && /[A-Z]/.test(p)) score += 1;
    if(/\d/.test(p)) score += 1;
    if(/[^A-Za-z0-9]/.test(p)) score += 1;
    if(length >= 14) score += 1;
    return Math.min(score,5); // 0-5
  }
  function describeScore(s){
    switch(s){
      case 0: return 'Enter a password';
      case 1: return 'Very weak';
      case 2: return 'Weak';
      case 3: return 'Fair';
      case 4: return 'Good';
      case 5: return 'Strong';
      default: return '';
    }
  }
  function updatePwStrength(){
    if(!pwInput || !pwMeter || !pwFeedback) return;
    const val = pwInput.value || '';
    const s = scorePassword(val);
    pwMeter.dataset.score = String(s);
    pwFeedback.textContent = describeScore(s);
    // Visual width & color via inline style (can be refined in CSS)
    const bar = pwMeter.querySelector('.pw-bar');
    if(bar){
      const pct = (s/5)*100;
      bar.style.width = pct + '%';
      let color = '#d32f2f';
      if(s>=2) color='#f57c00';
      if(s>=3) color='#fbc02d';
      if(s>=4) color='#388e3c';
      if(s>=5) color='#2e7d32';
      bar.style.background = color;
    }
  }
  function updateSignupState(){
    const btn = overlay.querySelector('.auth-submit[data-mode="signup"]');
    if(!btn) return;
    const pw = pwInput ? (pwInput.value || '') : '';
    const cf = pwConfirm ? (pwConfirm.value || '') : '';
    const s = scorePassword(pw);
    const okStrength = s >= 3; // Fair or better
    const match = pw && cf && pw === cf;
    if(pwConfirmErr){ pwConfirmErr.style.display = (cf && !match) ? 'block' : 'none'; }
    btn.disabled = !(okStrength && match);
  }
  pwInput && pwInput.addEventListener('input', ()=>{ updatePwStrength(); updateSignupState(); });
  pwConfirm && pwConfirm.addEventListener('input', updateSignupState);
  updatePwStrength(); updateSignupState();
  submitBtns.forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const mode = btn.getAttribute('data-mode');
      try {
        const isSignup = (mode === 'signup') && signupPanel;
        let payload;
        if(isSignup){
          const email = document.getElementById('signupEmail')?.value || '';
          const password = document.getElementById('signupPassword')?.value || '';
          const confirm = document.getElementById('signupConfirm')?.value || '';
          const username = document.getElementById('signupUsername')?.value || '';
          if(password !== confirm){
            if(window.toast){ toast.error('Passwords do not match'); } else { alert('Passwords do not match'); }
            return;
          }
          if(scorePassword(password) < 3){ if(window.toast){ toast.error('Password is too weak'); } else { alert('Password is too weak'); } return; }
          payload = { email, password, username };
        } else {
          payload = {
            email: document.getElementById('loginEmail')?.value || '',
            password: document.getElementById('loginPassword')?.value || ''
          };
  }
        const res = await fetch(`/auth/${isSignup ? 'signup' : 'login'}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const data = await res.json().catch(()=> ({}));
        if (!res.ok) throw new Error(data?.error || 'Request failed');
        setLoggedIn(true);
        if(!isBootstrapLocked) close(); // keep open only if locked? (bootstrap we redirect immediately)
        try { window.dispatchEvent(new CustomEvent('auth:login-success', { detail: { mode: isSignup ? 'signup' : 'login' } })); } catch {}
        if(window.toast){ toast.success(isSignup ? 'Account created. You are now logged in.' : 'Logged in successfully.'); }
      } catch (e) {
        if(window.toast){ toast.error(e?.message || 'Login failed'); } else { alert(e?.message || 'Login failed'); }
      }
    });
  });

  // Initialize strictly
  overlay.hidden = true; updateHeaderButton(); activate(getInitialTabIdx());
  (async () => {
    try { const r = await fetch('/auth/me'); if (r.ok) { const j = await r.json(); if (j && j.user) setLoggedIn(true); } } catch {}
  })();
})();
