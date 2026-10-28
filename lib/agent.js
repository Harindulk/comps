// The Comps agent: Claude plans which Qloo calls to make, reads the evidence, and files a
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
  required: ['positioning', 'sections', 'store_copy', 'player_panel'],
  properties: {
    positioning: { type: 'string', description: 'One sentence: who this launch is for and what it should feel like, as the data shows it.' },
    sections: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['kind', 'heading', 'claims'],
        properties: { kind: { type: 'string', enum: SECTION_KINDS }, heading: { type: 'string' }, claims: { type: 'array', items: claim } },
      },
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

export const FORMATS = {
  game: { what: 'game', audience: 'players', copy: 'store page' },
  music: { what: 'album or tour', audience: 'listeners and ticket buyers', copy: 'press kit blurb' },
  comedy: { what: 'comedy special or tour', audience: 'fans and ticket buyers', copy: 'show description' },
  film: { what: 'film or series', audience: 'viewers', copy: 'logline and synopsis' },
};

const BRIEF = (input) => `Format: ${FORMATS[input.format].what}
Title: ${input.game.name}
Pitch: ${input.game.pitch}
Comps (Qloo IDs): ${input.comps.map((c) => `${c.name} (${c.type || 'entity'}, ${c.id})`).join('; ')}`;

const SYSTEM = `You are Comps, a launch strategist for independent creators: game developers, musicians, comedians and film-makers. A creator gives you what they are launching and its comps: the games, artists, comedians, films or shows their audience already loves. You find out, with Qloo's cultural taste data, what that audience loves in other media, who they are, where they live and where attention is moving, then write a launch plan for the format named in the brief.

How to work:
- Gather evidence first. Call several tools in parallel in each turn. Cover at least: music artists, podcasts, one screen domain (TV or movies), brands, tags (scope "medium" for the format's own tags, "culture" for themes and moods), demographics, geography for two or three countries or cities that suit this launch and its comps (for a tour, the cities to route through) (for example the comps' home markets and one large growth market), one compare_audiences call that splits the comps, and check_momentum on your strongest artist and podcast candidates. Eight to fourteen calls is normal.
- Every tool result lists items with IDs such as E3.2. Every claim you file must cite the item IDs it rests on. Cite only IDs you were given; never invent names, numbers or IDs. If the data does not support a point, leave the point out.
- Turn data into decisions an independent creator can act on this month: whose sound to brief for the trailer (or which acts to open for or book as openers), which podcasts and creators to pitch, which visual references to put on the mood board, which brands could sponsor or cross-promote, which countries or cities to target first, when to launch, what the copy should say. Name the specific entity and say why the data points to it, using its affinity or skew. Prefer entities with high affinity but lower popularity where they fit: they are reachable, while the mega-popular ones correlate with everything.
- Be honest about weak data: low affinity, a demographic that is close to zero, comps that disagree. Put those in the risks section.
- The panel (player_panel) is four invented but data-grounded members of the audience: each profile is built from cited demographic, geographic and taste evidence (age band, a place where comp fans over-index, two or three things they love). Each reacts in their own voice to the pitch in two or three sentences, says what would make them buy a copy or a ticket, and gives a verdict (buy, wishlist meaning "interested, not yet", or pass). store_copy is the format's own copy: a store page for a game, a press kit blurb for music, a show description for comedy, a logline for film.
- When you have enough, call submit_report once. Use each section kind at most once, in this order: audience, music, look, creators, markets, timing, risks. Two to five claims per section, each one or two sentences.`;

const BASELINE_SYSTEM = `You are a launch strategist for independent creators. Write a launch plan for the launch below using only your general knowledge. You have no data source. Use each section kind at most once, in this order: audience, music, look, creators, markets, timing, risks; two to five claims per section; every evidence array must be empty. The player_panel is four imagined audience members reacting to the pitch; store_copy is the format's own copy.`;

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
  return dropped;
}

const TOOL_LABEL = {
  audience_taste: (i) => `Asking Qloo which ${i.domain === 'person' ? 'people' : `${String(i.domain).replace('_', ' ')}s`} this audience loves`,
  audience_tags: (i) => (i.scope === 'culture' ? 'Reading the cultural tags this audience over-indexes on' : 'Reading the genre and style tags this audience over-indexes on'),
  audience_demographics: () => 'Checking the age and gender skew of each comp\'s audience',
  audience_geography: (i) => `Mapping where comp fans concentrate in ${i.region}`,
  compare_audiences: () => 'Comparing what splits the comp audiences',
  check_momentum: (i) => `Checking whether ${(i.items || []).length} picks are rising or fading`,
};

export async function runAgent(input, emit = () => {}) {
  const ev = new Evidence();
  const { impl, defs } = buildTools({ comps: input.comps, ev });
  const tools = [...defs, submitTool];
  const messages = [{ role: 'user', content: BRIEF(input) }];
  const usage = { input: 0, output: 0, cache_read: 0 };
  const calls = [];

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
      return { report, evidence: ev.blocks, meta: { model: MODEL, calls, usage, dropped_citations: dropped, finished: new Date().toISOString() } };
    }
    if (!uses.length) {
      messages.push({ role: 'user', content: 'Call submit_report now with the plan.' });
      continue;
    }
    const results = await Promise.all(uses.map(async (u) => {
      if (calls.length >= MAX_CALLS && u.name !== 'submit_report') {
        return { type: 'tool_result', tool_use_id: u.id, content: `Call budget of ${MAX_CALLS} used. Call submit_report now with what you have.`, is_error: true };
      }
      calls.push({ tool: u.name, input: u.input });
      const label = TOOL_LABEL[u.name]?.(u.input) || u.name;
      emit({ type: 'step', tool: u.name, label });
      try {
        if (!impl[u.name]) throw new Error(`Unknown tool ${u.name}`);
        const out = await impl[u.name](u.input || {});
        const block = ev.find(out.match(/^E\d+/)?.[0] || '')?.block;
        calls.find((c) => c.input === u.input).evidence = block?.id;
        emit({ type: 'evidence', tool: u.name, block });
        return { type: 'tool_result', tool_use_id: u.id, content: out };
      } catch (e) {
        emit({ type: 'step_error', tool: u.name, label, error: e.message });
        return { type: 'tool_result', tool_use_id: u.id, content: `Error: ${e.message}`, is_error: true };
      }
    }));
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
