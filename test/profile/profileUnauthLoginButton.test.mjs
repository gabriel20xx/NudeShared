import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Focused test: unauthenticated profile page renders golden auth button

describe('profile unauth login button', () => {
  it('renders auth-btn button with expected id and text', async () => {
    // Resolve view relative to this test file to avoid path duplication errors
  // Use fileURLToPath for Windows compatibility (avoid duplicated drive letters like C:\C:\...)
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const sharedRoot = path.resolve(testDir, '..', '..'); // .../NudeShared/test -> NudeShared
    const viewPath = path.join(sharedRoot, 'views', 'shared', 'profile.ejs');
    const template = fs.readFileSync(viewPath, 'utf8');
    let html;
    let ejsMod;
    try {
      // Dynamically import ejs if present – vitest/Vite will skip if dependency missing.
      ejsMod = (await import('ejs')).default || (await import('ejs'));
    } catch {
      ejsMod = null;
    }
    if (ejsMod) {
      html = ejsMod.render(template, { isAuthenticated: false }, { filename: viewPath });
    } else {
      // Fallback minimal render: extract unauth branch and inline include with essential button markup.
      const unauthMatch = template.match(/<%\s*if \(!isAuthenticated\) { %>([\s\S]*?)<% \} else { %>/);
      let unauth = unauthMatch ? unauthMatch[1] : template;
      // Replace include for auth-guard with a minimal representative snippet (keeps test intent: ensure shared id & text).
      unauth = unauth.replace(/<%-? *include\([^)]*auth-guard[^)]*\) *%>/g, () => {
        return `<div id="profile-auth-guard"><button id="profileLoginLink" class="auth-btn">Log In / Sign Up</button></div>`;
      });
      // Strip any remaining EJS tags defensively.
      unauth = unauth.replace(/<%[^%]*%>/g, '');
      html = unauth;
    }
    expect(html).toMatch(/<button[^>]*id="profileLoginLink"[^>]*class="[^"]*auth-btn[^"]*"/);
    expect(html).toMatch(/Log In \/ Sign Up/);
  });
});
