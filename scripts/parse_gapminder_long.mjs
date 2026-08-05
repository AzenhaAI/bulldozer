/**
 * Long historical Gapminder series for the bubble chart / bar race:
 *  - income per person (PPP), 1800→2018  (local DDF)
 *  - life expectancy at birth, 1800→2020 (open-numbers GitHub)
 *  - total population, 1800→2020          (open-numbers GitHub)
 * geo → ISO3/name/region via the local entities file.
 *   node scripts/parse_gapminder_long.mjs
 */
import { readFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { REGION_4, writeDataset } from './lib/datasets.mjs';

const DIR = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey', 'Gapminder');
const SURV = join(homedir(), 'Projects', 'bulldozer', 'src', 'data', 'surveys');
const UA = { 'User-Agent': 'BullDozer/1.0 (azenha.agent@gmail.com)' };
const PARSED = new Date().toISOString().slice(0, 10);
const COMMON = { source: 'Gapminder', license: 'CC BY 4.0', url: 'https://www.gapminder.org/data/', parsedAt: PARSED };
const MAXY = 2020; // drop projections

async function geoMap() {
  const m = new Map();
  for (const r of parseCsvObjects(await readFile(join(DIR, 'ddf--entities--geo--country.csv'), 'utf8'))) {
    const iso = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (r.country && iso) m.set(r.country.toLowerCase(), { iso, name: r.name, region: REGION_4[r.world_4region] || 'Other' });
  }
  return m;
}

/** geo,time,value CSV (string) → observations. `scale` divides the value. */
function toObs(text, geo, scale = 1) {
  const rows = [];
  const lines = text.split('\n'); // header is geo,time,measure
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length < 3) continue;
    const g = geo.get((c[0] || '').toLowerCase()), year = Number(c[1]), v = Number(c[2]);
    if (!g || !year || year < 1800 || year > MAXY || Number.isNaN(v)) continue;
    rows.push({ entity: g.name, group: g.region, period: String(year), value: scale === 1 ? v : Math.round((v / scale) * 100) / 100, iso: g.iso });
  }
  return rows;
}
const fetchText = async (url) => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); };
const yrs = (o) => new Set(o.map((x) => x.period)).size;

async function main() {
  const geo = await geoMap();

  // income — local DDF (parseCsvObjects on geo,time,value)
  const incCsv = await readFile(join(DIR, 'ddf--datapoints--income_per_person_with_projections--by--geo--time.csv'), 'utf8');
  const income = toObs(incCsv, geo);
  await writeDataset('macro', 'gapminder-income', {
    title: 'Income per Person', valueLabel: 'GDP per capita, PPP (constant intl$)', unit: 'intl$', changeMode: 'pct', topic: 'economy',
    summary: 'Income per person — GDP per capita adjusted for inflation and price differences (PPP), the long Gapminder series back to 1800. Great for the bubble chart and bar race.', ...COMMON,
  }, income);
  console.log(`✓ gapminder-income: ${income.length} obs, ${yrs(income)} years`);

  // life expectancy — long (1800→2020) from open-numbers
  const lifeCsv = await fetchText('https://raw.githubusercontent.com/open-numbers/ddf--gapminder--life_expectancy/master/ddf--datapoints--life_expectancy_at_birth--by--geo--time.csv');
  const life = toObs(lifeCsv, geo);
  try { await unlink(join(SURV, 'gapminder-life-expectancy.json')); } catch {}
  await writeDataset('macro', 'gapminder-life-expectancy', {
    title: 'Life Expectancy', valueLabel: 'Life expectancy at birth (years)', unit: 'years', changeMode: 'pp', topic: 'health',
    summary: 'Life expectancy at birth, in years — the long Gapminder series, 1800–2020. Pairs with income on the bubble chart.', ...COMMON,
  }, life);
  console.log(`✓ gapminder-life-expectancy: ${life.length} obs, ${yrs(life)} years`);

  // total population — long (1800→2020), stored in millions
  const popCsv = await fetchText('https://raw.githubusercontent.com/open-numbers/ddf--gapminder--systema_globalis/master/countries-etc-datapoints/ddf--datapoints--total_population_with_projections--by--geo--time.csv');
  const pop = toObs(popCsv, geo, 1e6);
  await writeDataset('macro', 'gapminder-population', {
    title: 'Population', valueLabel: 'Total population (millions)', unit: 'million', changeMode: 'pct', topic: 'demographics',
    summary: 'Total population (millions) — the long Gapminder series, 1800–2020. Used for bubble size on the bubble chart.', ...COMMON,
  }, pop);
  console.log(`✓ gapminder-population: ${pop.length} obs, ${yrs(pop)} years`);
}
main();
