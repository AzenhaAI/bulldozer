/**
 * Afrobarometer Rounds 2–10 (2002–2025) → country-level indicators (weighted %).
 *
 *   node scripts/parse_afrobarometer.mjs
 *
 * Reads data/raw/afrobarometer/afro_r<N>_by_country.csv, one per round, written
 * once per release by scripts/tools/afro_aggregate.py from the merged .sav
 * files (free on afrobarometer.org). The rule is the one first recovered for
 * Round 9, which the aggregator still reproduces to the decimal; it finds each
 * question in older rounds by its wording, and leaves out a round that asked it
 * on a different answer scale.
 *
 * Each round is one point, labelled with the years its fieldwork spanned
 * ("2021–2023"), worked out from the interview dates. One label per round keeps
 * the countries of a round ranked against each other — per-country years would
 * rank a 2025 interview only against the handful of countries asked in 2025 —
 * the way LAPOP's "2025–2026" wave already is.
 * Round 1 (1999–2001) is not used: its scales differ and it carries no dates.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';
import countryNames from '../src/data/country-names.json' with { type: 'json' };

const DIR = join('data', 'raw', 'afrobarometer');
const ROUNDS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

const ALIAS = {
  'cabo verde': 'CPV', 'congo-brazzaville': 'COG', "côte d'ivoire": 'CIV', 'eswatini': 'SWZ',
  'tanzania': 'TZA', 'the gambia': 'GMB', 'gambia': 'GMB', 'gambia, the': 'GMB', 'são tomé and príncipe': 'STP',
  'cote d’ivoire': 'CIV', "cote d'ivoire": 'CIV', 'swaziland': 'SWZ',
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
  const geo = await geoMap();
  const resolve = (name) => geo.get(name.toLowerCase()) || (ALIAS[name.toLowerCase()] ? { iso: ALIAS[name.toLowerCase()], region: 'Africa' } : null);
  const rounds = [];
  for (const n of ROUNDS) {
    const text = await readFile(join(DIR, `afro_r${n}_by_country.csv`), 'utf8'); // committed: a missing file is a real failure
    const rows = [...parseCsvObjects(text)];
    const ys = rows.map((r) => Number(r.year)).filter(Boolean);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    rounds.push({ n, rows, label: lo === hi ? String(lo) : `${lo}–${hi}` });
  }
  const unresolved = new Set();
  for (const d of DIMS) {
    const byKey = new Map(); // iso|round label -> row
    const asked = new Set();
    for (const { n, rows, label } of rounds) {
      for (const r of rows) {
        const g = resolve(r.country); const v = Number(r[d.col]);
        if (!g) { unresolved.add(r.country); continue; }
        if (r[d.col] === '' || r[d.col] === undefined || Number.isNaN(v)) continue;
        // One name per country across rounds (files spell Gambia, Cabo Verde, Côte d'Ivoire, Eswatini several ways).
        byKey.set(`${g.iso}|${label}`, { entity: countryNames[g.iso]?.common || r.country, group: g.region, period: label, value: round(v, 1), iso: g.iso,
          ...(r[d.col + '_moe'] ? { moe: round(Number(r[d.col + '_moe']), 1) } : {}) }); // 95% margin, scripts/tools/moe.py
        asked.add(n);
      }
    }
    const data = [...byKey.values()].sort((a, b) => a.iso.localeCompare(b.iso) || a.period.localeCompare(b.period));
    if (!data.length) continue;
    const rs = [...asked].sort((a, b) => a - b);
    const years = data.flatMap((o) => o.period.split('–')).sort();
    const span = `Rounds ${rs[0]}–${rs[rs.length - 1]}${rs.length < rs[rs.length - 1] - rs[0] + 1 ? ` (asked in ${rs.join(', ')})` : ''}, ${years[0]}–${years[years.length - 1]}`;
    await writeDataset('survey', d.slug, {
      title: d.title, valueLabel: d.valueLabel, unit: '%', changeMode: 'pp', topic: d.topic,
      method: 'Weighted by withinwt (withinwt_ea from Round 8). Share of substantive answers; refused, don’t know, missing and not-asked are left out of the base. Each round is one point, dated by the years its fieldwork spanned.',
      summary: `${d.summary} Afrobarometer ${span}.`,
      source: 'Afrobarometer', license: 'Afrobarometer terms — public aggregates',
      url: 'https://www.afrobarometer.org/data/', parsedAt: new Date().toISOString().slice(0, 10),
    }, data);
  }
  if (unresolved.size) console.warn(`  – Afrobarometer: no ISO for ${[...unresolved].join(', ')}`);
  console.log(`✓ Afrobarometer → rounds ${ROUNDS.join(', ')}`);
}
main().catch((e) => { console.error('✗ parse_afrobarometer failed:', e.message); process.exit(1); });
