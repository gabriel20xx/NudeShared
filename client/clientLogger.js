(function(global){
  if (global.ClientLogger) return; // singleton
  const PREFIX = '[Client]';
  const isDebug = () => { try { return localStorage.getItem('clientDebug'); } catch { return false; } };
  const ts = () => new Date().toISOString();
  const fmt = (level, args) => [ts(), PREFIX, level+':', ...args];
  const api = {
    log: (...a)=> console.log(...fmt('LOG', a)),
    info: (...a)=> console.info(...fmt('INFO', a)),
    warn: (...a)=> console.warn(...fmt('WARN', a)),
    error: (...a)=> console.error(...fmt('ERR', a)),
    debug: (...a)=> { if(isDebug()) console.debug(...fmt('DBG', a)); }
  };
  global.ClientLogger = api;
})(window);
