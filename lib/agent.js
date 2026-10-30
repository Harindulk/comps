// The Lookalike agent (launch intelligence for indie games): Claude plans which Qloo calls to make, reads the evidence, and files a
// launch plan in which every claim cites evidence IDs. runBaseline() writes the same plan
// with no Qloo access, for the "Without Qloo" view.
import Anthropic from '@anthropic-ai/sdk';
import { Evidence, buildTools } from './tools.js';

const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 12;
const MAX_CALLS = 18; // Qloo calls per run, a cost and latency ceiling
const SECTION_KINDS = ['audience', 'music', 'look', 'creators', 'markets', 'timing', 'risks'];

const claim = { type: 'object', additionalProperties: false, required: ['text', 'evidence'], properties: { text: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } } };
export const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['positioning', 'decisions', 'sections', 'shortlist_verdicts', 'store_copy', 'player_panel'],
  properties: {
    positioning: { type: 'string', description: 'One sentence: who this game is for and what it should feel like, as the data shows it.' },
    decisions: {
      type: 'array', description: 'Exactly three, in this order: who (the audience), hook (the strongest cultural hook outside games), where (the market to start in).',
      items: { type: 'object', additionalProperties: false, required: ['label', 'text', 'evidence'], properties: { label: { type: 'string', enum: ['who', 'hook', 'where'] }, text: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } } },
    },
    sections: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['kind', 'heading', 'claims'],
        properties: { kind: { type: 'string', enum: SECTION_KINDS }, heading: { type: 'string' }, claims: { type: 'array', items: claim } },
      },
    },
    shortlist_verdicts: {
      type: 'array', description: 'One per name the developer shortlisted; empty when there was no shortlist.',
      items: { type: 'object', additionalProperties: false, required: ['name', 'verdict', 'reason', 'evidence'], properties: { name: { type: 'string' }, verdict: { type: 'string', enum: ['keep', 'test', 'drop', 'unscored'] }, reason: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } } },
    },
    store_copy: {
      type: 'object', additionalProperties: false, required: ['short_description', 'tags', 'evidence'],
      properties: { short_description: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, evidence: { type: 'array', items: { type: 'string' } } },
    },
    player_panel: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'profile', 'reaction', 'verdict', 'evidence'],
        properties: { name: { type: 'string' }, profile: { type: 'string' }, reaction: { type: 'string' }, verdict: { type: 'string', enum: ['buy', 'wishlist', 'pass'] }, evidence: { type: 'array', items: { type: 'string' } } },
      },
    },
  },
};

const BRIEF = (input) => `Game: ${input.game.name}
Pitch: ${input.game.pitch}
Comparable games (Qloo IDs): ${input.comps.map((c) => `${c.name} (${c.id})`).join('; ')}` +
  (input.shortlist?.length ? `\nShortlist the developer was planning to pitch or partner with: ${input.shortlist.join('; ')}` : '');

