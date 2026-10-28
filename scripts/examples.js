// Builds the cached example reports: node --env-file=.env scripts/examples.js [slug]
// Output goes to public/examples/, which is gitignored: Qloo data must not land in a public repo.
import fs from 'node:fs/promises';
import { qloo } from '../lib/qloo.js';
import { runAgent, runBaseline } from '../lib/agent.js';

const EXAMPLES = [
  { slug: 'drive-away', game: 'Drive Away', pitch: 'A one-thumb endless highway driving game for phones: weave through oncoming traffic, unlock cars and chase your best distance.', comps: ['Subway Surfers', 'Temple Run', 'Asphalt 9: Legends'] },
  { slug: 'diner-rush', game: 'Diner Rush Tycoon', pitch: 'An idle-arcade restaurant tycoon for web and phones: serve a queue of hungry customers, hire staff and unlock new diners down the street.', comps: ['Overcooked!', 'Diner Dash', 'Cooking Mama: Cook Off'] },
  { slug: 'the-final-room', game: 'The Final Room', pitch: 'A two-player online co-op horror game for Steam: one night, two friends, a road-trip stop that goes wrong. About two hours, $7.99.', comps: ['Phasmophobia', 'Lethal Company', 'Content Warning'] },
];

const dir = new URL('../public/examples/', import.meta.url);
await fs.mkdir(dir, { recursive: true });
const only = process.argv[2];

for (const ex of EXAMPLES.filter((e) => !only || e.slug === only)) {
  const comps = [];
  for (const name of ex.comps) {
    const r = await qloo('/search', { query: name, types: 'urn:entity:videogame', take: 5 });
    const hit = r.results?.find((e) => e.name.toLowerCase() === name.toLowerCase()) || r.results?.[0];
    if (hit) comps.push({ id: hit.entity_id, name: hit.name, image: hit.properties?.image?.url || null });
    console.log(`${ex.slug}: ${name} -> ${hit ? `${hit.name} ${hit.entity_id}` : 'not found'}`);
  }
  const input = { game: { name: ex.game, pitch: ex.pitch }, comps };
  const t = Date.now();
  const [result, baseline] = await Promise.all([
    runAgent(input, (m) => m.type === 'step' && console.log(`  ${m.label}`)),
    runBaseline(input).catch((e) => ({ error: e.message })),
  ]);
  await fs.writeFile(new URL(`${ex.slug}.json`, dir), JSON.stringify({ input, ...result, baseline }));
  console.log(`${ex.slug}: done in ${Math.round((Date.now() - t) / 1000)}s, ${result.evidence.length} evidence blocks, usage ${JSON.stringify(result.meta.usage)}, dropped ${result.meta.dropped_citations}`);
}

const index = [];
for (const ex of EXAMPLES) {
  try {
    const run = JSON.parse(await fs.readFile(new URL(`${ex.slug}.json`, dir), 'utf8'));
    const claims = run.report.sections.flatMap((x) => x.claims);
    index.push({
      slug: ex.slug, game: ex.game, positioning: run.report.positioning, comps: run.input.comps,
      calls: run.meta.calls.length, cited: claims.filter((c) => c.evidence.length).length, claims: claims.length, own: true,
      with_hook: run.report.decisions?.find((d) => d.label === 'hook')?.text,
      without_hook: run.baseline?.decisions?.find((d) => d.label === 'hook')?.text,
    });
  } catch { /* not built yet */ }
}
await fs.writeFile(new URL('index.json', dir), JSON.stringify(index, null, 2));
