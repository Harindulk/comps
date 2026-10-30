// Nearest town to a point, from GeoNames cities15000 (CC BY 4.0, geonames.org): [name, countryCode, lat, lon].
import { createRequire } from 'node:module';
// require() so Vercel's file tracing reliably bundles the JSON with the function.
const places = createRequire(import.meta.url)('./places.json');

const R = 6371, rad = Math.PI / 180;
const km = (lat1, lon1, lat2, lon2) => {
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// shortcut: linear scan over ~32k towns (a few ms per call); use a grid index if it shows up in profiles.
export function nearestPlace(lat, lon) {
  let best = null, d = Infinity;
  for (const p of places) {
    const x = km(lat, lon, p[2], p[3]);
    if (x < d) { d = x; best = p; }
  }
  return best && { name: best[0], cc: best[1], km: Math.round(d) };
}

// "near Buffalo, US", or "rural, ~80 km from Buffalo, US" when the nearest town is over 40 km away.
export function placeLabel(lat, lon) {
  const p = nearestPlace(lat, lon);
  if (!p) return `${lat}, ${lon}`;
  return p.km > 40 ? `rural, ~${p.km} km from ${p.name}, ${p.cc}` : `near ${p.name}, ${p.cc}`;
}
