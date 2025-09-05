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
  const tabButtons = [loginTab, signupTab];
  const panels = [loginPanel, signupPanel];
  function open(){ overlay.hidden = false; document.documentElement.classList.add('no-scroll'); document.body.classList.add('no-scroll'); loginTab.click(); setTimeout(()=>{ const el=overlay.querySelector('.auth-input'); el && el.focus(); },0); }
  function close(){ overlay.hidden = true; document.documentElement.classList.remove('no-scroll'); document.body.classList.remove('no-scroll'); }
  function activate(idx){ tabButtons.forEach((btn,i)=>{ btn.classList.toggle('active', i===idx); btn.setAttribute('aria-selected', String(i===idx)); }); panels.forEach((p,i)=>{ if(!p) return; p.hidden = (i!==idx); p.setAttribute('aria-hidden', String(i!==idx)); }); }
  openBtn.addEventListener('click', open);
  closeBtn && closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) close(); });
  window.addEventListener('keydown', (e)=>{ if(!overlay.hidden && e.key === 'Escape') close(); });
  loginTab && loginTab.addEventListener('click', ()=> activate(0));
  signupTab && signupTab.addEventListener('click', ()=> activate(1));
  // Prevent form submission (visuals only)
  overlay.addEventListener('submit', (e)=> e.preventDefault());
})();
