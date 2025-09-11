import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { createAdminUser, createUser } from '../utils/authFactory.mjs';
import { fetchStats, seedMediaWithEngagements, seedMultiUserLikes, seedMultiUserGeneric } from './utils/statsSeed.mjs';

test('admin stats leaders identify top user and media per engagement', async () => {
  await ensureTestDb();
  const { server, url: base } = await startEphemeral(adminApp);
  try {
    const admin = await createAdminUser(base, { email: 'lead_admin_'+Date.now()+'@ex.com', password:'pw12345' });
    const u1 = await createUser(base, { email: 'lead_u1_'+Date.now()+'@ex.com', password:'pw12345' });
    const u2 = await createUser(base, { email: 'lead_u2_'+Date.now()+'@ex.com', password:'pw12345' });
    const u3 = await createUser(base, { email: 'lead_u3_'+Date.now()+'@ex.com', password:'pw12345' });
    // u1 two media, u2 one media -> topUser should be u1
    const baseKey = '/media/output/leader_'+Date.now();
    await seedMediaWithEngagements({ ownerEmail: u1.email, mediaKey: baseKey+'_A.mp4', views:5 });
    await seedMediaWithEngagements({ ownerEmail: u1.email, mediaKey: baseKey+'_B.mp4', views:1 });
    await seedMediaWithEngagements({ ownerEmail: u2.email, mediaKey: baseKey+'_C.mp4', views:3 });
    // For mostLikes: concentrate likes on media A
    await seedMultiUserLikes(baseKey+'_A.mp4', [u1.email, u2.email, u3.email]); // 3 likes
    await seedMultiUserLikes(baseKey+'_C.mp4', [u1.email]); // 1 like
    // For saves: concentrate on media C
    await seedMultiUserGeneric('media_saves', baseKey+'_C.mp4', [u1.email, u2.email]); // 2 saves
    await seedMultiUserGeneric('media_saves', baseKey+'_A.mp4', [u1.email]); // 1 save
    // For downloads: concentrate on media B
    await seedMultiUserGeneric('media_downloads', baseKey+'_B.mp4', [u1.email, u2.email, u3.email]); //3
    await seedMultiUserGeneric('media_downloads', baseKey+'_A.mp4', [u1.email]); //1
    const stats = await fetchStats(base, admin.cookie, 'period=all&filter='+encodeURIComponent('leader_'));
    const leaders = stats.json?.leaders || {};
    expect(leaders.topUser?.name).toMatch(/lead_u1_/);
    expect(leaders.mostViews?.media_key || leaders.mostViews?.mediaKey).toContain('_A.mp4');
    expect(leaders.mostLikes?.media_key || leaders.mostLikes?.mediaKey).toContain('_A.mp4');
    expect(leaders.mostSaves?.media_key || leaders.mostSaves?.mediaKey).toContain('_C.mp4');
    expect(leaders.mostDownloads?.media_key || leaders.mostDownloads?.mediaKey).toContain('_B.mp4');
  } finally { server.close(); }
}, 30000);
