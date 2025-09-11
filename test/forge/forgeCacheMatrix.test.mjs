import { test, expect } from 'vitest';
import { ensureTestDb } from '../utils/testDb.mjs';
import { startEphemeral } from '../utils/serverHelpers.mjs';
import { app as forgeApp } from '../../../NudeForge/src/app.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Verifies extended cache policy tiers for images & dynamic directories

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function expectHeader(res, name) {
  const v = res.headers.get(name);
  expect(v, `${name} header missing`).toBeTruthy();
  return v;
}

test('forge cache policy matrix for carousel/shared/dynamic directories', async () => {
  await ensureTestDb();
  const { server, url } = await startEphemeral(forgeApp);
  try {
    // Seed an image in internal carousel thumbnails dir
    const internalCarousel = path.resolve(__dirname, '../../../NudeForge/src/public/images/carousel');
    fs.mkdirSync(internalCarousel, { recursive: true });
    const thumbPath = path.join(internalCarousel, 'thumbnails');
    fs.mkdirSync(thumbPath, { recursive: true });
    const imgFile = path.join(thumbPath, 'sample.png');
    if (!fs.existsSync(imgFile)) {
      // tiny PNG (1x1) base64
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
      fs.writeFileSync(imgFile, Buffer.from(b64, 'base64'));
    }

    // Fetch thumbnail (should have long max-age + SWR)
    const thumbRes = await fetch(url + '/images/carousel/thumbnails/sample.png');
    expect(thumbRes.status).toBe(200);
    const thumbCache = expectHeader(thumbRes, 'cache-control');
    expect(thumbCache).toMatch(/max-age=86400/);
    expect(thumbCache).toMatch(/stale-while-revalidate=604800/);

    // Shared image (simulate placing a png in shared dir path if exists) - optional: just call a known shared asset if present
    // We can't guarantee a shared image asset exists; instead just assert policy matrix endpoint reflects expected rules
    const matrixRes = await fetch(url + '/__cache-policy');
    expect(matrixRes.status).toBe(200);
    const matrix = await matrixRes.json();
    expect(matrix.policies.carousel.thumbnails).toMatch(/86400/);
    expect(matrix.policies.shared.images).toMatch(/86400/);

    // Dynamic directories are no-store: create temp file in output dir and request it
    const outputDir = path.resolve(__dirname, '../../../output');
    fs.mkdirSync(outputDir, { recursive: true });
    const dynFile = path.join(outputDir, 'dyn.txt');
    fs.writeFileSync(dynFile, 'dynamic');
    const dynRes = await fetch(url + '/output/dyn.txt');
    expect(dynRes.status).toBe(200);
    const dynCache = expectHeader(dynRes, 'cache-control');
    expect(dynCache).toBe('no-store');

    // Negative: input dir file
    const inputDir = path.resolve(__dirname, '../../../input');
    fs.mkdirSync(inputDir, { recursive: true });
    const inFile = path.join(inputDir, 'in.txt');
    fs.writeFileSync(inFile, 'in');
    const inRes = await fetch(url + '/input/in.txt');
    expect(inRes.status).toBe(200);
    const inCache = expectHeader(inRes, 'cache-control');
    expect(inCache).toBe('no-store');

    // Copy dir file
    const copyDir = path.resolve(__dirname, '../../../copy');
    fs.mkdirSync(copyDir, { recursive: true });
    const copyFile = path.join(copyDir, 'c.txt');
    fs.writeFileSync(copyFile, 'c');
    const copyRes = await fetch(url + '/copy/c.txt');
    expect(copyRes.status).toBe(200);
    const copyCache = expectHeader(copyRes, 'cache-control');
    expect(copyCache).toBe('no-store');
  } finally { server.close(); }
}, 25000);
