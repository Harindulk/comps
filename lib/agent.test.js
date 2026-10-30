import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Evidence, markNiche, closeName } from './tools.js';
import { cleanCitations, checkNumbers, toolRunner, TOOL_LABEL, REPORT_SCHEMA } from './agent.js';

test('cleanCitations keeps real evidence IDs and drops invented ones', () => {
  const ev = new Evidence();
  ev.add({ kind: 'list', title: 't', endpoint: '/v2/insights', params: {}, items: [{ name: 'A' }, { name: 'B' }] });
  const report = {
    positioning: '', sections: [{ kind: 'music', heading: 'h', claims: [{ text: 'x', evidence: ['E1.2', 'E1.3', 'E2.1', 'E1'] }] }],
    store_copy: { short_description: '', tags: [], evidence: ['E9'] },
    player_panel: [{ name: 'p', profile: '', reaction: '', verdict: 'buy', evidence: ['E1.1'] }],
    decisions: [{ label: 'who', text: '', evidence: ['E1.2', 'E4.4'] }],
    shortlist_verdicts: [{ name: 'x', verdict: 'drop', reason: '', evidence: ['E7'] }],
  };
  assert.equal(cleanCitations(report, ev), 5);
  assert.deepEqual(report.decisions[0].evidence, ['E1.2']);
  assert.deepEqual(report.shortlist_verdicts[0].evidence, []);
  assert.deepEqual(report.sections[0].claims[0].evidence, ['E1.2', 'E1']);
  assert.deepEqual(report.store_copy.evidence, []);
  assert.deepEqual(report.player_panel[0].evidence, ['E1.1']);
});

test('markNiche flags high-affinity, lower-popularity items only', () => {
  const items = [
    { name: 'mega', affinity: 0.95, popularity: 0.99 },
    { name: 'gem', affinity: 0.94, popularity: 0.70 },
    { name: 'weak', affinity: 0.80, popularity: 0.60 },
    { name: 'mid', affinity: 0.90, popularity: 0.90 },
    { name: 'also', affinity: 0.85, popularity: 0.95 },
    { name: 'low', affinity: 0.82, popularity: 0.97 },
  ];
  markNiche(items);
  assert.deepEqual(items.filter((i) => i.niche).map((i) => i.name), ['gem']);
});

test('closeName accepts near-identical names only', () => {
  assert.equal(closeName('last podcast on the left', 'last podcast on the left'), true);
  assert.equal(closeName('hot ones', 'hot ones show'), false);
  assert.equal(closeName('markiplier', 'markiplier tv'), true);
  assert.equal(closeName('smosh', 'smosh mouth'), false);
});

const evFixture = () => {
  const ev = new Evidence();
  ev.add({ kind: 'list', items: [{ name: 'A', affinity: 0.941, popularity: 0.7, driven_by: [{ name: 'c', score: 0.88 }] }, { name: 'B', affinity: 0.5, popularity: 0.99 }] });
  ev.add({ kind: 'demographics', items: [{ name: 'comp', age: { '25_to_29': 0.32 }, gender: { female: -0.21 } }] });
  ev.add({ kind: 'trending', items: [{ name: 'T', percentile: 0.97, change: 0.05 }] });
  return ev;
};

test('checkNumbers matches quoted decimals against cited evidence only', () => {
  const ev = evFixture();
  const report = {
    decisions: [
      { label: 'who', text: 'Fans aged 25-29 over-index at +0.32 and women under-index by 0.21 in 2026.', evidence: ['E2'] },
      { label: 'hook', text: 'A at 0.94 affinity (driven by c, 0.88), not B at 0.5.', evidence: ['E1.1'] },
      { label: 'where', text: 'Price it at $7.99; E4.6 says nothing.', evidence: [] },
    ],
    sections: [{ kind: 'music', heading: 'h', claims: [{ text: 'A sits at 0.941.', evidence: ['E1'] }, { text: 'T is rising, -0.6 then +0.05.', evidence: ['E3.1'] }] }],
    shortlist_verdicts: [{ name: 'Pod', verdict: 'unscored', reason: 'Qloo has no data for it.', evidence: [] }],
    store_copy: { short_description: 'Loved at 0.97.', tags: [], evidence: ['E1'] },
    player_panel: [{ name: 'p', profile: '', reaction: '', verdict: 'buy', evidence: ['E1.2', 'E3'] }],
  };
  const { numbers, citations } = checkNumbers(report, ev);
  assert.equal(numbers.checked, 9);
  assert.equal(numbers.matched, 6);
  assert.deepEqual(numbers.unmatched, [
    { where: 'decision hook', value: '0.5' },
    { where: 'section music claim 2', value: '-0.6' },
    { where: 'store copy', value: '0.97' },
  ]);
  assert.deepEqual(citations, { item: 3, block: 4 });
  assert.equal(report.sections[0].claims.length, 2);
});