const SYSTEM = `You are Lookalike, a launch strategist for indie game developers. A developer gives you their game and the comparable games ("comps") their players already love. You find out, with Qloo's cultural taste data, what those players love outside games, who they are, where they live and where attention is moving, then write a launch plan.

How to work:
- Gather evidence first. Call several tools in parallel in each turn. Cover at least: music artists, podcasts, one screen domain (TV or movies), brands, game tags, demographics, geography for two or three countries that suit this game and its comps (for example the comps' home markets and one large growth market), one compare_audiences call that splits the comps, and check_momentum on your strongest artist and podcast candidates, and audience_segment for the most over-indexed age band once you have the demographics. If the brief has a shortlist, run pitch_check on it (one call per domain: podcasts, artists, shows, brands or games). Ten to fourteen calls is normal; there is a hard cap of 18.
- Every tool result lists items with IDs such as E3.2. Every claim you file must cite the item IDs it rests on. Cite only IDs you were given; never invent names, numbers or IDs. If the data does not support a point, leave the point out.
- Turn data into decisions a solo developer can act on this month: which artists' sound to brief for the trailer, which podcasts and creators to pitch, which visual references to put on the mood board, which countries to localise and run ads in first, when to launch, what the store page should say. Name the specific entity and say why the data points to it, using its affinity or skew.
- Prefer entities with high affinity but lower popularity (marked "niche fit") where they suit the game: they are reachable, while the most popular entities correlate with everything.
- Qloo owns the audience facts; you own the reasoning. Affinity is a relative ranking signal inside one result set, never a probability, a share of players or a sales estimate. Heatmaps show where this taste concentrates, not where sales will happen. compare_audiences compares taste-tag profiles, so never call it audience overlap. Demographic skews describe aggregates, never individuals. Only call something rising or fading when check_momentum shows it.
- Be honest about weak data: low affinity, a demographic that is close to zero, comps that disagree, a shortlist name Qloo could not find. Put those in the risks section. "The Qloo evidence here is thin" beats filling a section from general knowledge.
- decisions: exactly three, in the order who, hook, where; each one sentence a developer can act on, each citing evidence.
- shortlist_verdicts: when the brief has a shortlist, one verdict per name (keep, test, drop or unscored) with the pitch_check evidence; otherwise an empty array. A name pitch_check could not find or score ("not found in Qloo search" or "no affinity returned") gets verdict unscored, never test, and its reason says Qloo has no data for it.
- The player panel is four grounded audience simulations, not real or surveyed players: each profile uses only cited evidence (an age band from the demographics, a region where the taste concentrates, two or three things the data says these fans love). Give each a first name and an age band only, no job, income or life story. Each reacts in their own voice to the pitch in two or three sentences, says what would make them buy, and gives a verdict.
- When you have enough, call submit_report once. Use each section kind at most once, in this order: audience, music, look, creators, markets, timing, risks. Two to five claims per section, each one or two sentences.`;

const BASELINE_SYSTEM = `You are Lookalike, a launch strategist for indie game developers, working this time without any data. Write a launch plan for the game below using only your general knowledge. You have no data source. Use each section kind at most once, in this order: audience, music, look, creators, markets, timing, risks; two to five claims per section; every evidence array must be empty. The player panel is four imagined players reacting to the pitch. decisions are exactly three (who, hook, where) with empty evidence; shortlist_verdicts is empty.`;

const submitTool = { name: 'submit_report', description: 'File the finished launch plan. Call exactly once, at the end.', strict: true, input_schema: REPORT_SCHEMA };

const client = () => new Anthropic();
// Server-side fallback on a refusal, routed by category (Anthropic's recommended default).
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };

// Keeps only citations that point at real evidence, and reports the ones it dropped.
export function cleanCitations(report, ev) {
  let dropped = 0;
  const keep = (list) => (list || []).filter((ref) => (ev.has(ref) ? true : (dropped++, false)));
  for (const s of report.sections) for (const c of s.claims) c.evidence = keep(c.evidence);
  report.store_copy.evidence = keep(report.store_copy.evidence);
  for (const p of report.player_panel) p.evidence = keep(p.evidence);
  for (const d of report.decisions || []) d.evidence = keep(d.evidence);
  for (const v of report.shortlist_verdicts || []) v.evidence = keep(v.evidence);
  return dropped;
}

// Evidence numbers a claim may quote: affinity, popularity, scores, momentum, coordinates, age and gender skews, driven-by scores.
const itemNumbers = (it) => [it.affinity, it.popularity, it.score, it.percentile, it.change, it.lat, it.lon,
  ...Object.values(it.age || {}), ...Object.values(it.gender || {}), ...(it.driven_by || []).map((d) => d.score)].filter((x) => typeof x === 'number');
// Signed or unsigned decimals; skips integers, years, prices ($7.99), evidence IDs (E4.6) and version strings.
// A dash after a digit ("0.92 - 0.98") is a range, not a minus sign.
const DECIMAL = /(?<![\w.$€£])((?<!\d\s?)[+\-−])?(\d*\.\d+)(?!\.?\d)/g;
// Hedged ("about 0.7") or range ends ("0.70–0.73") get one unit of the last digit instead of half.
const HEDGE = /(about|around|roughly|approximately|~)\s*$|\d\s*[–—-]\s*$/i;
const RANGE_LOW = /^\s*[–—-]\s*[+\-−]?\d/;

