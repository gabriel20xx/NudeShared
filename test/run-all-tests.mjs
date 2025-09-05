import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
async function run() {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.mjs')).sort();
  let passed = 0;
  for (const f of files) {
    const mod = await import(url.pathToFileURL(path.join(__dirname, f)));
    if (typeof mod.run === 'function') {
      process.stdout.write(`Running ${f}... `);
      await mod.run();
      passed++;
      console.log('OK');
    } else {
      // No exported runner; consider as pass if import succeeded
      passed++;
    }
  }
  console.log(`\n${passed}/${files.length} tests passed.`);
}
run().catch((e)=>{ console.error(e); process.exit(1); });
