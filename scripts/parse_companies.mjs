/**
 * Forbes Global 2000 — number of companies headquartered in each country.
 * Public, factual aggregate parsed from the "By country" table of the Wikipedia
 * "Forbes Global 2000" article (2023 list). Reproducible, no key.
 *   node scripts/parse_companies.mjs
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset } from './lib/datasets.mjs';

const GAP = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey', 'Gapminder', 'ddf--entities--geo--country.csv');
const UA = { 'User-Agent': 'BullDozer/1.0 (agent@azenha.ai)' };
const PERIOD = '2023';

// Wikipedia name → ISO-3 for names that differ from Gapminder's.
const ALIAS = {
  'United States': 'USA', 'South Korea': 'KOR', 'United Kingdom': 'GBR', 'Hong Kong': 'HKG',
  'Taiwan': 'TWN', 'Russia': 'RUS', 'Czech Republic': 'CZE', 'UAE': 'ARE',
  'United Arab Emirates': 'ARE', 'Vietnam': 'VNM', 'Luxembourg': 'LUX', 'Ireland': 'IRL',
};

async function nameToIso() {
  const m = new Map();
  for (const [k, v] of Object.entries(ALIAS)) m.set(k.toLowerCase(), v);
  try {
    for (const r of await gapminderRows()) {
      const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
      if (a3 && r.name) m.set(r.name.toLowerCase(), a3);
    }
  } catch {}
  return m;
}

async function regionMap() {
  const m = new Map();
  try {
    for (const r of await gapminderRows()) {
      const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
      if (a3) m.set(a3, REGION_4[r.world_4region] || 'Other');
    }
  } catch {}
  return m;
}

async function main() {
  const res = await fetch('https://en.wikipedia.org/w/api.php?action=parse&page=Forbes_Global_2000&format=json&prop=wikitext&section=1', { headers: UA });
  if (!res.ok) { console.warn(`– Forbes parse: HTTP ${res.status}; skipped.`); return; }
  const wt = (await res.json()).parse.wikitext['*'];
  const table = wt.slice(wt.indexOf('{|'), wt.indexOf('|}'));

  const n2i = await nameToIso();
  const reg = await regionMap();
  const unmapped = [];
  const data = [];
  // rows: | rank ||'''{{flag|Country}}'''|| ... |count||[[Company]]
  for (const line of table.split('\n')) {
    const country = line.match(/\{\{flag\|([^}|]+)/i)?.[1]?.trim();
    if (!country) continue;
    const count = line.match(/\|\s*(?:style="[^"]*"\s*\|)?\s*(\d[\d,]*)\s*\|\|\s*\[\[/)?.[1];
    if (!count) continue;
    const iso = n2i.get(country.toLowerCase());
    if (!iso) { unmapped.push(country); continue; }
    data.push({ entity: country, group: reg.get(iso) || 'Other', period: PERIOD, value: Number(count.replace(/,/g, '')), iso });
  }
  if (unmapped.length) console.warn('  unmapped:', unmapped.join(', '));

  await writeDataset('macro', 'forbes-global-2000', {
    title: 'Forbes Global 2000 Companies', valueLabel: 'Companies in the Forbes Global 2000', unit: 'count', changeMode: 'pct', topic: 'economy',
    summary: 'Number of companies headquartered in each country that appear in the Forbes Global 2000 list of the world’s largest public companies (2023).',
    source: 'Forbes Global 2000 (via Wikipedia)', license: 'CC BY-SA (Wikipedia aggregate)', url: 'https://www.forbes.com/lists/global2000/', parsedAt: new Date().toISOString().slice(0, 10),
  }, data);
  console.log(`✓ Forbes Global 2000: ${data.length} countries`);

  await brands(n2i, reg);
}

/** Aggregate the Kantar BrandZ most-valuable-brands list to country totals. */
async function brands(n2i, reg) {
  const res = await fetch('https://en.wikipedia.org/w/api.php?action=parse&page=List_of_most_valuable_brands&format=json&prop=wikitext&section=1', { headers: UA });
  if (!res.ok) { console.warn(`– Brands parse: HTTP ${res.status}; skipped.`); return; }
  const wt = (await res.json()).parse.wikitext['*'];
  const table = wt.slice(wt.indexOf('{|'), wt.indexOf('|}'));

  const byIso = new Map(); // iso -> { value (US$ mn), count }
  for (const rowRaw of table.split(/\n\|-/)) {
    const country = rowRaw.match(/\{\{Flagu?\|([^}|]+)/i)?.[1]?.trim();
    if (!country) continue;
    const after = rowRaw.slice(rowRaw.search(/\{\{Flagu?\|/i));
    const val = after.match(/\|\s*([\d,]{4,})/)?.[1];      // brand value (US$ millions) after the flag
    if (!val) continue;
    const iso = n2i.get(country.toLowerCase());
    if (!iso) continue;
    const rec = byIso.get(iso) || { name: country, value: 0, count: 0 };
    rec.value += Number(val.replace(/,/g, '')); rec.count += 1;
    byIso.set(iso, rec);
  }
  const mk = (pick) => [...byIso.entries()].map(([iso, o]) => ({ entity: o.name, group: reg.get(iso) || 'Other', period: '2026', value: pick(o), iso }));

  await writeDataset('macro', 'brandz-value', {
    title: 'Top Brand Value', valueLabel: 'Combined value of top global brands (US$ bn)', unit: 'bn', changeMode: 'pct', topic: 'economy',
    summary: 'Combined brand value of a country’s brands in Kantar BrandZ’s Most Valuable Global Brands ranking (2026), in US$ billions.',
    source: 'Kantar BrandZ (via Wikipedia)', license: 'CC BY-SA (Wikipedia aggregate)', url: 'https://www.kantar.com/campaigns/brandz', parsedAt: new Date().toISOString().slice(0, 10),
  }, mk((o) => Math.round(o.value / 1000)));

  await writeDataset('macro', 'brandz-count', {
    title: 'Top Global Brands', valueLabel: 'Brands in the BrandZ global ranking', unit: 'count', changeMode: 'pct', topic: 'economy',
    summary: 'Number of a country’s brands in Kantar BrandZ’s Most Valuable Global Brands ranking (2026).',
    source: 'Kantar BrandZ (via Wikipedia)', license: 'CC BY-SA (Wikipedia aggregate)', url: 'https://www.kantar.com/campaigns/brandz', parsedAt: new Date().toISOString().slice(0, 10),
  }, mk((o) => o.count));
  console.log(`✓ BrandZ: ${byIso.size} countries`);
}
main();
