// Shared overlay + live region utilities
// Pattern centralization to avoid repetition across admin pages.
// Usage: const ov = createOverlayController({ overlayId:'mediaOverlay', liveId:'mediaLive', showDelay:250 });
// Then ov.runWithOverlay(async ()=> { ...loading work... });
// Provide announce(msg) for polite updates and announceError(msg) for errors (also logs console + optional toast).

(function(global){
  function createOverlayController({ overlayId, liveId, showDelay=250, toast, focusSelector, restoreFocus=true } = {}){
    const overlay = document.getElementById(overlayId);
    const live = document.getElementById(liveId);
    let timer;
    let lastActive = null;
    function moveFocusIn(){
      if(!overlay) return;
      let target = null;
      if(focusSelector){ target = overlay.querySelector(focusSelector); }
      if(!target){
        // find first focusable
        target = overlay.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      }
      if(target && typeof target.focus === 'function') {
        try { target.focus(); } catch(_) {}
      }
    }
    function showSoon(){
      clearTimeout(timer);
      timer = setTimeout(()=>{
        if(!overlay) return;
        if(restoreFocus) { lastActive = document.activeElement; }
        overlay.removeAttribute('hidden');
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden','false');
        console.info('[ACTION] overlay_show', overlayId);
        // Slight defer to allow rendering
        setTimeout(moveFocusIn, 10);
      }, showDelay);
    }
    function hide(){
      clearTimeout(timer);
      if(!overlay) return;
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden','true');
      overlay.setAttribute('hidden','');
      console.info('[ACTION] overlay_hide', overlayId);
      if(restoreFocus && lastActive && typeof lastActive.focus === 'function') {
        try { lastActive.focus(); } catch(_) {}
        lastActive = null;
      }
    }
    function announce(msg){ if(live){ live.textContent = msg; }}
    function announceError(msg){ if(live){ live.textContent = msg; } if(toast && toast.error){ toast.error(msg); } console.error('[OVERLAY_ERROR]', msg); }
    async function runWithOverlay(fn){ showSoon(); try { const r = await fn(); hide(); return r; } catch(e){ hide(); announceError(e.message||'Load failed'); throw e; } }
    return { showSoon, hide, announce, announceError, runWithOverlay };
  }
  global.NCOverlay = { createOverlayController };
})(window);
