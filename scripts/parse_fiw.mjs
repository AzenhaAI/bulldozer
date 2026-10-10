/**
 * Freedom House — Freedom in the World, aggregate Total score (0–100).
 *   python3 scripts/extract_fiw.py <fiw.xlsx>   # once, produces the tidy CSV
 *   node scripts/parse_fiw.mjs
 * FH publishes no ISO codes, so names are resolved against the Gapminder
 * registry with an alias table; unmatched entries (mostly disputed
 * territories) are reported and skipped.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, pickPeriodsN } from './lib/datasets.mjs';

const H = homedir();
const CSV = join(H, 'Documents', 'tableau_data', 'macro', 'fiw_tidy.csv');
const GAP = join(H, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey', 'Gapminder', 'ddf--entities--geo--country.csv');

const ALIAS = {
  'the gambia': 'GMB', 'gambia': 'GMB', 'congo (kinshasa)': 'COD', 'congo (brazzaville)': 'COG',
  'cote d’ivoire': 'CIV', "cote d'ivoire": 'CIV', 'burma': 'MMR', 'cabo verde': 'CPV',
  'sao tome and principe': 'STP', 'st. kitts and nevis': 'KNA', 'st. lucia': 'LCA',
  'st. vincent and the grenadines': 'VCT', 'micronesia': 'FSM', 'brunei': 'BRN',
  'czech republic': 'CZE', 'slovak republic': 'SVK', 'slovakia': 'SVK', 'taiwan': 'TWN',
  'kyrgyzstan': 'KGZ', 'laos': 'LAO', 'united arab emirates': 'ARE', 'hong kong': 'HKG',
  'timor-leste': 'TLS', 'eswatini': 'SWZ', 'north macedonia': 'MKD', 'russia': 'RUS',
  'united states': 'USA', 'united kingdom': 'GBR', 'south korea': 'KOR', 'north korea': 'PRK',
};

async function geoMaps() {
  const name2iso = new Map(); const iso2region = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (!a3) continue;
    if (r.name) name2iso.set(r.name.toLowerCase(), a3);
    iso2region.set(a3, REGION_4[r.world_4region] || 'Other');
  }
  for (const [k, v] of Object.entries(ALIAS)) name2iso.set(k, v);
  return { name2iso, iso2region };
}

async function main() {
  console.log('Freedom House FIW →');
  let text;
  try { text = await readFile(CSV, 'utf8'); } catch { console.warn('– fiw_tidy.csv missing (run extract_fiw.py); skipped.'); return; }
  const { name2iso, iso2region } = await geoMaps();

  const rows = [];
  const counts = new Map();
  const skipped = new Set();
  for (const r of parseCsvObjects(text)) {
    const iso = name2iso.get(r.name.toLowerCase());
    if (!iso || !iso2region.has(iso)) { skipped.add(r.name); continue; }
    const v = Number(r.total);
    if (!Number.isFinite(v)) continue;
    rows.push({ entity: r.name, group: iso2region.get(iso), period: r.edition, value: v, iso });
    counts.set(r.edition, (counts.get(r.edition) ?? 0) + 1);
  }
  if (skipped.size) console.log(`  unmatched (skipped): ${[...skipped].join(', ')}`);
  const periods = pickPeriodsN(counts, 8);
  const data = rows.filter((r) => periods.includes(r.period));
  if (data.length < 500) throw new Error(`only ${data.length} rows`);
  await writeDataset('macro', 'fiw-freedom-score', {
    title: 'Freedom in the World Score', unit: 'score up to 100 (100 = most free)', valueLabel: 'FIW total score',
    changeMode: 'pp', topic: 'governance',
    summary: 'Aggregate political-rights and civil-liberties score for countries and territories, annual editions.',
    source: 'Freedom House — Freedom in the World', license: 'Free reuse with attribution (Freedom House)',
    url: 'https://freedomhouse.org/report/freedom-world', parsedAt: new Date().toISOString().slice(0, 10),
  }, data);
}
main().catch((e) => { console.error('✗ parse_fiw failed:', e.message); process.exit(1); });
