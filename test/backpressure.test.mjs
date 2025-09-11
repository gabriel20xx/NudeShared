import { describe, test, expect } from 'vitest';
import http from 'http';
import { streamRequestIter } from './utils/binaryClient.mjs';

// Test a server emitting a large Buffer in two writes and validate slicing & delay timing.
describe('Backpressure / async iterator wrapper', () => {
  test('re-slices chunks and enforces delay', async () => {
    const big = Buffer.alloc(8192, 7); // 8 KB
    const part1 = big.subarray(0, 4096);
    const part2 = big.subarray(4096);

    const server = http.createServer((req, res) => {
      if (req.url === '/large') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.write(part1);
        setTimeout(()=>{ res.end(part2); }, 5); // two writes
      } else { res.writeHead(404); res.end(); }
    }).listen(0);

    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const start = Date.now();
      const { iterator } = await streamRequestIter(base + '/large', {}, { delayMs: 10, sliceBytes: 1024 });
      const chunks = [];
      for await (const c of iterator()) chunks.push(c);
      const elapsed = Date.now() - start;
      const total = Buffer.concat(chunks);
      expect(total.length).toBe(8192);
      // Expect slicing: original 4096 + 4096 -> each becomes 4 slices of 1024, so 8 slices total.
      expect(chunks.length).toBe(8);
      // Each slice delayed ~10ms => >= 7 delays after first (~70ms). Allow slack.
      expect(elapsed).toBeGreaterThanOrEqual(60);
    } finally { server.close(); }
  }, 15000);
});
