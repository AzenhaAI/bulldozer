/**
 * One-off generator: src/data/country-meta.json — per ISO-3 country:
 *   { capital, lat, lon, coa }  (coat-of-arms = Wikimedia Commons FilePath URL)
 * Sourced from Wikidata (capital P36 → coordinate P625; coat of arms P94).
 * Run occasionally to refresh:  node scripts/fetch_country_meta.mjs
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'country-meta.json');
const Q = `SELECT ?iso3 ?capitalLabel ?coord ?coa WHERE {
  ?country wdt:P298 ?iso3 .
  OPTIONAL { ?country wdt:P36 ?capital . ?capital wdt:P625 ?coord . }
  OPTIONAL { ?country wdt:P94 ?coa . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

const res = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(Q), {
  headers: { 'User-Agent': 'BullDozer/1.0 (data viz; azenha.agent@gmail.com)', Accept: 'application/sparql-results+json' },
});
if (!res.ok) { console.error('Wikidata error', res.status); process.exit(1); }
const rows = (await res.json()).results.bindings;

const out = {};
for (const r of rows) {
  const iso = r.iso3?.value?.toUpperCase();
  if (!iso || iso.length !== 3) continue;
  const m = r.coord?.value?.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
  const rec = out[iso] || (out[iso] = {});
  // prefer a row that carries coordinates; keep first capital/coa seen
  if (m && rec.lat === undefined) { rec.capital = r.capitalLabel?.value; rec.lon = +m[1]; rec.lat = +m[2]; }
  if (r.coa?.value && !rec.coa) rec.coa = r.coa.value.replace(/^http:/, 'https:'); // avoid mixed-content blocking on https
  if (rec.capital === undefined && r.capitalLabel?.value) rec.capital = r.capitalLabel.value;
}
// drop entries with neither coordinates nor coat of arms
for (const k of Object.keys(out)) if (out[k].lat === undefined && !out[k].coa) delete out[k];

await writeFile(OUT, JSON.stringify(out));
console.log('✓ country-meta.json:', Object.keys(out).length, 'countries');
console.log('  sample FIN:', JSON.stringify(out.FIN));
