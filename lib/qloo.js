// Thin Qloo client. The key stays on the server; responses are cached in memory only
// (Qloo's terms allow private caching but not publishing raw responses).
const BASE = 'https://hackathon.api.qloo.com';
const cache = new Map();

export async function qloo(path, params = {}) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const key = url.toString();
  if (cache.has(key)) return cache.get(key);
  if (!process.env.QLOO_API_KEY) throw new Error('QLOO_API_KEY is not set');
  const get = () => fetch(url, { headers: { 'X-Api-Key': process.env.QLOO_API_KEY }, signal: AbortSignal.timeout(30000) });
  let res = await get();
  if (res.status >= 500) res = await get(); // the hackathon gateway returns the odd 502
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Qloo ${res.status} on ${path}: ${body}`);
  }
  const json = await res.json();
  // shortcut: unbounded per-instance cache, fine for a demo; add an LRU if traffic grows
  cache.set(key, json);
  return json;
}
