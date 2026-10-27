import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Evidence } from './tools.js';
import { cleanCitations } from './agent.js';

test('cleanCitations keeps real evidence IDs and drops invented ones', () => {
  const ev = new Evidence();
  ev.add({ kind: 'list', title: 't', endpoint: '/v2/insights', params: {}, items: [{ name: 'A' }, { name: 'B' }] });
  const report = {
    positioning: '', sections: [{ kind: 'music', heading: 'h', claims: [{ text: 'x', evidence: ['E1.2', 'E1.3', 'E2.1', 'E1'] }] }],
    store_copy: { short_description: '', tags: [], evidence: ['E9'] },
    player_panel: [{ name: 'p', profile: '', reaction: '', verdict: 'buy', evidence: ['E1.1'] }],
  };
  assert.equal(cleanCitations(report, ev), 3);
  assert.deepEqual(report.sections[0].claims[0].evidence, ['E1.2', 'E1']);
  assert.deepEqual(report.store_copy.evidence, []);
  assert.deepEqual(report.player_panel[0].evidence, ['E1.1']);
});
