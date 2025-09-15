import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import ejs from 'ejs';

// Focused test: unauthenticated profile page renders golden auth button

describe('profile unauth login button', () => {
  it('renders auth-btn button with expected id and text', async () => {
  // process.cwd() during vitest run points at repo root; profile view lives in NudeShared/views/shared
  const viewPath = path.join(process.cwd(), 'NudeShared', 'views', 'shared', 'profile.ejs');
    const template = fs.readFileSync(viewPath, 'utf8');
    const html = ejs.render(template, { isAuthenticated: false });
    expect(html).toMatch(/<button[^>]*id="profileLoginLink"[^>]*class="[^"]*auth-btn[^"]*"/);
    expect(html).toMatch(/Log In \/ Sign Up/);
  });
});
