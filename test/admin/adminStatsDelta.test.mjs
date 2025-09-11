import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { createAdminUser, createUser } from '../utils/authFactory.mjs';
import { fetchStats, seedMediaWithEngagements } from './utils/statsSeed.mjs';

test('admin stats delta reflects new media & engagements', async () => {
  await ensureTestDb();
  const { server, url: base } = await startEphemeral(adminApp);
  try {
    const admin = await createAdminUser(base, { email: 'delta_admin_'+Date.now()+'@ex.com', password:'pw12345' });
    const before = await fetchStats(base, admin.cookie, 'period=all');
    const b = before.json?.totals || {}; const g0=Number(b.generated||0), v0=Number(b.viewed||0), d0=Number(b.downloads||0);
    const u1 = await createUser(base, { email: 'delta_u1_'+Date.now()+'@ex.com', password:'pw12345' });
    const u2 = await createUser(base, { email: 'delta_u2_'+Date.now()+'@ex.com', password:'pw12345' });
    const slug = 'deltaslug_'+Date.now();
    await seedMediaWithEngagements({ ownerEmail: u1.email, mediaKey: '/media/output/'+slug+'_A.mp4', views:3, likes:2, downloads:1 });
    await seedMediaWithEngagements({ ownerEmail: u2.email, mediaKey: '/media/output/'+slug+'_B.mp4', views:2, likes:1, downloads:0 });
    const after = await fetchStats(base, admin.cookie, 'period=all');
    const a = after.json?.totals || {};
  expect(Number(a.generated)).toBeGreaterThanOrEqual(g0 + 2);
  expect(Number(a.viewed)).toBeGreaterThanOrEqual(v0 + 5);
  expect(Number(a.downloads)).toBeGreaterThanOrEqual(d0 + 1);
  } finally { server.close(); }
}, 30000);
