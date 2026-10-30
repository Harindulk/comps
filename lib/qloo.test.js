import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRetryAfter, withRetry } from './qloo.js';

test('parseRetryAfter reads seconds and HTTP dates, defaults to 2 s, caps at 8 s', () => {
  const now = Date.parse('Fri, 30 Oct 2026 10:00:00 GMT');
  assert.equal(parseRetryAfter(null, now), 2000);
  assert.equal(parseRetryAfter('', now), 2000);
  assert.equal(parseRetryAfter('3', now), 3000);
  assert.equal(parseRetryAfter('0.5', now), 500);
  assert.equal(parseRetryAfter('120', now), 8000);
  assert.equal(parseRetryAfter('Fri, 30 Oct 2026 10:00:05 GMT', now), 5000);
  assert.equal(parseRetryAfter('Fri, 30 Oct 2026 11:00:00 GMT', now), 8000);
  assert.equal(parseRetryAfter('Fri, 30 Oct 2026 09:00:00 GMT', now), 0);
  assert.equal(parseRetryAfter('soon', now), 2000);
});

const fake = (statuses) => {
  let n = 0;
  const get = async () => { const status = statuses[Math.min(n++, statuses.length - 1)]; return { status, headers: new Headers(status === 429 ? { 'retry-after': '1' } : {}) }; };
  return { get, count: () => n };
};

test('withRetry retries 429 twice with the Retry-After wait, then gives up', async () => {
  const waits = [];
  const f = fake([429, 429, 429, 200]);
  const res = await withRetry(f.get, async (ms) => waits.push(ms));
  assert.equal(res.status, 429);
  assert.equal(f.count(), 3);
  assert.deepEqual(waits, [1000, 1000]);
  const ok = fake([429, 200]);
  assert.equal((await withRetry(ok.get, async () => {})).status, 200);
});

test('withRetry keeps a single retry on 5xx', async () => {
  const f = fake([502, 502, 200]);
  assert.equal((await withRetry(f.get, async () => {})).status, 502);
  assert.equal(f.count(), 2);
  const g = fake([503, 200]);
  assert.equal((await withRetry(g.get, async () => {})).status, 200);
});
