/**
 * Wellcome Global Monitor (Gallup) — trust in science and scientists 2018 and
 * 2020; vaccine attitudes 2018 (not asked in 2020).
 *
 *   node scripts/parse_wellcome.mjs
 *
 * Two committed inputs:
 *   data/raw/wgm/wgm2018_by_country.csv — the 2018 country shares, first summed
 *     from Wellcome's crosstabs workbook (weighted column %, "a lot" + "some");
 *     kept here because the script that made them lived in a scratchpad.
 *   data/raw/wgm/wgm2020_by_country.csv — written by
 *     scripts/tools/wgm2020_aggregate.py from the 2020 public file, by the same
 *     rule (the base includes don't know, as the crosstabs do).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';
import countryNames from '../src/data/country-names.json' with { type: 'json' };

const DIR = join('data', 'raw', 'wgm');
const COMMON = {
  source: 'Wellcome Global Monitor (Gallup)', license: 'CC BY 4.0',
  url: 'https://wellcome.org/insights/reports/wellcome-global-monitor-covid-19/2020', parsedAt: new Date().toISOString().slice(0, 10),
};
// 2020 file spellings that differ from the 2018 crosstabs and from our names.
const ALIAS = {
  'bosnia herzegovina': 'BIH', 'congo brazzaville': 'COG', 'ivory coast': 'CIV', 'czech republic': 'CZE',
  'macedonia': 'MKD', 'north macedonia': 'MKD', 'northern cyprus': null, 'kosovo': 'XKX', 'palestinian territories': 'PSE',
  'taiwan': 'TWN', 'hong kong': 'HKG', 'south korea': 'KOR', 'russia': 'RUS', 'laos': 'LAO', 'kyrgyzstan': 'KGZ',
  'the gambia': 'GMB', 'eswatini': 'SWZ', 'swaziland': 'SWZ', 'united states': 'USA', 'united kingdom': 'GBR',
};

async function main() {
  const r18 = [...parseCsvObjects(await readFile(join(DIR, 'wgm2018_by_country.csv'), 'utf8'))];
  const r20 = [...parseCsvObjects(await readFile(join(DIR, 'wgm2020_by_country.csv'), 'utf8'))];
  const region = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) region.set(a3, REGION_4[r.world_4region] || 'Other');
  }
  const byName = new Map();
  for (const r of r18) byName.set(r.name.toLowerCase(), r.iso3);
  for (const [iso, n] of Object.entries(countryNames)) { byName.set(n.common.toLowerCase(), iso); byName.set(n.official.toLowerCase(), iso); }
  const iso20 = (name) => {
    const k = name.toLowerCase();
    return k in ALIAS ? ALIAS[k] : byName.get(k);
  };
  const unknown = new Set();
  const point = (iso, name, period, v) => ({ entity: countryNames[iso]?.common || name, group: region.get(iso) || 'Other', period, value: round(Number(v), 2), iso });
  const build = (col) => {
    const out = [];
    for (const r of r18) if (r[col]) out.push(point(r.iso3, r.name, '2018', r[col]));
    for (const r of r20) {
      if (!(col in r) || r[col] === '') continue;
      const iso = iso20(r.country);
      if (!iso) { if (iso !== null) unknown.add(r.country); continue; }
      out.push(point(iso, r.country, '2020', r[col]));
    }
    return out;
  };

  await writeDataset('survey', 'wgm-trust-science', {
    title: 'Trust in Science', valueLabel: 'Share who trust science a lot or some', unit: '%', changeMode: 'pp', topic: 'attitudes',
    summary: 'Share who say they trust science a lot or some. Wellcome Global Monitor 2018 and 2020.', ...COMMON,
  }, build('trust_science'));
  await writeDataset('survey', 'wgm-trust-scientists', {
    title: 'Trust in Scientists', valueLabel: 'Share who trust scientists a lot or some', unit: '%', changeMode: 'pp', topic: 'attitudes',
    summary: 'Share who say they trust scientists in their country a lot or some. Wellcome Global Monitor 2018 and 2020.', ...COMMON,
  }, build('trust_scientists'));
  await writeDataset('survey', 'wgm-vaccines-safe', {
    title: 'Believe Vaccines Are Safe', valueLabel: 'Share who agree vaccines are safe', unit: '%', changeMode: 'pp', topic: 'health',
    summary: 'Share who strongly or somewhat agree that vaccines are safe. Wellcome Global Monitor 2018 (not asked in 2020).', ...COMMON,
  }, build('vacc_safe'));
  await writeDataset('survey', 'wgm-vaccines-effective', {
    title: 'Believe Vaccines Are Effective', valueLabel: 'Share who agree vaccines are effective', unit: '%', changeMode: 'pp', topic: 'health',
    summary: 'Share who strongly or somewhat agree that vaccines are effective. Wellcome Global Monitor 2018 (not asked in 2020).', ...COMMON,
  }, build('vacc_effective'));
  if (unknown.size) console.warn(`  – Wellcome 2020: no ISO for ${[...unknown].join(', ')}`);
  console.log('✓ Wellcome Global Monitor: 4 datasets written');
}
main().catch((e) => { console.error('✗ parse_wellcome failed:', e.message); process.exit(1); });
