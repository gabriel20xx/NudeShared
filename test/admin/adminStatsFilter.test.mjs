import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { createAdminUser, createUser } from '../utils/authFactory.mjs';
import { fetchStats, seedMediaWithEngagements } from './utils/statsSeed.mjs';

test('admin stats filter narrows counts', async () => {
  await ensureTestDb();
  const { server, url: base } = await startEphemeral(adminApp);
  try {
    const admin = await createAdminUser(base, { email: 'filter_admin_'+Date.now()+'@ex.com', password:'pw12345' });
    const slug = 'filt_'+Date.now();
    const u = await createUser(base, { email: 'filter_u_'+Date.now()+'@ex.com', password:'pw12345' });
    await seedMediaWithEngagements({ ownerEmail: u.email, mediaKey: '/media/output/'+slug+'_1.mp4', views:1 });
    await seedMediaWithEngagements({ ownerEmail: u.email, mediaKey: '/media/output/'+slug+'_2.mp4', views:2 });
    const allStats = await fetchStats(base, admin.cookie, 'period=all');
    const filtered = await fetchStats(base, admin.cookie, 'period=all&filter='+encodeURIComponent(slug));
    expect(filtered.res.status).toBe(200);
    expect(Number(filtered.json?.totals?.generated)).toBeGreaterThanOrEqual(2);
    expect(Number(filtered.json?.totals?.generated)).toBeLessThanOrEqual(Number(allStats.json?.totals?.generated||0));
    expect(Number(filtered.json?.totals?.viewed)).toBeGreaterThanOrEqual(3);
  } finally { server.close(); }
}, 30000);
