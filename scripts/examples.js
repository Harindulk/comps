// Builds the cached example reports: node --env-file=.env scripts/examples.js [slug]
// Output goes to public/examples/, which is gitignored: Qloo data must not land in a public repo.
import fs from 'node:fs/promises';
import { qloo } from '../lib/qloo.js';
import { runAgent, runBaseline } from '../lib/agent.js';

const EXAMPLES = [
  { slug: 'the-final-room', format: 'game', game: 'The Final Room', pitch: 'A two-player online co-op horror game for Steam: one night, two friends, a road-trip stop that goes wrong. About two hours, $7.99.', comps: [['Phasmophobia', 'urn:entity:videogame'], ['Lethal Company', 'urn:entity:videogame'], ['Content Warning', 'urn:entity:videogame']] },
  { slug: 'drive-away', format: 'game', game: 'Drive Away', pitch: 'A one-thumb endless highway driving game for phones: weave through oncoming traffic, unlock cars and chase your best distance.', comps: [['Subway Surfers', 'urn:entity:videogame'], ['Temple Run', 'urn:entity:videogame'], ['Asphalt 9: Legends', 'urn:entity:videogame']] },
  { slug: 'small-talk-tour', format: 'comedy', game: 'Small Talk Tour', pitch: 'A first headline stand-up tour about growing up between two countries: 20 club and theatre dates in the US.', comps: [['Nate Bargatze', 'urn:entity:person'], ['Hasan Minhaj', 'urn:entity:person'], ['Ali Wong', 'urn:entity:person']] },
  { slug: 'neon-debt', format: 'film', game: 'Neon Debt', pitch: 'A low-budget, darkly comic thriller about two strangers whose road-rage feud spirals into a war between their families.', comps: [['Beef', 'urn:entity:tv_show'], ['Uncut Gems', 'urn:entity:movie'], ['Everything Everywhere All at Once', 'urn:entity:movie']] },
  { slug: 'night-bus-home', format: 'music', game: 'Night Bus Home', pitch: 'A debut EP of warm, late-night instrumental funk and house, followed by a 12-city club tour.', comps: [['Khruangbin', 'urn:entity:artist'], ['Fred again..', 'urn:entity:artist'], ['Kaytranada', 'urn:entity:artist']] },
];

const dir = new URL('../public/examples/', import.meta.url);
await fs.mkdir(dir, { recursive: true });
const only = process.argv[2];

for (const ex of EXAMPLES.filter((e) => !only || e.slug === only)) {
  const comps = [];
  for (const [name, type] of ex.comps) {
    const r = await qloo('/search', { query: name, types: type, take: 5 });
    const hit = r.results?.find((e) => e.name.toLowerCase() === name.toLowerCase()) || r.results?.[0];
    if (hit) comps.push({ id: hit.entity_id, name: hit.name, type, image: hit.properties?.image?.url || null });
    console.log(`${ex.slug}: ${name} -> ${hit ? `${hit.name} ${hit.entity_id}` : 'not found'}`);
  }
  const input = { format: ex.format, game: { name: ex.game, pitch: ex.pitch }, comps };
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
      slug: ex.slug, format: ex.format, game: ex.game, positioning: run.report.positioning, comps: run.input.comps,
      calls: run.meta.calls.length, cited: claims.filter((c) => c.evidence.length).length, claims: claims.length,
    });
  } catch { /* not built yet */ }
}
await fs.writeFile(new URL('index.json', dir), JSON.stringify(index, null, 2));
