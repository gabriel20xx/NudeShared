import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  root: __dirname,
  test: {
    include: ['test/**/*.test.mjs'],
    globals: true,
    environment: 'node',
    setupFiles: ['test/globalSetup.mjs'],
    hookTimeout: 30000,
    testTimeout: 30000,
    coverage: {
      reporter: ['text','lcov'],
      include: [ '../NudeAdmin/src/**/*.js','../NudeFlow/src/**/*.js','../NudeForge/src/**/*.js','server/**/*.js' ],
      exclude: ['**/node_modules/**','**/*.ejs']
    }
  }
};