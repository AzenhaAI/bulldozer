/**
 * Builds the data bundle for the /macro globe (GlobeExplorer.astro):
 *   - src/data/globe-indicators.json — per-country latest values, ranks and
 *     percentiles for 9 headline datasets + a composite score (mean oriented
 *     percentile across the 8 core ones, ≥4 required)
 *   - public/data/world-110m.json — Natural Earth topology for the client
 *   - public/vendor/{d3-array,d3-geo,topojson-client}.min.js — runtime libs
 *
 *   node scripts/gen_globe_data.mjs   (re-run after refreshing datasets)
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(readFileSync(join(ROOT, 'src/data', p + '.json'), 'utf8'));
const a2map = load('iso-alpha2');

const METRICS = [
  ['whr-happiness', 'surveys/whr-happiness', 'Happiness', '/10', 'high', 'd2', true],
  ['gdp-pc', 'macro/imf-gdp-per-capita-ppp', 'GDP per capita', 'PPP $', 'high', 'usd', true],
  ['life', 'macro/wb-life-expectancy', 'Life expectancy', 'years', 'high', 'd1', true],
  ['cpi', 'surveys/qog-ti-cpi', 'Corruption (CPI)', '/100 clean', 'high', 'd0', true],
  ['libdem', 'surveys/v-dem-v2x-libdem', 'Liberal democracy', '/1', 'high', 'd2', true],
  ['internet', 'surveys/gapminder-internet', 'Internet users', '%', 'high', 'd0', true],
  ['inflation', 'macro/imf-inflation', 'Inflation', '%', 'low', 'd1', true],
  ['growth', 'macro/imf-gdp-growth', 'GDP growth', '%', 'high', 'd1', true],
  ['pop', 'macro/imf-population', 'Population', '', 'none', 'pop', false],
];

const countries = {}, meta = {};
for (const [key, path, label, unit, good, fmt, inComposite] of METRICS) {
  const ds = load(path);
  const periods = [...new Set(ds.data.map((o) => o.period))].sort();
  // among the last 3 periods pick the one with the widest country coverage
  let best = null;
  for (const P of periods.slice(-3)) {
    const rows = ds.data.filter((o) => o.period === P && o.iso);
    if (!best || rows.length >= best.rows.length) best = { P, rows };
  }
  const sorted = [...best.rows].sort((a, b) => (good === 'low' ? a.value - b.value : b.value - a.value));
  sorted.forEach((r, i) => {
    const c = (countries[r.iso] ??= { n: r.entity, a2: a2map[r.iso] || '', v: {} });
    const pct = sorted.length > 1 ? Math.round((1 - i / (sorted.length - 1)) * 100) : 100;
    c.v[key] = [r.value, i + 1, good === 'none' ? null : pct];
  });
  meta[key] = { label, unit, good, fmt, period: best.P, n: best.rows.length, inComposite };
  console.log(' ', key.padEnd(14), best.P, best.rows.length, 'countries');
}
let scored = 0;
for (const iso in countries) {
  const c = countries[iso];
  const ps = METRICS.filter((m) => m[6]).map((m) => c.v[m[0]]?.[2]).filter((p) => p != null);
  if (ps.length >= 4) { c.score = Math.round(ps.reduce((a, b) => a + b, 0) / ps.length); scored++; }
}
writeFileSync(join(ROOT, 'src/data/globe-indicators.json'), JSON.stringify({ meta, countries }));

mkdirSync(join(ROOT, 'public/data'), { recursive: true });
mkdirSync(join(ROOT, 'public/vendor'), { recursive: true });
const NM = join(ROOT, 'node_modules');
copyFileSync(require.resolve('world-atlas/countries-110m.json'), join(ROOT, 'public/data/world-110m.json'));
copyFileSync(join(NM, 'd3-array/dist/d3-array.min.js'), join(ROOT, 'public/vendor/d3-array.min.js'));
copyFileSync(join(NM, 'd3-geo/dist/d3-geo.min.js'), join(ROOT, 'public/vendor/d3-geo.min.js'));
copyFileSync(join(NM, 'topojson-client/dist/topojson-client.min.js'), join(ROOT, 'public/vendor/topojson-client.min.js'));

console.log(`✓ globe-indicators.json (${Object.keys(countries).length} countries, ${scored} scored) + vendor libs + world topology`);
