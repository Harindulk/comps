// Thin Qloo client. The key stays on the server; responses are cached in memory only
// (Qloo's terms allow private caching but not publishing raw responses).
const BASE = 'https://hackathon.api.qloo.com';
const cache = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Milliseconds to wait for a Retry-After header (seconds or an HTTP date): 2 s when absent or unreadable, capped at 8 s.
export function parseRetryAfter(header, now = Date.now()) {
  if (header == null || String(header).trim() === '') return 2000;
  const secs = Number(header);
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(header) - now;
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), 8000) : 2000;
}

// One retry on 5xx (the hackathon gateway returns the odd 502), up to two on 429 honouring Retry-After.
export async function withRetry(get, wait = sleep) {
  let res = await get(), retries5xx = 1, retries429 = 2;
  for (;;) {
    // Cancel the dropped body so undici frees the socket before the retry.
    if (res.status >= 500 && retries5xx-- > 0) { await res.body?.cancel().catch(() => {}); res = await get(); }
    else if (res.status === 429 && retries429-- > 0) { await res.body?.cancel().catch(() => {}); await wait(parseRetryAfter(res.headers.get('retry-after'))); res = await get(); }
    else return res;
  }
}

export async function qloo(path, params = {}) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const key = url.toString();
  if (cache.has(key)) return cache.get(key);
  if (!process.env.QLOO_API_KEY) throw new Error('QLOO_API_KEY is not set');
  const res = await withRetry(() => fetch(url, { headers: { 'X-Api-Key': process.env.QLOO_API_KEY }, signal: AbortSignal.timeout(30000) }));
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Qloo ${res.status} on ${path}: ${body}`);
  }
  const json = await res.json();
  // shortcut: unbounded per-instance cache, fine for a demo; add an LRU if traffic grows
  cache.set(key, json);
  return json;
}
