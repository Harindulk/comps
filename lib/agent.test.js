import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Evidence, markNiche, closeName } from './tools.js';
import { cleanCitations } from './agent.js';

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
