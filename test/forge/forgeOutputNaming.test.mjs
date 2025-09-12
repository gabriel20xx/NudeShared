import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ensureTestDb } from '../../server/test/testDbUtils.js';
import { startEphemeral } from '../../server/test/testServerUtils.js';
import { query } from '../../server/index.js';

// This test simulates queue workflow customization ensuring username-based folder path (fallback anonymous)
// We don't invoke full ComfyUI workflow; instead we call the internal helper by importing queue.js and verifying computeUserOutputSubdir + path mutation logic.

import * as queueMod from '../../../NudeForge/src/services/queue.js';

// Access non-exported function via exported computeUserOutputSubdir (white-box test for contract)
const { /* sanitizeFolderName intentionally not exported */ } = queueMod;

// We added computeUserOutputSubdir; verify behavior.

describe('forge output naming', () => {
  it('uses sanitized username or anonymous fallback', async () => {
    await ensureTestDb();
    // Directly test helper
    const fn = queueMod.computeUserOutputSubdir;
    expect(fn('User_One')).toBe('user_one');
    expect(fn('  Weird   Name!! ')).toBe('weird_name');
    expect(fn('')).toBe('anonymous');
    expect(fn(null)).toBe('anonymous');
  });
});
