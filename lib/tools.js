// Qloo-backed tools the agent can call. Each call becomes one evidence block (E1, E2, ...)
// whose items (E1.1, E1.2, ...) the report must cite.
import { qloo } from './qloo.js';

const DOMAINS = ['artist', 'podcast', 'tv_show', 'movie', 'book', 'brand', 'videogame', 'place'];
const round = (x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x);

export class Evidence {
  constructor() { this.blocks = []; }
  add(block) {
    const id = `E${this.blocks.length + 1}`;
    block.id = id;
    block.items = (block.items || []).map((it, i) => ({ ...it, id: `${id}.${i + 1}` }));
    this.blocks.push(block);
    return block;
  }
  has(ref) {
    const [b, i] = ref.split('.');
    const block = this.blocks.find((x) => x.id === b);
    return !!block && (!i || !!block.items[Number(i) - 1]);
  }
}

// Which comp drove each recommendation, from feature.explainability.
function explain(entity, compNames) {
  const ex = entity.query?.explainability?.['signal.interests.entities'] || [];
  return ex
    .map((e) => ({ name: compNames[e.entity_id] || e.entity_id, score: round(e.score) }))
    .sort((a, b) => b.score - a.score);
}

function entityItem(e, compNames) {
  return {
    name: e.name,
    qloo_id: e.entity_id,
    affinity: round(e.query?.affinity),
    popularity: round(e.popularity),
    subtype: e.subtype?.replace('urn:entity:', ''),
    tags: (e.tags || []).slice(0, 4).map((t) => t.name),
    driven_by: explain(e, compNames),
  };
}

