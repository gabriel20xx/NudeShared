import { describe, it, expect } from 'vitest';
// Removed unused fs, path imports
import { ensureTestDb } from '../testUtils.js';

// This test simulates queue workflow customization ensuring username-based folder path (fallback anonymous)
// We don't invoke full ComfyUI workflow; instead we call the internal helper by importing queue.js and verifying computeUserOutputSubdir + path mutation logic.

import * as queueMod from '../../../NudeForge/src/services/queue.js'; // computeUserOutputSubdir used; omit unused destructuring

// We added computeUserOutputSubdir; verify behavior.

describe('forge output naming', () => {
  it('uses sanitized username or anonymous fallback', async () => {
  await ensureTestDb({ memory: true, fresh: true });
    // Directly test helper
    const fn = queueMod.computeUserOutputSubdir;
    expect(fn('User_One')).toBe('user_one');
    expect(fn('  Weird   Name!! ')).toBe('weird_name');
    expect(fn('')).toBe('anonymous');
    expect(fn(null)).toBe('anonymous');
  });
});
