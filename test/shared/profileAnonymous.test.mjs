import { describe, it, expect } from 'vitest';
import { ensureTestDb, startEphemeral } from '../testUtils.js';
import express from 'express';
import { buildProfileRouter } from '../../server/api/profileRoutes.js';

// Focus: /api/profile returns anonymous-style payload when not authenticated (Admin app)

describe('Profile anonymous response (Admin)', () => {
  it('returns success with default anonymous fields when unauthenticated', async () => {
    await ensureTestDb();
    const app = express();
    // minimal session shim for anonymous path (no session middleware needed)
    app.use('/api', buildProfileRouter({ utils: { createSuccessResponse:(d,m='OK')=>({success:true,data:d,message:m}), createErrorResponse:(e)=>({success:false,error:e}) } }));
    const { server, url } = await startEphemeral(app);
    try {
      const res = await fetch(url + '/api/profile');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success || body.ok).toBeTruthy();
      const u = body.data || body.user || body.profile;
      expect(u).toBeTruthy();
      expect(u.username).toBeDefined();
      expect(typeof u.username).toBe('string');
      // Username may be 'Anonymous' or similar fallback
      expect(u.username.length).toBeGreaterThan(0);
      // Optional: profilePicture may be absent for anonymous; if present should end with default-avatar.png
      if(u.profilePicture){
        expect(u.profilePicture).toMatch(/default-avatar\.png$/);
      }
    } finally {
      server.close();
    }
  }, 60000);
});