// Checks every decimal quoted in a decision, section claim, shortlist reason or store copy against the
// numbers in the evidence that claim cites. Reports, never deletes. Also counts item vs whole-block citations.
export function checkNumbers(report, ev) {
  const numbers = { checked: 0, matched: 0, unmatched: [] };
  const check = (where, text, refs) => {
    const pool = (refs || []).flatMap((ref) => {
      const hit = ev.find(ref);
      return !hit ? [] : hit.item ? itemNumbers(hit.item) : hit.block.items.flatMap(itemNumbers);
    });
    const str = String(text || '');
    for (const m of str.matchAll(DECIMAL)) {
      const [whole, sign = '', digits] = m;
      const value = Number((sign === '−' ? '-' : sign) + digits);
      const loose = HEDGE.test(str.slice(Math.max(0, m.index - 14), m.index)) || RANGE_LOW.test(str.slice(m.index + whole.length));
      const tol = (loose ? 1 : 0.5) * 10 ** -digits.split('.')[1].length + 1e-9;
      // An unsigned number may quote a negative skew's size ("under-indexes by 0.21").
      const ok = pool.some((x) => Math.abs(x - value) <= tol || (!sign && Math.abs(Math.abs(x) - value) <= tol));
      numbers.checked++;
      if (ok) numbers.matched++;
      else numbers.unmatched.push({ where, value: sign + digits });
    }
  };
  for (const d of report.decisions || []) check(`decision ${d.label}`, d.text, d.evidence);
  for (const s of report.sections || []) (s.claims || []).forEach((c, i) => check(`section ${s.kind} claim ${i + 1}`, c.text, c.evidence));
  for (const v of report.shortlist_verdicts || []) check(`shortlist ${v.name}`, v.reason, v.evidence);
  if (report.store_copy) check('store copy', report.store_copy.short_description, report.store_copy.evidence);

  const citations = { item: 0, block: 0 };
  const lists = [...(report.decisions || []), ...(report.sections || []).flatMap((s) => s.claims || []), ...(report.shortlist_verdicts || []), report.store_copy || {}, ...(report.player_panel || [])];
  for (const ref of lists.flatMap((x) => x.evidence || [])) citations[ref.includes('.') ? 'item' : 'block']++;
  return { numbers, citations };
}

const NOUN = { podcast: ['podcast', 'podcasts'], artist: ['artist', 'artists'], tv_show: ['TV show', 'TV shows'], brand: ['brand', 'brands'], videogame: ['game', 'games'], person: ['person', 'people'], movie: ['film', 'films'], book: ['book', 'books'] };
const noun = (domain, n = 2) => NOUN[domain]?.[n === 1 ? 0 : 1] ?? `${String(domain).replace(/_/g, ' ')}${n === 1 ? '' : 's'}`;

export const TOOL_LABEL = {
  audience_taste: (i) => `Asking Qloo which ${noun(i.domain)} these players love`,
  audience_tags: (i) => (i.scope === 'culture' ? 'Reading the cultural tags these players over-index on' : 'Reading the game tags these players over-index on'),
  audience_demographics: () => 'Checking age and gender skew of each comp audience',
  audience_geography: (i) => `Mapping where comp fans concentrate in ${i.region}`,
  compare_audiences: () => 'Comparing what splits the comp audiences',
  check_momentum: (i) => `Checking whether ${(i.items || []).length} picks are rising or fading`,
  pitch_check: (i) => `Scoring your ${(i.names || []).length} shortlisted ${noun(i.domain, (i.names || []).length)} against these players`,
  audience_segment: (i) => `Re-asking for ${noun(i.domain)} with only fans aged ${String(i.age).replace(/_/g, ' ')}`,
};

