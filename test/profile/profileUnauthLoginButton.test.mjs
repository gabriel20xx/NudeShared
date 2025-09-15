import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import ejs from 'ejs';
import { fileURLToPath } from 'url';

// Focused test: unauthenticated profile page renders golden auth button

describe('profile unauth login button', () => {
  it('renders auth-btn button with expected id and text', async () => {
    // Resolve view relative to this test file to avoid path duplication errors
  // Use fileURLToPath for Windows compatibility (avoid duplicated drive letters like C:\C:\...)
  const testDir = path.dirname(fileURLToPath(import.meta.url));
    // Move up to NudeShared root then into views/shared
    const sharedRoot = path.resolve(testDir, '..', '..'); // .../NudeShared/test
    const viewPath = path.join(sharedRoot, 'views', 'shared', 'profile.ejs');
    const template = fs.readFileSync(viewPath, 'utf8');
    const html = ejs.render(template, { isAuthenticated: false });
    expect(html).toMatch(/<button[^>]*id="profileLoginLink"[^>]*class="[^"]*auth-btn[^"]*"/);
    expect(html).toMatch(/Log In \/ Sign Up/);
  });
});
