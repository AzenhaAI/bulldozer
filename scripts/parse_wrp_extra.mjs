/**
 * World Risk Poll (Gallup / Lloyd's Register Foundation), waves 2019, 2021,
 * 2023 and 2025 — country-level indicators beside the Resilience Index.
 *
 *   node scripts/parse_wrp_extra.mjs
 *
 * Reads data/raw/wrp/wrp_by_country_wave.csv, written once per release by
 * scripts/tools/wrp_aggregate.py from the Foundation's free microdata (CC BY
 * 4.0). Its rule reproduces the 2023 figures first published here, every
 * country to two decimals; which waves asked what, and the wording changes,
 * are in the aggregator's docstring and each dataset's summary.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';
import countryNames from '../src/data/country-names.json' with { type: 'json' };

const CSV = join('data', 'raw', 'wrp', 'wrp_by_country_wave.csv');
const COMMON = {
  source: 'World Risk Poll (Lloyd’s Register Foundation / Gallup)',
  license: 'CC BY 4.0', url: 'https://www.lrfoundation.org.uk/world-risk-poll-data', parsedAt: new Date().toISOString().slice(0, 10),
};

const DIMS = [
  { col: 'climate_threat', slug: 'wrp-climate-threat', topic: 'environment', title: 'Climate Seen as a Threat', valueLabel: 'Share calling climate change a threat to their country',
    summary: 'Share who see climate change as a very or somewhat serious threat to their country in the next 20 years. World Risk Poll 2019–2025 (2019 asked about a threat “to people in this country”).' },
  { col: 'worry_crime', slug: 'wrp-worry-crime', topic: 'safety', title: 'Worry About Violent Crime', valueLabel: 'Share worried violent crime could seriously harm them',
    summary: 'Share who are very or somewhat worried that violent crime could cause them serious harm. World Risk Poll 2019–2025.' },
  { col: 'disaster_exp', slug: 'wrp-disaster-experienced', topic: 'risk', title: 'Experienced a Disaster', valueLabel: 'Share who experienced a disaster in the past 5 years',
    summary: 'Share who report having personally experienced a disaster in the past five years. World Risk Poll 2021 and 2023 (2023 adds “in this country”; 2025 asked a different question and is not used).' },
  { col: 'can_protect', slug: 'wrp-can-protect', topic: 'risk', title: 'Confident Can Protect Family', valueLabel: 'Share confident they could protect their family in a disaster',
    summary: 'Share who believe they could protect themselves or their family in a future disaster. World Risk Poll 2021–2025.' },
  { col: 'discrim_skin', slug: 'wrp-discrimination', topic: 'safety', title: 'Experienced Discrimination (Skin Colour)', valueLabel: 'Share who experienced discrimination due to skin colour',
    summary: 'Share who report having experienced discrimination because of the colour of their skin. World Risk Poll 2021–2025.' },
];

async function main() {
  const rows = [...parseCsvObjects(await readFile(CSV, 'utf8'))]; // committed: missing is a real failure
  const geo = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) geo.set(a3, { name: r.name, region: REGION_4[r.world_4region] || 'Other' });
  }
  for (const d of DIMS) {
    const data = rows
      .filter((r) => r[d.col] !== undefined && r[d.col] !== '')
      .map((r) => ({
        entity: countryNames[r.iso3]?.common || geo.get(r.iso3)?.name || r.iso3,
        group: geo.get(r.iso3)?.region || 'Other', period: r.wave, value: round(Number(r[d.col]), 2), iso: r.iso3,
      }))
      .filter((o) => Number.isFinite(o.value));
    await writeDataset('survey', d.slug, {
      title: d.title, valueLabel: d.valueLabel, unit: '%', changeMode: 'pp', topic: d.topic,
      method: 'Weighted by WGT. Share of substantive answers; does not apply, don’t know and refused are left out of the base.',
      summary: d.summary, ...COMMON,
    }, data, { carryForward: false }); // every wave is recomputed from the microdata; nothing to carry
  }
  console.log(`✓ World Risk Poll: ${DIMS.length} datasets from ${rows.length} country-waves`);
}
main().catch((e) => { console.error('✗ parse_wrp_extra failed:', e.message); process.exit(1); });