// Runs one tool_use block and records it in calls. A call that throws is recorded as {tool, input, error},
// does not count toward MAX_CALLS, and an identical call later in the run reuses that error instead of hitting Qloo.
export function toolRunner({ impl, ev, emit = () => {}, calls }) {
  const seen = new Map(); // tool + input -> { id } of its evidence block, or { error }
  return async (u) => {
    const key = u.name + JSON.stringify(u.input);
    const prev = seen.get(key);
    if (prev?.error) return { type: 'tool_result', tool_use_id: u.id, content: `Error (same call failed earlier): ${prev.error}`, is_error: true };
    if (prev) return { type: 'tool_result', tool_use_id: u.id, content: `Same call as before; its result is ${prev.id}. Use that evidence.` };
    if (calls.filter((c) => !c.error).length >= MAX_CALLS) {
      return { type: 'tool_result', tool_use_id: u.id, content: `Call budget of ${MAX_CALLS} used. Call submit_report now with what you have.`, is_error: true };
    }
    const call = { tool: u.name, input: u.input };
    calls.push(call);
    const label = TOOL_LABEL[u.name]?.(u.input || {}) || u.name;
    emit({ type: 'step', tool: u.name, label });
    try {
      if (!impl[u.name]) throw new Error(`Unknown tool ${u.name}`);
      const out = await impl[u.name](u.input || {});
      const block = ev.find(out.match(/^E\d+/)?.[0] || '')?.block;
      if (block) seen.set(key, { id: block.id });
      call.evidence = block?.id;
      emit({ type: 'evidence', tool: u.name, block });
      return { type: 'tool_result', tool_use_id: u.id, content: out };
    } catch (e) {
      call.error = e.message;
      seen.set(key, { error: e.message });
      emit({ type: 'step_error', tool: u.name, label, error: e.message });
      return { type: 'tool_result', tool_use_id: u.id, content: `Error: ${e.message}`, is_error: true };
    }
  };
}

export async function runAgent(input, emit = () => {}) {
  const ev = new Evidence();
  const { impl, defs } = buildTools({ comps: input.comps, ev });
  const tools = [...defs, submitTool];
  const messages = [{ role: 'user', content: BRIEF(input) }];
  const usage = { input: 0, output: 0, cache_read: 0 };
  const calls = [];
  const run = toolRunner({ impl, ev, emit, calls });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client().beta.messages.create({
      model: MODEL, max_tokens: 16000, system: SYSTEM, tools, messages,
      thinking: { type: 'adaptive' }, output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' }, ...FALLBACK,
    });
    usage.input += res.usage.input_tokens; usage.output += res.usage.output_tokens; usage.cache_read += res.usage.cache_read_input_tokens || 0;
    if (res.stop_reason === 'refusal') throw new Error('The model declined this request.');
    messages.push({ role: 'assistant', content: res.content });

    const uses = res.content.filter((b) => b.type === 'tool_use');
    const submit = uses.find((u) => u.name === 'submit_report');
    if (submit) {
      const report = submit.input;
      const dropped = cleanCitations(report, ev);
      const { numbers, citations } = checkNumbers(report, ev);
      return { report, evidence: ev.blocks, meta: { model: MODEL, calls, usage, dropped_citations: dropped, numbers, citations, finished: new Date().toISOString() } };
    }
    if (!uses.length) {
      messages.push({ role: 'user', content: 'Call submit_report now with the plan.' });
      continue;
    }
    const results = await Promise.all(uses.map(run));
    messages.push({ role: 'user', content: results });
  }
  throw new Error('The agent ran out of turns before filing a report.');
}

export async function runBaseline(input) {
  const res = await client().beta.messages.create({
    model: MODEL, max_tokens: 16000, system: BASELINE_SYSTEM,
    messages: [{ role: 'user', content: BRIEF(input) }],
    thinking: { type: 'adaptive' }, output_config: { effort: 'low', format: { type: 'json_schema', schema: REPORT_SCHEMA } },
    ...FALLBACK,
  });
  if (res.stop_reason === 'refusal') throw new Error('The model declined this request.');
  const text = res.content.find((b) => b.type === 'text')?.text;
  return JSON.parse(text);
}
