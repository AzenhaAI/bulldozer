/**
 * SDR2 — Survey Data Recycling (Harvard Dataverse, CC0): 22 international survey
 * projects harmonised to common variables, 1966–2017. Institutional trust and
 * political participation by country and five-year period.
 *
 *   node scripts/parse_sdr2.mjs
 *
 * Reads data/raw/sdr2/sdr2_by_country_period.csv, written once per release by
 * scripts/tools/sdr2_aggregate.py from the MASTER file. Its rule reproduces the
 * pooled 1966–2017 figures first published here (labelled 2017), every country
 * of all seven series; those were one average over fifty years, these are the
 * same average per five-year period. Countries are surveyed in different
 * periods, so profiles rank each country's latest period (latestPerCountry).
 * We publish only concepts the site doesn't already cover (institutional trust
 * + political participation).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';
import a3a2 from '../src/data/iso-alpha2.json' with { type: 'json' };
import countryNames from '../src/data/country-names.json' with { type: 'json' };

const CSV = join('data', 'raw', 'sdr2', 'sdr2_by_country_period.csv');
const PARSED = new Date().toISOString().slice(0, 10);
const COMMON = {
  source: 'SDR2 — Survey Data Recycling (Harvard Dataverse)',
  license: 'CC0 1.0', url: 'https://doi.org/10.7910/DVN/YOCX0M', parsedAt: PARSED,
};

const POOL = 'SDR2, 1966–2017 by five-year period; a period pools the projects that surveyed the country then.';

async function main() {
  const rows = [...parseCsvObjects(await readFile(CSV, 'utf8'))]; // committed: missing is a real failure
  const a2toa3 = Object.fromEntries(Object.entries(a3a2).map(([a3, a2]) => [a2, a3]));
  const region = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) region.set(a3, REGION_4[r.world_4region] || 'Other');
  }
  const build = (col, dp) => rows
    .filter((r) => r[col] !== undefined && r[col] !== '')
    .map((r) => {
      const iso = (a2toa3[r.iso2] || '').toUpperCase();
      return { entity: countryNames[iso]?.common || r.iso2, group: region.get(iso) || 'Other', period: r.period, value: round(Number(r[col]), dp), iso };
    })
    .filter((o) => o.iso && Number.isFinite(o.value));

  const trust = (slug, col, what) => writeDataset('survey', slug, {
    title: `Trust in ${what}`, valueLabel: `Mean trust (0 distrust ↔ 10 full trust)`, unit: 'index 0–10', changeMode: 'pp', topic: 'attitudes',
    summary: `Average trust in ${what} on a 0–10 scale, harmonized across survey projects. ${POOL}`, latestPerCountry: true, ...COMMON,
  }, build(col, 3), { carryForward: false });

  await trust('sdr2-trust-government', 'trgov', 'government');
  await trust('sdr2-trust-parliament', 'trparl', 'parliament');
  await trust('sdr2-trust-parties', 'trparty', 'political parties');
  await trust('sdr2-trust-legal', 'trleg', 'the legal system');
  const share = (slug, col, title, valueLabel, what) => writeDataset('survey', slug, {
    title, valueLabel, unit: '%', changeMode: 'pp', topic: 'attitudes',
    summary: `${what}, harmonized across survey projects. ${POOL}`, latestPerCountry: true, ...COMMON,
  }, build(col, 2), { carryForward: false });
  await share('sdr2-petition', 'petition', 'Signed a Petition', 'Share who have signed a petition', 'Share of adults who report having signed a petition');
  await share('sdr2-demonstration', 'demonst', 'Attended a Demonstration', 'Share who have demonstrated', 'Share of adults who report having taken part in a lawful demonstration');
  await share('sdr2-union-membership', 'union', 'Trade Union Membership', 'Share who are union members', 'Share of adults who are currently members of a trade union');
  console.log('✓ SDR2: 7 datasets written');
}
main().catch((e) => { console.error('✗ parse_sdr2 failed:', e.message); process.exit(1); });
