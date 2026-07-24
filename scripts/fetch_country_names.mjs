/**
 * One-off generator, per ISO-3 country, from the open mledoze/countries
 * dataset (MIT):
 *   src/data/country-names.json     { common, official }
 *   src/data/country-currency.json  { code, name, symbol }
 * This decouples the name and currency shown in the UI from whatever each data
 * source happens to use. Run to refresh:  node scripts/fetch_country_names.mjs
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');

const res = await fetch('https://raw.githubusercontent.com/mledoze/countries/master/dist/countries.json');
if (!res.ok) { console.error('mledoze fetch error', res.status); process.exit(1); }
const rows = await res.json();

const names = {};
const currency = {};
const subregions = {};
for (const c of rows) {
  const iso = (c.cca3 || '').toUpperCase();
  if (iso.length !== 3) continue;
  names[iso] = { common: c.name.common, official: c.name.official };
  const code = Object.keys(c.currencies || {})[0];
  // currency symbols are legitimate reference data (лв, дин., ₽) — kept as-is;
  // the no-Cyrillic rule targets Russian-language content, not other countries'
  // native currency marks
  if (code) currency[iso] = { code, name: c.currencies[code].name, symbol: c.currencies[code].symbol || '' };
  // UN M49 sub-region (e.g. "Eastern Europe", "South-Eastern Asia") for finer
  // country interlinking than the coarse 4-continent taxonomy.
  if (c.subregion) subregions[iso] = c.subregion;
}

// mledoze codes Kosovo as UNK; our datasets (World Bank, OWID) use XKX.
names.XKX = { common: 'Kosovo', official: 'Republic of Kosovo' };
currency.XKX = { code: 'EUR', name: 'Euro', symbol: '€' };
subregions.XKX = 'Southern Europe';

await writeFile(join(DATA, 'country-names.json'), JSON.stringify(names));
await writeFile(join(DATA, 'country-currency.json'), JSON.stringify(currency));
await writeFile(join(DATA, 'subregions.json'), JSON.stringify(subregions));
console.log('✓ country-names.json:', Object.keys(names).length, '| country-currency.json:', Object.keys(currency).length, '| subregions.json:', Object.keys(subregions).length);
console.log('  BRA:', JSON.stringify(currency.BRA), '| JPN:', JSON.stringify(currency.JPN));
