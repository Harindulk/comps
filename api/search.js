// GET /api/search?q=hades: video game lookup for the comps picker.
import { qloo } from '../lib/qloo.js';

export async function GET(request) {
  const q = new URL(request.url).searchParams.get('q')?.trim().slice(0, 80);
  if (!q || q.length < 2) return Response.json({ results: [] });
  try {
    const r = await qloo('/search', { query: q, types: 'urn:entity:videogame', take: 8 });
    const results = (r.results || []).map((e) => ({
      id: e.entity_id, name: e.name, popularity: e.popularity,
      year: e.properties?.release_year || e.properties?.release_date?.slice(0, 4) || null,
      image: e.properties?.image?.url || null,
    }));
    return Response.json({ results }, { headers: { 'Cache-Control': 's-maxage=86400' } });
  } catch (e) {
    return Response.json({ error: e.message, results: [] }, { status: 502 });
  }
}
