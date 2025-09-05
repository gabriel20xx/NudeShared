import assert from 'assert';
import Logger from '../server/logger/serverLogger.js';

// Basic format & levels sanity check
const sample = Logger.format('Test', 'info', 'hello', { a: 1 });
assert.ok(sample.includes('[INFO') || sample.includes('[info'), 'level tag');
assert.ok(sample.includes('[TEST'), 'module tag uppercased');
assert.ok(sample.includes('hello'), 'message included');

Logger.debug('Test', 'debug message');
Logger.info('Test', 'info message');
Logger.warn('Test', 'warn message');
Logger.error('Test', 'error message');
Logger.success('Test', 'success message');

console.log('NudeShared logger test passed');
