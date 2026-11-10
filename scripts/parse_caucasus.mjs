/**
 * Caucasus Barometer (CRRC) — South Caucasus, 2008–2024: Armenia and Georgia
 * every survey year, Azerbaijan 2008–2013 (the last years CRRC surveyed it).
 *
 *   node scripts/parse_caucasus.mjs
 *
 * Reads data/raw/caucasus/cb_by_country_year.csv, written once per release by
 * scripts/tools/cb_aggregate.py from CRRC's harmonised time-series files (free
 * download). That rule reproduces the 2013 figures this site first published
 * from the regional file, so the old points sit inside the new series unchanged.
 *
 * Life satisfaction stays the single 2013 reading: the time-series files keep
 * it in three bands only, so the 1–10 mean cannot be extended and its dataset
 * is left as it is rather than rewritten.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';

const CSV = join('data', 'raw', 'caucasus', 'cb_by_country_year.csv');
const COMMON = {
  source: 'Caucasus Barometer (CRRC)', license: 'CRRC terms — public aggregates',
  url: 'https://caucasusbarometer.org/en/downloads/', parsedAt: new Date().toISOString().slice(0, 10),
};
const SCOPE = 'Caucasus Barometer 2008–2024 — Armenia and Georgia; Azerbaijan to 2013.';

const DIMS = [
  { col: 'trust_army', slug: 'cb-trust-army', topic: 'attitudes', title: 'Trust in the Army (S. Caucasus)', valueLabel: 'Share who trust the army', what: 'the army' },
  { col: 'trust_police', slug: 'cb-trust-police', topic: 'attitudes', title: 'Trust in the Police (S. Caucasus)', valueLabel: 'Share who trust the police', what: 'the police' },
  { col: 'trust_eu', slug: 'cb-trust-eu', topic: 'attitudes', title: 'Trust in the EU (S. Caucasus)', valueLabel: 'Share who trust the European Union', what: 'the European Union' },
  { col: 'trust_parliament', slug: 'cb-trust-parliament', topic: 'governance', title: 'Trust in Parliament (S. Caucasus)', valueLabel: 'Share who trust parliament', what: 'parliament' },
  { col: 'trust_president', slug: 'cb-trust-president', topic: 'governance', title: 'Trust in the President (S. Caucasus)', valueLabel: 'Share who trust the president', what: 'the president' },
  { col: 'trust_courts', slug: 'cb-trust-courts', topic: 'governance', title: 'Trust in the Courts (S. Caucasus)', valueLabel: 'Share who trust the legal system', what: 'the court system' },
  { col: 'trust_media', slug: 'cb-trust-media', topic: 'attitudes', title: 'Trust in the Media (S. Caucasus)', valueLabel: 'Share who trust the media', what: 'the media' },
  { col: 'trust_religious', slug: 'cb-trust-religious', topic: 'attitudes', title: 'Trust in Religious Institutions (S. Caucasus)', valueLabel: 'Share who trust religious institutions', what: 'religious institutions' },
  { col: 'eu_support', slug: 'cb-eu-membership-support', topic: 'attitudes', title: 'Support for EU Membership (S. Caucasus)', valueLabel: 'Share who support joining the EU', what: null,
    summary: 'Share who support their country joining the European Union (asked from 2011).' },
];

async function region() {
  const m = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) m.set(a3, REGION_4[r.world_4region] || 'Asia');
  }
  return m;
}

async function main() {
  const rows = [...parseCsvObjects(await readFile(CSV, 'utf8'))]; // committed: missing is a real failure
  const reg = await region();
  for (const d of DIMS) {
    const data = rows
      .filter((r) => r[d.col] !== undefined && r[d.col] !== '')
      .map((r) => ({ entity: r.name, group: reg.get(r.iso3) || 'Asia', period: String(r.year), value: round(Number(r[d.col]), 2), iso: r.iso3 }))
      .filter((o) => Number.isFinite(o.value));
    const summary = d.summary || `Share who trust ${d.what} (CRRC’s “trust”, which merges somewhat and fully).`;
    await writeDataset('survey', d.slug, {
      title: d.title, valueLabel: d.valueLabel, unit: '%', changeMode: 'pp', topic: d.topic,
      method: 'Weighted by WTIND. Share answering “trust” among distrust, neither and trust; don’t know and refused are left out of the base.',
      summary: `${summary} ${SCOPE}`, ...COMMON,
    }, data);
  }
  console.log(`✓ Caucasus Barometer: ${DIMS.length} datasets from ${rows.length} country-years`);
}
main().catch((e) => { console.error('✗ parse_caucasus failed:', e.message); process.exit(1); });