const line = (it) =>
  `${it.id} ${it.name}` +
  (it.affinity != null ? ` | affinity ${it.affinity}` : '') +
  (it.popularity != null ? ` | popularity ${it.popularity}` : '') +
  (it.tags?.length ? ` | ${it.tags.join(', ')}` : '') +
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
      const items = (r.results?.entities || []).filter((e) => !compNames[e.entity_id]).map((e) => entityItem(e, compNames));
      const b = ev.add({ kind: 'list', title: `What these players also love: ${domain.replace('_', ' ')}s`, endpoint: '/v2/insights', params, items });
      return `${b.id}: top ${domain} affinities for fans of the comps\n` + b.items.map(line).join('\n');
    },

    async audience_tags({ take = 20 }) {
      const params = { 'filter.type': 'urn:tag', 'signal.interests.entities': ids, take: Math.min(take, 30) };
      const r = await qloo('/v2/insights', params);
      const items = (r.results?.tags || r.results?.entities || []).map((t) => ({
        name: t.name, qloo_id: t.tag_id || t.id || t.entity_id, kind: (t.subtype || t.type || '').replace('urn:tag:', '').split(':')[0], affinity: round(t.query?.affinity),
      }));
      const b = ev.add({ kind: 'tags', title: 'Taste tags these players over-index on', endpoint: '/v2/insights', params, items });
      return `${b.id}: taste tags\n` + b.items.map((it) => `${it.id} ${it.name} (${it.kind})${it.affinity != null ? ` | affinity ${it.affinity}` : ''}`).join('\n');
    },

    async audience_demographics() {
      const params = { 'filter.type': 'urn:demographics', 'signal.interests.entities': ids };
      const r = await qloo('/v2/insights', params);
      const rows = r.results?.demographics || [];
      const items = rows.map((d) => ({ name: compNames[d.entity_id] || d.entity_id, qloo_id: d.entity_id, age: d.query?.age || {}, gender: d.query?.gender || {} }));
      const b = ev.add({ kind: 'demographics', title: 'Age and gender skew of each comp audience', endpoint: '/v2/insights', params, items, note: 'Positive = over-indexes against the average Qloo user; negative = under-indexes.' });
      return `${b.id}: demographic skew per comp (positive = over-indexes vs average)\n` +
        b.items.map((it) => `${it.id} ${it.name} | age ${Object.entries(it.age).map(([k, v]) => `${k} ${round(v)}`).join(', ')} | gender ${Object.entries(it.gender).map(([k, v]) => `${k} ${round(v)}`).join(', ')}`).join('\n');
    },

    async audience_geography({ region, take = 40 }) {
      const params = { 'filter.type': 'urn:heatmap', 'signal.interests.entities': ids, take: Math.min(take, 60) };
      if (region) params['filter.location.query'] = region;
      const r = await qloo('/v2/insights', params);
      const cells = (r.results?.heatmap || []).map((h) => ({
        name: [h.query?.localities?.city?.name, h.query?.localities?.region?.name, h.query?.localities?.country?.name].filter(Boolean).join(', ') || h.location?.geohash,
        lat: h.location?.latitude, lon: h.location?.longitude, geohash: h.location?.geohash,
        affinity: round(h.query?.affinity), popularity: round(h.query?.popularity),
      })).sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
      const b = ev.add({ kind: 'heatmap', title: region ? `Where comp fans over-index in ${region}` : 'Where comp fans over-index', endpoint: '/v2/insights', params, items: cells });
      return `${b.id}: heatmap cells, highest affinity first\n` + b.items.slice(0, 25).map((it) => `${it.id} ${it.name} | affinity ${it.affinity} | popularity ${it.popularity}`).join('\n');
    },

    async compare_audiences({ a_ids, b_ids, domain }) {
      const params = { 'a.signal.interests.entities': a_ids.join(','), 'b.signal.interests.entities': b_ids.join(','), take: 15 };
      if (domain) params['filter.type'] = `urn:entity:${domain}`;
      const r = await qloo('/v2/analysis/compare', params);
      const items = (r.results?.entities || r.results?.tags || []).map((e) => ({
        name: e.name, qloo_id: e.entity_id || e.tag_id, subtype: (e.subtype || e.type || '').replace(/^urn:(entity|tag):/, ''),
        a: round(e.query?.a?.affinity ?? e.query?.affinity?.a), b: round(e.query?.b?.affinity ?? e.query?.affinity?.b), delta: round(e.query?.delta ?? e.query?.affinity_delta),
      }));
      const label = (list) => list.map((id) => compNames[id] || id).join(' + ');
      const b = ev.add({ kind: 'compare', title: `${label(a_ids)} vs ${label(b_ids)}`, endpoint: '/v2/analysis/compare', params, items });
      return `${b.id}: what separates ${label(a_ids)} (a) from ${label(b_ids)} (b)\n` + b.items.map((it) => `${it.id} ${it.name} (${it.subtype}) | a ${it.a} | b ${it.b} | delta ${it.delta}`).join('\n');
    },

    async comp_momentum() {
      const end = new Date();
      const start = new Date(end.getTime() - 120 * 864e5);
      const fmt = (d) => d.toISOString().slice(0, 10);
      const items = [];
      for (const c of comps) {
        const params = { 'filter.type': 'urn:entity:videogame', 'signal.interests.entities': c.id, 'filter.start_date': fmt(start), 'filter.end_date': fmt(end), take: 50 };
        try {
          const r = await qloo('/v2/trending', params);
          const series = (r.results?.trending || []).map((t) => ({ date: t.date, percentile: round(t.population_percentile), velocity: round(t.velocity_fold_change) })).reverse();
          const last = series.at(-1);
          items.push({ name: c.name, qloo_id: c.id, series, percentile: last?.percentile, velocity: last?.velocity });
        } catch (e) {
          items.push({ name: c.name, qloo_id: c.id, series: [], error: e.message.slice(0, 120) });
        }
      }
      const b = ev.add({ kind: 'trending', title: 'Momentum of each comp, last 120 days', endpoint: '/v2/trending', params: { 'filter.type': 'urn:entity:videogame', window: '120 days' }, items });
      return `${b.id}: comp momentum (population percentile, latest velocity fold change)\n` +
        b.items.map((it) => `${it.id} ${it.name} | ${it.series.length ? `percentile ${it.series[0].percentile} -> ${it.percentile} | velocity ${it.velocity}` : 'no trending data'}`).join('\n');
    },
  };

  const defs = [
    { name: 'audience_taste', description: 'Qloo /v2/insights: what fans of the comparable games over-index on in one domain (music artists, podcasts, TV shows, movies, books, brands, other video games, places). Returns entities with affinity, popularity and which comp drove each one. Use it for trailer music, art references, creator and podcast targets, and cross-promotion.', input_schema: { type: 'object', properties: { domain: { type: 'string', enum: DOMAINS }, take: { type: 'integer', description: 'How many results, 5-20' } }, required: ['domain'] } },
    { name: 'audience_tags', description: 'Qloo /v2/insights with filter.type=urn:tag: the genres, moods and themes the comps\' fans over-index on. Use for store tags, vibe and copy.', input_schema: { type: 'object', properties: { take: { type: 'integer' } } } },
    { name: 'audience_demographics', description: 'Qloo /v2/insights with filter.type=urn:demographics: age-bucket and gender skew for each comp\'s audience, as positive (over-index) or negative (under-index) scores.', input_schema: { type: 'object', properties: {} } },
    { name: 'audience_geography', description: 'Qloo /v2/insights with filter.type=urn:heatmap: where in the world (or inside one region) fans of the comps concentrate, by affinity. Leave region empty for the global view; pass a country or city name to zoom in. Use for localisation priority and launch markets.', input_schema: { type: 'object', properties: { region: { type: 'string', description: 'Optional country or city, e.g. "Brazil" or "Tokyo"' }, take: { type: 'integer' } } } },
    { name: 'compare_audiences', description: 'Qloo /v2/analysis/compare: what separates the audience of one set of comps (a) from another (b). Use to find which comp the game should lean towards and where audiences differ.', input_schema: { type: 'object', properties: { a_ids: { type: 'array', items: { type: 'string' } }, b_ids: { type: 'array', items: { type: 'string' } }, domain: { type: 'string', enum: DOMAINS } }, required: ['a_ids', 'b_ids'] } },
    { name: 'comp_momentum', description: 'Qloo /v2/trending: whether each comp is gaining or losing attention over the last 120 days. Use for launch timing.', input_schema: { type: 'object', properties: {} } },
  ];

  return { impl, defs };
}
