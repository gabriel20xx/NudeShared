import { describe, test, expect, vi } from 'vitest';
import { debounce } from '../../client/debounce.js';

describe('debounce utility', () => {
  test('trailing invocation default', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d(1); d(2); d(3);
    expect(fn).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(49);
    expect(fn).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBe(3);
    vi.useRealTimers();
  });

  test('leading + trailing both fire', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 40, { leading: true, trailing: true });
    d('a');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBe('a');
    d('b'); d('c');
    vi.advanceTimersByTime(39);
    expect(fn).toHaveBeenCalledTimes(1); // trailing not yet
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[1][0]).toBe('c');
    vi.useRealTimers();
  });

  test('cancel prevents trailing fire', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 30);
    d(1);
    vi.advanceTimersByTime(10);
    d.cancel();
    vi.advanceTimersByTime(30);
    expect(fn).toHaveBeenCalledTimes(0);
    vi.useRealTimers();
  });

  test('maxWait forces invoke during burst', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    // wait=40, maxWait=120 -> if we call every 30ms it would normally never fire without maxWait
    const d = debounce(fn, 40, { trailing: true, maxWait: 120 });
    for (let t = 0; t < 110; t += 30) {
      d(t);
      vi.advanceTimersByTime(30); // keep calls within wait window
    }
    // At this point (~120ms elapsed), maxWait should force invocation
    expect(fn).toHaveBeenCalledTimes(1);
    // Continue a few more bursts to ensure second forced invoke
    for (let t = 0; t < 110; t += 30) {
      d(t + 200);
      vi.advanceTimersByTime(30);
    }
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
