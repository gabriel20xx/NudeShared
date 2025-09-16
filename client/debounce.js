// Shared debounce utility (ESM)
// Usage: const debounced = debounce(fn, 150, { leading:true, trailing:true });
// debounced.cancel() / debounced.flush()
/**
 * Debounce a function so it only executes after `wait` ms have elapsed since the last call.
 * Supports immediate (leading) invocation, trailing invocation, and an optional maxWait
 * that guarantees the function is invoked no later than the max wait even under continual calls.
 *
 * Typical usage:
 *   const d = debounce(expensiveFn, 150, { leading: true, trailing: true, maxWait: 500 });
 *   element.addEventListener('input', e => d(e.target.value));
 *
 * Returned debounced function API:
 *   d.cancel()  -> clears any pending invocation and resets state.
 *   d.flush()   -> immediately invokes pending trailing call (if any) and returns its result.
 *   d.pending() -> boolean indicating if a timer is active.
 *
 * Option semantics:
 *   leading  (boolean, default false)  - invoke on the first call of a burst.
 *   trailing (boolean, default true)   - invoke after burst settles. If both leading & trailing
 *                                        are true the function can fire twice per burst (start & end).
 *   maxWait  (number,  >= wait)        - maximum time allowed before forcing an invoke while calls
 *                                        continue. Ensures periodic execution for rapid streams.
 *
 * Edge details:
 * - If leading is true and trailing is false the function fires immediately on first call then
 *   suppresses further calls until inactivity >= wait.
 * - If leading is false and trailing true (default) it behaves like a classic debounce.
 * - maxWait only matters when there is a continuous series of calls preventing the trailing
 *   timer from expiring; once exceeded it forces an invocation and the cycle restarts.
 * - cancel() clears all stored arguments; flush() ignores leading semantics and only processes
 *   a pending trailing invocation.
 *
 * @template {(...args: any[]) => any} F
 * @param {F} fn Function to debounce.
 * @param {number} [wait=100] Base wait interval in milliseconds.
 * @param {{ leading?: boolean; trailing?: boolean; maxWait?: number }} [options]
 * @returns {F & { cancel():void; flush():ReturnType<F>; pending():boolean }}
 */
export function debounce(fn, wait = 100, options = {}) {
  if (typeof fn !== 'function') throw new TypeError('Expected function');
  let timer = null; let lastArgs; let lastThis; let result; let lastInvoke = 0;
  const leading = options.leading === true;
  const trailing = options.trailing !== false; // default true
  const maxWait = typeof options.maxWait === 'number' ? Math.max(options.maxWait, wait) : null;
  let lastCallTime = 0; // tracks latest call to debounced wrapper

  function invoke(now){
    lastInvoke = now;
    const args = lastArgs; const ctx = lastThis;
    lastArgs = lastThis = undefined;
    result = fn.apply(ctx, args);
    return result;
  }

  function startTimer(pending, ms){
    if(timer) clearTimeout(timer);
    timer = setTimeout(pending, ms);
  }

  function remainingWait(now){
    const sinceLastInvoke = now - lastInvoke;
    const sinceLastCall = now - lastCallTime;
    const timeWaiting = wait - sinceLastCall;
    return maxWait != null
      ? Math.min(timeWaiting, maxWait - sinceLastInvoke)
      : timeWaiting;
  }

  function shouldInvoke(now){
    if(lastArgs === undefined) return false;
    const sinceLastCall = now - lastCallTime;
    const sinceLastInvoke = now - lastInvoke;
    if(sinceLastCall < 0) return true; // clock skew
    if(sinceLastCall >= wait) return true;
    return maxWait != null && sinceLastInvoke >= maxWait;
  }

  function trailingEdge(now){
    timer = null;
    if(trailing && lastArgs) return invoke(now);
    lastArgs = lastThis = undefined;
    return result;
  }

  function timerExpired(){
    const now = Date.now();
    if(shouldInvoke(now)) return trailingEdge(now);
    startTimer(timerExpired, remainingWait(now));
  }

  function leadingInvoke(now){
    if(leading){
      result = invoke(now);
    }
    startTimer(timerExpired, wait); // schedule trailing check
    return result;
  }

  function debounced(...args){
    lastCallTime = Date.now();
    lastArgs = args; lastThis = this;
    const now = lastCallTime;
    const invokeNow = shouldInvoke(now);

    if(!timer){
      // First call: optionally invoke leading immediately
      return leadingInvoke(now);
    }

    if(invokeNow){
      if(maxWait != null){
        // Max wait reached or standard wait elapsed with continuous calls
        startTimer(timerExpired, wait); // restart timer for trailing sequence
        return invoke(now);
      }
    }

    // Reschedule timer to ensure trailing fires after remaining wait
    const timeLeft = remainingWait(now);
    startTimer(timerExpired, timeLeft);
    return result;
  }

  debounced.cancel = function(){ if(timer) clearTimeout(timer); timer = null; lastArgs = lastThis = undefined; lastCallTime = 0; };
  debounced.flush = function(){ if(!timer) return result; return trailingEdge(Date.now()); };
  debounced.pending = () => !!timer;
  return debounced;
}

export default debounce;