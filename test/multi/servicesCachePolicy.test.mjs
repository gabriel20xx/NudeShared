import { test, expect } from 'vitest';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as adminApp } from '../../../NudeAdmin/src/app.js';
import { createApp as flowCreateApp } from '../../../NudeFlow/src/app.js';

function expectPolicyShape(data, service){
  expect(data).toBeTruthy();
  expect(data.service || service).toBeTruthy();
  expect(data.etag).toBeTruthy();
  expect(data.policies).toBeTypeOf('object');
}

test('admin and flow expose /__cache-policy with expected keys', async () => {
  // Admin (direct app export)
  const { server: adminServer, url: adminUrl } = await startEphemeral(adminApp);
  try {
    const res = await fetch(adminUrl + '/__cache-policy');
    expect(res.status).toBe(200);
    const json = await res.json();
    expectPolicyShape(json, 'NudeAdmin');
    expect(json.policies.shared.cssJs).toMatch(/max-age=3600/);
  } finally { adminServer.close(); }

  // Flow (factory createApp)
  const flowApp = await flowCreateApp();
  const { server: flowServer, url: flowUrl } = await startEphemeral(flowApp);
  try {
    const res = await fetch(flowUrl + '/__cache-policy');
    expect(res.status).toBe(200);
    const json = await res.json();
    expectPolicyShape(json, 'NudeFlow');
    expect(json.policies.shared.images).toMatch(/86400/);
  } finally { flowServer.close(); }
}, 20000);
