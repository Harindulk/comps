// Qloo-backed tools the agent can call. Each call becomes one evidence block (E1, E2, ...)
// whose items (E1.1, E1.2, ...) the report must cite.
import { qloo } from './qloo.js';

const DOMAINS = ['artist', 'podcast', 'tv_show', 'movie', 'book', 'brand', 'videogame', 'person'];
const TRENDING_DOMAINS = ['artist', 'podcast', 'tv_show', 'movie', 'brand', 'person'];
// Place-listing tag families (payment cards, hotel stars, dishes) that leak into cultural tag results.
const NOISE_TAGS = /credit_card|hotel_rating|cost_description|specialty_dish|inclusivity|amenity|accessibility|offerings|payments|nearby/;
const round = (x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x);
const day = (d) => d.toISOString().slice(0, 10);

export class Evidence {
  constructor() { this.blocks = []; }
  add(block) {
    const id = `E${this.blocks.length + 1}`;
    block.id = id;
    block.items = (block.items || []).map((it, i) => ({ ...it, id: `${id}.${i + 1}` }));
    this.blocks.push(block);
    return block;
  }
  find(ref) {
    const [b, i] = ref.split('.');
    const block = this.blocks.find((x) => x.id === b);
    return block && (i ? block.items[Number(i) - 1] && { block, item: block.items[Number(i) - 1] } : { block });
  }
  has(ref) { return !!this.find(ref); }
}

// Which comp drove each recommendation, from feature.explainability.
function explain(entity, compNames) {
  const ex = entity.query?.explainability?.['signal.interests.entities'] || [];
  return ex
    .map((e) => ({ name: compNames[e.entity_id] || e.entity_id, score: round(e.score) }))
    .sort((a, b) => b.score - a.score);
}

// Niche fit: affinity in the top half of its list while popularity is in the bottom third.
// Reachable picks, unlike mega-popular entities that correlate with everything.
export function markNiche(items) {
  const sorted = (key) => items.map((i) => i[key]).filter((x) => typeof x === 'number').sort((a, b) => a - b);
  const aff = sorted('affinity'), pop = sorted('popularity');
  if (items.length < 4) return items;
  const affMid = aff[Math.floor(aff.length / 2)], popLow = pop[Math.floor(pop.length / 3)];
  for (const i of items) i.niche = i.affinity >= affMid && i.popularity < popLow;
  return items;
}

const line = (it) =>
  `${it.id} ${it.name}` +
  (it.affinity != null ? ` | affinity ${it.affinity}` : '') +
  (it.popularity != null ? ` | popularity ${it.popularity}` : '') +
  (it.tags?.length ? ` | ${it.tags.join(', ')}` : '') +
  (it.niche ? ' | niche fit' : '') +
  (it.driven_by?.length ? ` | driven by ${it.driven_by.slice(0, 2).map((d) => `${d.name} ${d.score}`).join(', ')}` : '');

