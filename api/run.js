// POST /api/run: streams the agent's steps as server-sent events, then the report.
import { runAgent, runBaseline } from '../lib/agent.js';

const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
// shortcut: per-instance memory limits; a determined abuser can hit several instances. Move to a KV store if that happens.
const hits = new Map();
const done = new Map(); // finished reports keyed by normalised input, so repeat runs are free and instant
let day = '', today = 0;

function validate(body) {
  const game = body?.game || {};
  const name = String(game.name || '').trim().slice(0, 80);
  const pitch = String(game.pitch || '').trim().slice(0, 500);
  const comps = (Array.isArray(body?.comps) ? body.comps : [])
    .filter((c) => UUID.test(c?.id || ''))
    .map((c) => ({ id: c.id, name: String(c.name || '').slice(0, 80), image: /^https:\/\//.test(c.image || '') ? String(c.image).slice(0, 500) : null }));
  if (!name || !pitch) return { error: 'Give the game a name and a one-line pitch.' };
  if (comps.length < 2 || comps.length > 5) return { error: 'Pick two to five comparable games.' };
  return { input: { game: { name, pitch }, comps } };
}

function limited(ip) {
  const now = Date.now();
  const d = new Date().toISOString().slice(0, 10);
  if (d !== day) { day = d; today = 0; }
  if (today >= Number(process.env.MAX_RUNS_PER_DAY || 60)) return 'Today\'s live-run budget is used up. The example reports still work.';
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= Number(process.env.MAX_RUNS_PER_HOUR || 4)) return 'That is four live runs this hour from your connection. Try again later, or open an example report.';
  hits.set(ip, [...recent, now]);
  today++;
  return null;
}

export async function POST(request) {
  const { input, error } = validate(await request.json().catch(() => null));
  if (error) return Response.json({ error }, { status: 400 });
  const key = JSON.stringify([input.game.name.toLowerCase(), input.game.pitch.toLowerCase(), input.comps.map((c) => c.id).sort()]);
  if (done.has(key)) return new Response(`data: ${JSON.stringify(done.get(key))}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const why = limited(ip);
  if (why) return Response.json({ error: why }, { status: 429 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const ping = setInterval(() => controller.enqueue(enc.encode(': ping\n\n')), 15000);
      try {
        const baseline = runBaseline(input).catch((e) => ({ error: e.message }));
        const result = await runAgent(input, send);
        const payload = { type: 'report', input, ...result, baseline: await baseline };
        if (done.size > 200) done.delete(done.keys().next().value);
        done.set(key, payload);
        send(payload);
      } catch (e) {
        console.error(e);
        send({ type: 'error', error: e.message });
      } finally {
        clearInterval(ping);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
}