test('checkNumbers accepts coordinates, hedged numbers and range ends, and reads a spaced dash as a range', () => {
  const ev = new Evidence();
  ev.add({ kind: 'heatmap', items: [{ name: 'near Buffalo, US', lat: 42.89, lon: -78.88, affinity: 0.709, popularity: 0.731 }] });
  const report = {
    decisions: [{ label: 'where', text: 'Target near Buffalo (42.89, -78.88), similarity about 0.70–0.73, or 0.71 - 0.73.', evidence: ['E1'] }],
    sections: [], shortlist_verdicts: [], store_copy: { short_description: 'Exactly 0.70.', tags: [], evidence: ['E1'] }, player_panel: [],
  };
  const { numbers } = checkNumbers(report, ev);
  assert.equal(numbers.checked, 7);
  assert.deepEqual(numbers.unmatched, [{ where: 'store copy', value: '0.70' }]);
});

test('toolRunner records failures with an error, reuses them, and keeps them out of the budget', async () => {
  const ev = new Evidence();
  let hits = 0;
  const impl = {
    async boom() { hits++; throw new Error('Qloo 429 on /v2/insights'); },
    async ok({ n }) { const b = ev.add({ kind: 'list', items: [{ name: String(n) }] }); return `${b.id}: ok`; },
  };
  const calls = [], events = [];
  const run = toolRunner({ impl, ev, emit: (e) => events.push(e.type), calls });
  const first = await run({ id: 't1', name: 'boom', input: { x: 1 } });
  const again = await run({ id: 't2', name: 'boom', input: { x: 1 } });
  assert.equal(hits, 1);
  assert.equal(first.is_error, true);
  assert.equal(again.is_error, true);
  assert.match(again.content, /429/);
  assert.deepEqual(calls, [{ tool: 'boom', input: { x: 1 }, error: 'Qloo 429 on /v2/insights' }]);
  for (let n = 0; n < 18; n++) assert.equal((await run({ id: `o${n}`, name: 'ok', input: { n } })).is_error, undefined);
  const over = await run({ id: 'o18', name: 'ok', input: { n: 18 } });
  assert.match(over.content, /budget of 18/);
  assert.equal(calls.length, 19);
  assert.equal(calls[1].evidence, 'E1');
  assert.match((await run({ id: 'r', name: 'ok', input: { n: 0 } })).content, /Same call as before; its result is E1/);
  assert.ok(events.includes('step_error'));
});

test('pitch_check label names the domain in plain words', () => {
  assert.equal(TOOL_LABEL.pitch_check({ names: ['a'], domain: 'podcast' }), 'Scoring your 1 shortlisted podcast against these players');
  assert.equal(TOOL_LABEL.pitch_check({ names: ['a', 'b'], domain: 'tv_show' }), 'Scoring your 2 shortlisted TV shows against these players');
  assert.equal(TOOL_LABEL.pitch_check({ names: ['a', 'b'], domain: 'videogame' }), 'Scoring your 2 shortlisted games against these players');
  assert.equal(TOOL_LABEL.pitch_check({ names: ['a', 'b'], domain: 'person' }), 'Scoring your 2 shortlisted people against these players');
  assert.equal(TOOL_LABEL.pitch_check({ names: ['a', 'b', 'c'], domain: 'movie' }), 'Scoring your 3 shortlisted films against these players');
  assert.deepEqual(REPORT_SCHEMA.properties.shortlist_verdicts.items.properties.verdict.enum, ['keep', 'test', 'drop', 'unscored']);
});