export function buildTools(ctx) {
  const { comps, ev } = ctx;
  const ids = comps.map((c) => c.id).join(',');
  const compNames = Object.fromEntries(comps.map((c) => [c.id, c.name]));

  const impl = {
    async audience_taste({ domain, take = 10 }) {
      if (!DOMAINS.includes(domain)) throw new Error(`domain must be one of ${DOMAINS.join(', ')}`);
      const params = { 'filter.type': `urn:entity:${domain}`, 'signal.interests.entities': ids, 'feature.explainability': true, take: Math.min(take, 20) };
      const r = await qloo('/v2/insights', params);
      const items = (r.results?.entities || []).filter((e) => !compNames[e.entity_id]).map((e) => ({
        name: e.name, qloo_id: e.entity_id, domain, affinity: round(e.query?.affinity), popularity: round(e.popularity),
        tags: (e.tags || []).slice(0, 3).map((t) => t.name), driven_by: explain(e, compNames),
      }));
      markNiche(items);
      const b = ev.add({ kind: 'list', title: `What this audience also loves: ${domain === 'person' ? 'people' : `${domain.replace('_', ' ')}s`}`, endpoint: '/v2/insights', params, items });
      return `${b.id}: top ${domain} affinities for fans of the comps\n` + b.items.map(line).join('\n');
    },

    async audience_tags({ scope = 'medium', take = 20 }) {
      const params = { 'filter.type': 'urn:tag', 'signal.interests.entities': ids, take: Math.min(take + 15, 45) };
      if (scope === 'medium') params['filter.parents.types'] = comps[0].type || 'urn:entity:videogame';
      const r = await qloo('/v2/insights', params);
      const items = (r.results?.tags || []).filter((t) => !NOISE_TAGS.test(t.subtype || '')).map((t) => ({
        name: t.name, qloo_id: t.tag_id, kind: (t.subtype || '').replace('urn:tag:', '').split(':')[0], affinity: round(t.query?.affinity),
      }));
      items.splice(take);
      const b = ev.add({ kind: 'tags', title: scope === 'medium' ? 'Tags from the comps\' own medium' : 'Cultural tags this audience over-indexes on', endpoint: '/v2/insights', params, items });
      return `${b.id}: ${scope} taste tags\n` + b.items.map((it) => `${it.id} ${it.name} (${it.kind}) | affinity ${it.affinity}`).join('\n');
    },

    async audience_demographics() {
      const params = { 'filter.type': 'urn:demographics', 'signal.interests.entities': ids };
      const r = await qloo('/v2/insights', params);
      const items = (r.results?.demographics || []).map((d) => ({
        name: compNames[d.entity_id] || d.entity_id, qloo_id: d.entity_id,
        age: Object.fromEntries(Object.entries(d.query?.age || {}).map(([k, v]) => [k, round(v)])),
        gender: Object.fromEntries(Object.entries(d.query?.gender || {}).map(([k, v]) => [k, round(v)])),
      }));
      const b = ev.add({ kind: 'demographics', title: 'Age and gender skew of each comp audience', endpoint: '/v2/insights', params, items, note: 'Positive = over-indexes against the average Qloo user; negative = under-indexes.' });
      return `${b.id}: demographic skew per comp (positive = over-indexes vs average)\n` +
        b.items.map((it) => `${it.id} ${it.name} | age ${Object.entries(it.age).map(([k, v]) => `${k} ${v}`).join(', ')} | gender ${Object.entries(it.gender).map(([k, v]) => `${k} ${v}`).join(', ')}`).join('\n');
    },

    async audience_geography({ region }) {
      if (!region) throw new Error('region is required: a country or city name');
      const params = { 'filter.type': 'urn:heatmap', 'signal.interests.entities': ids, 'filter.location.query': region };
      const r = await qloo('/v2/insights', params);
      const where = r.query?.localities?.filter?.[0]?.disambiguation || region;
      // Rank by affinity weighted by popularity, so empty high-affinity cells (forests, deserts) don't top the list.
      const cells = (r.results?.heatmap || [])
        .map((h) => ({ lat: round(h.location?.latitude), lon: round(h.location?.longitude), geohash: h.location?.geohash, affinity: round(h.query?.affinity), popularity: round(h.query?.popularity) }))
        .sort((a, b) => b.affinity * b.popularity - a.affinity * a.popularity)
        .slice(0, 40)
        .map((c) => ({ ...c, name: `${c.lat}, ${c.lon}`, region: where }));
      const b = ev.add({ kind: 'heatmap', title: `Where comp fans concentrate in ${where}`, endpoint: '/v2/insights', params, items: cells, note: `Top 40 of ${r.results?.heatmap?.length ?? 0} cells, ranked by affinity × popularity.` });
      return `${b.id}: ${r.results?.heatmap?.length ?? 0} heatmap cells in ${where}; top 40 by affinity × popularity (lat, lon)\n` +
        b.items.slice(0, 25).map((it) => `${it.id} ${it.name} | affinity ${it.affinity} | popularity ${it.popularity}`).join('\n');
    },

    async compare_audiences({ a_ids, b_ids }) {
      const params = { 'a.signal.interests.entities': a_ids.join(','), 'b.signal.interests.entities': b_ids.join(','), take: 15 };
      const r = await qloo('/v2/analysis/compare', params);
      const tag = (side) => (t) => ({ name: t.name, qloo_id: t.tag_id, kind: (t.subtype || '').replace('urn:tag:', '').split(':')[0], side, score: round(t.query?.score) });
      const items = [
        ...(r.results?.tags || []).map(tag('shared')),
        ...(r.results?.a || []).map(tag('a only')),
        ...(r.results?.b || []).map(tag('b only')),
      ];
      const label = (list) => list.map((id) => compNames[id] || id).join(' + ');
      const b = ev.add({ kind: 'compare', title: `${label(a_ids)} (a) vs ${label(b_ids)} (b)`, endpoint: '/v2/analysis/compare', params, items });
      return `${b.id}: tags shared by and unique to ${label(a_ids)} (a) and ${label(b_ids)} (b)\n` +
        b.items.map((it) => `${it.id} ${it.name} (${it.kind}) | ${it.side}${it.score != null ? ` | similarity ${it.score}` : ''}`).join('\n');
    },

    async check_momentum({ items: refs = [] }) {
      const end = new Date();
      const start = new Date(end.getTime() - 300 * 864e5);
      const picked = refs.slice(0, 6).map((ref) => ({ ref, hit: ev.find(ref) })).filter((x) => x.hit?.item?.qloo_id && TRENDING_DOMAINS.includes(x.hit.item.domain));
      if (!picked.length) throw new Error(`Pass item IDs of artists, podcasts, TV shows, movies or brands from earlier audience_taste results, e.g. ["E1.2"]`);
      const items = await Promise.all(picked.map(async ({ ref, hit }) => {
        const it = hit.item;
        const params = { 'filter.type': `urn:entity:${it.domain}`, 'signal.interests.entities': it.qloo_id, 'filter.start_date': day(start), 'filter.end_date': day(end), take: 50 };
        try {
          const r = await qloo('/v2/trending', params);
          const series = (r.results?.trending || []).map((t) => ({ date: t.date, percentile: round(t.population_percentile), rank: Number(t.population_rank) })).sort((a, b) => a.date.localeCompare(b.date));
          const first = series[0], last = series.at(-1);
          return { name: it.name, qloo_id: it.qloo_id, domain: it.domain, source: ref, series, percentile: last?.percentile, change: first && last ? round(last.percentile - first.percentile) : undefined, from: first?.date, to: last?.date };
        } catch (e) {
          return { name: it.name, qloo_id: it.qloo_id, domain: it.domain, source: ref, series: [], error: e.message.slice(0, 120) };
        }
      }));
      const b = ev.add({ kind: 'trending', title: 'Momentum of picks from the taste results', endpoint: '/v2/trending', params: { 'filter.type': 'per item', window: `${day(start)} to ${day(end)}` }, items });
      return `${b.id}: population percentile over time (higher = more of the population engaging)\n` +
        b.items.map((it) => `${it.id} ${it.name} (from ${it.source}) | ${it.series.length ? `percentile ${it.percentile}, change ${it.change >= 0 ? '+' : ''}${it.change} from ${it.from} to ${it.to}` : 'no trending data'}`).join('\n');
    },
  };

  const defs = [
    { name: 'audience_taste', description: 'Qloo /v2/insights: what fans of the comps over-index on in one domain (music artists, podcasts, TV shows, movies, books, brands, other video games). Returns entities with affinity (0-1, how strongly comp fans favour it), popularity, and which comp drove each one. Use for trailer music, mood-board references, creator and podcast targets, and cross-promotion.', input_schema: { type: 'object', properties: { domain: { type: 'string', enum: DOMAINS }, take: { type: 'integer', description: 'How many results, 5-20' } }, required: ['domain'] } },
    { name: 'audience_tags', description: 'Qloo /v2/insights with filter.type=urn:tag: tags the comps\' fans over-index on. scope "medium" limits to tags of the comps\' own medium (for games: genres, categories, platforms; good for store tags); scope "culture" covers all media (themes, moods, archetypes: good for positioning and copy).', input_schema: { type: 'object', properties: { scope: { type: 'string', enum: ['medium', 'culture'] }, take: { type: 'integer' } } } },
    { name: 'audience_demographics', description: 'Qloo /v2/insights with filter.type=urn:demographics: age-band and gender skew of each comp\'s audience against the average Qloo user, as positive (over-index) or negative (under-index) scores.', input_schema: { type: 'object', properties: {} } },
    { name: 'audience_geography', description: 'Qloo /v2/insights with filter.type=urn:heatmap: where inside one country or city the comps\' fans concentrate. Returns the top cells as latitude, longitude with affinity and popularity. Qloo needs a country or city; continents do not work, and scores are relative within the region, so they show where to target inside a market rather than which market is bigger. When you name a place from coordinates, say "around" and name only cities you are sure of.', input_schema: { type: 'object', properties: { region: { type: 'string', description: 'A country or city, e.g. "Brazil", "Indonesia", "Tokyo"' } }, required: ['region'] } },
    { name: 'compare_audiences', description: 'Qloo /v2/analysis/compare: compares the taste profile of one set of comps (a) with another (b) and returns the tags they share (with a similarity score) and the tags unique to each side. Use to decide which comp the game should lean towards.', input_schema: { type: 'object', properties: { a_ids: { type: 'array', items: { type: 'string' }, description: 'Qloo IDs of comps' }, b_ids: { type: 'array', items: { type: 'string' } } }, required: ['a_ids', 'b_ids'] } },
    { name: 'check_momentum', description: 'Qloo /v2/trending: for up to six artists, podcasts, TV shows, movies or brands you already found with audience_taste, whether each one is gaining or losing attention (population percentile over the last ten months). Pass their evidence item IDs. Use to choose between candidates and for timing.', input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'string' }, description: 'Evidence item IDs, e.g. ["E1.1", "E2.3"]' } }, required: ['items'] } },
  ];

  return { impl, defs };
}
