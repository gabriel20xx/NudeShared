import { describe, test, expect } from 'vitest';
import Logger from '../server/logger/serverLogger.js';

describe('Logger basic formatting', () => {
	test('format includes level, module, message', () => {
		const sample = Logger.format('Test', 'info', 'hello', { a:1 });
		expect(/\[INFO|\[info/i.test(sample)).toBe(true);
		expect(sample.includes('[TEST')).toBe(true);
		expect(sample.includes('hello')).toBe(true);
	});
});
