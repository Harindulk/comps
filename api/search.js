// GET /api/search?q=hades&types=urn:entity:videogame: entity lookup for the comps picker.
import { qloo } from '../lib/qloo.js';

export const TYPES = ['urn:entity:videogame', 'urn:entity:artist', 'urn:entity:person', 'urn:entity:movie', 'urn:entity:tv_show', 'urn:entity:book', 'urn:entity:podcast'];

export async function GET(request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim().slice(0, 80);
  const types = (url.searchParams.get('types') || TYPES[0]).split(',').filter((t) => TYPES.includes(t));
  if (!q || q.length < 2 || !types.length) return Response.json({ results: [] });
  try {
    const r = await qloo('/search', { query: q, types: types.join(','), take: 8 });
    const results = (r.results || []).map((e) => ({
      id: e.entity_id, name: e.name, type: e.types?.find((t) => types.includes(t)) || e.types?.[0], popularity: e.popularity,
      year: e.properties?.release_year || e.properties?.release_date?.slice(0, 4) || null,
      image: e.properties?.image?.url || null,
    }));
    return Response.json({ results }, { headers: { 'Cache-Control': 's-maxage=86400' } });
  } catch (e) {
    return Response.json({ error: e.message, results: [] }, { status: 502 });
  }
}
