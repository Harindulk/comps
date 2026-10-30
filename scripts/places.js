// Builds lib/places.json from GeoNames cities15000.txt (https://download.geonames.org/export/dump/cities15000.zip, CC BY 4.0).
// Usage: node scripts/places.js cities15000.txt lib/places.json. Parses the TSV only.
import fs from 'node:fs';
const [src, out] = process.argv.slice(2);
const rows = [];
for (const line of fs.readFileSync(src, 'utf8').split('\n')) {
  const f = line.split('\t');
  if (f.length < 15) continue;
  const [name, lat, lon, code, cc, pop] = [f[2], Number(f[4]), Number(f[5]), f[7], f[8], Number(f[14])];
  // skip city sections (PPLX) and historical places, so "near" names a real town
  if (!name || !/^[\x20-\x7e]+$/.test(name) || pop < 15000 || code === 'PPLX' || code.startsWith('PPLH') || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  rows.push([name, cc, Math.round(lat * 100) / 100, Math.round(lon * 100) / 100]);
}
fs.writeFileSync(out, JSON.stringify(rows));
console.log(rows.length, 'places', fs.statSync(out).size, 'bytes');
