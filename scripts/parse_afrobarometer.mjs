/**
 * Afrobarometer Round 9 → country-level indicators (weighted %), 39 countries.
 *
 *   node scripts/parse_afrobarometer.mjs
 *
 * Reads data/raw/afrobarometer/afro_r9_by_country.csv, written once per release
 * by scripts/tools/afro_r9_aggregate.py from the 80 MB merged .sav. This used
 * to read a CSV in a temporary folder, made by a script that no longer
 * existed; the rule it applied was recovered by reproducing its three series
 * exactly and is now written down in the aggregator.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';

const CSV = process.env.AFRO_CSV || join('data', 'raw', 'afrobarometer', 'afro_r9_by_country.csv');
const PERIOD = '2023';

const ALIAS = {
  'cabo verde': 'CPV', 'congo-brazzaville': 'COG', "côte d'ivoire": 'CIV', 'eswatini': 'SWZ',
  'tanzania': 'TZA', 'the gambia': 'GMB', 'gambia': 'GMB', 'são tomé and príncipe': 'STP',
};

const DIMS = [
  { col: 'dem_pref', slug: 'afro-democracy-support', topic: 'governance', title: 'Support for Democracy (Afrobarometer)', valueLabel: 'Democracy preferable', summary: 'Share who say democracy is preferable to any other kind of government.' },
  { col: 'trust_pres', slug: 'afro-trust-president', topic: 'governance', title: 'Trust in the President (Afrobarometer)', valueLabel: 'Trust the president', summary: 'Share who trust the president “somewhat” or “a lot”.' },
  { col: 'is_democracy', slug: 'afro-perceived-democracy', topic: 'governance', title: 'Perceived Democracy (Afrobarometer)', valueLabel: 'See country as a democracy', summary: 'Share who see their country as a democracy (with minor problems or fully).' },
  { col: 'dem_satisfied', slug: 'afro-democracy-satisfaction', topic: 'governance', title: 'Satisfaction with Democracy (Afrobarometer)', valueLabel: 'Fairly or very satisfied with democracy', summary: 'Share fairly or very satisfied with the way democracy works; those who say their country is not a democracy count as not satisfied.' },
  { col: 'free_speech', slug: 'afro-free-speech', topic: 'governance', title: 'Freedom to Speak Your Mind (Afrobarometer)', valueLabel: 'Somewhat or completely free to say what they think', summary: 'Share who feel somewhat or completely free to say what they think.' },
  { col: 'trust_police', slug: 'afro-trust-police', topic: 'safety', title: 'Trust in the Police (Afrobarometer)', valueLabel: 'Trust the police', summary: 'Share who trust the police “somewhat” or “a lot”.' },
  { col: 'trust_courts', slug: 'afro-trust-courts', topic: 'governance', title: 'Trust in the Courts (Afrobarometer)', valueLabel: 'Trust courts of law', summary: 'Share who trust the courts of law “somewhat” or “a lot”.' },
  { col: 'corruption_up', slug: 'afro-corruption-rising', topic: 'governance', title: 'Corruption Seen as Rising (Afrobarometer)', valueLabel: 'Say corruption increased in the past year', summary: 'Share who say the level of corruption in the country increased somewhat or a lot over the past year.' },
  { col: 'trust_citizens', slug: 'afro-trust-citizens', topic: 'attitudes', title: 'Trust in Fellow Citizens (Afrobarometer)', valueLabel: 'Trust other citizens', summary: 'Share who trust other citizens of their country “somewhat” or “a lot”.' },
  { col: 'right_direction', slug: 'afro-right-direction', topic: 'attitudes', title: 'Country Going in the Right Direction (Afrobarometer)', valueLabel: 'Say the country is going in the right direction', summary: 'Share who say the country is going in the right direction.' },
  { col: 'economy_good', slug: 'afro-economy-good', topic: 'economy', title: 'Economy Seen as Good (Afrobarometer)', valueLabel: 'Call the economy fairly or very good', summary: 'Share who describe the country’s present economic condition as fairly or very good.' },
  { col: 'without_food', slug: 'afro-went-without-food', topic: 'wellbeing', title: 'Went Without Enough Food (Afrobarometer)', valueLabel: 'Went without enough food at least once in the past year', summary: 'Share who went without enough food to eat at least once in the past year — part of Afrobarometer’s lived-poverty measure.' },
  { col: 'without_medical', slug: 'afro-went-without-medical-care', topic: 'health', title: 'Went Without Medical Care (Afrobarometer)', valueLabel: 'Went without medicine or medical treatment at least once in the past year', summary: 'Share who went without medicine or medical treatment at least once in the past year.' },
  { col: 'without_cash', slug: 'afro-went-without-cash', topic: 'wellbeing', title: 'Went Without a Cash Income (Afrobarometer)', valueLabel: 'Went without a cash income at least once in the past year', summary: 'Share who went without a cash income at least once in the past year.' },
  { col: 'felt_unsafe', slug: 'afro-felt-unsafe', topic: 'safety', title: 'Felt Unsafe in the Neighbourhood (Afrobarometer)', valueLabel: 'Felt unsafe walking in the neighbourhood at least once in the past year', summary: 'Share who felt unsafe walking in their neighbourhood at least once in the past year.' },
  { col: 'china_positive', slug: 'afro-china-influence', topic: 'attitudes', title: 'China’s Influence Seen as Positive (Afrobarometer)', valueLabel: 'Call China’s influence somewhat or very positive', summary: 'Share who say China’s economic and political influence on their country is somewhat or very positive.' },
  { col: 'us_positive', slug: 'afro-us-influence', topic: 'attitudes', title: 'US Influence Seen as Positive (Afrobarometer)', valueLabel: 'Call the United States’ influence somewhat or very positive', summary: 'Share who say the United States’ economic and political influence on their country is somewhat or very positive.' },
  { col: 'internet_news', slug: 'afro-internet-news', topic: 'connectivity', title: 'Get News from the Internet (Afrobarometer)', valueLabel: 'Get news from the internet at least a few times a week', summary: 'Share who get news from the internet at least a few times a week.' },
];

async function geoMap() {
  const m = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3 && r.name) m.set(r.name.toLowerCase(), { iso: a3, region: REGION_4[r.world_4region] || 'Africa' });
  }
  return m;
}

async function main() {
  let text;
  text = await readFile(CSV, 'utf8');     // committed: a missing file is a real failure, not a skip
  const geo = await geoMap();
  const rows = [...parseCsvObjects(text)];
  const resolve = (name) => geo.get(name.toLowerCase()) || (ALIAS[name.toLowerCase()] ? { iso: ALIAS[name.toLowerCase()], region: 'Africa' } : null);

  for (const d of DIMS) {
    const data = [];
    for (const r of rows) {
      const g = resolve(r.country); const v = Number(r[d.col]);
      if (!g || r[d.col] === '' || Number.isNaN(v)) continue;
      data.push({ entity: r.country, group: g.region, period: PERIOD, value: round(v, 1), iso: g.iso });
    }
    if (!data.length) continue;
    await writeDataset('survey', d.slug, {
      title: d.title, valueLabel: d.valueLabel, unit: '%', changeMode: 'pp', topic: d.topic,
      method: 'Weighted by withinwt_ea. Share of substantive answers; refused, don’t know and missing are left out of the base.',
      summary: `${d.summary} Afrobarometer Round 9, ${PERIOD}.`,
      source: 'Afrobarometer (Round 9)', license: 'Afrobarometer terms — public aggregates',
      url: 'https://www.afrobarometer.org/', parsedAt: new Date().toISOString().slice(0, 10),
    }, data);
  }
  console.log(`✓ Afrobarometer → ${rows.length} countries`);
}
main().catch((e) => { console.error('✗ parse_afrobarometer failed:', e.message); process.exit(1); });
