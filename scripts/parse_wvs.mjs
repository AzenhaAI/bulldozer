/**
 * World Values Survey (Wave 7) → the two Inglehart-Welzel cultural dimensions
 * (Welzel's SACSECVAL = secular values, RESEMAVAL = self-expression values),
 * aggregated by country (weighted) in a Python pre-step → wvs_values.csv.
 *   python pre-step writes iso3,secular,emancipative,n ; then:
 *   node scripts/parse_wvs.mjs
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset } from './lib/datasets.mjs';

const CSV = process.env.WVS_VALUES_CSV ||
  '/private/tmp/claude-501/-Users-kirillshpara/025d8691-cfe3-48e0-a982-db40cbef8a62/scratchpad/wvs_values.csv';
const GAP = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey', 'Gapminder', 'ddf--entities--geo--country.csv');
const PERIOD = '2022';

async function geoMap() {
  const m = new Map();
  try {
    for (const r of await gapminderRows()) {
      const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
      if (a3) m.set(a3, { name: r.name, region: REGION_4[r.world_4region] || 'Other' });
    }
  } catch {}
  // WVS fields Northern Ireland as "NIR": named and placed here; writeDataset
  // marks it sub-national (iso '', sub: true) so it is not ranked as a country.
  m.set('NIR', { name: 'Northern Ireland', region: 'Europe' });
  return m;
}

async function main() {
  let text;
  try { text = await readFile(CSV, 'utf8'); } catch { console.warn('– WVS values CSV missing (run Python pre-step); skipped.'); return; }
  const geo = await geoMap();
  const rows = [...parseCsvObjects(text)];

  const build = (col) => rows.map((r) => {
    const iso = r.iso3.toUpperCase(); const g = geo.get(iso);
    return { entity: g?.name || iso, group: g?.region || 'Other', period: PERIOD, value: Number(r[col]), iso };
  }).filter((o) => !Number.isNaN(o.value));

  await writeDataset('survey', 'wvs-secular', {
    title: 'Secular Values', valueLabel: 'Traditional (0) ↔ secular (1)', unit: 'index 0–1', changeMode: 'pp', topic: 'attitudes',
    summary: 'Welzel’s secular-values index — the traditional vs secular-rational axis of the Inglehart-Welzel cultural map. WVS Wave 7.',
    source: 'World Values Survey (Wave 7)', license: 'WVS terms — public aggregates', url: 'https://www.worldvaluessurvey.org/', parsedAt: new Date().toISOString().slice(0, 10),
  }, build('secular'));

  await writeDataset('survey', 'wvs-emancipative', {
    title: 'Self-Expression Values', valueLabel: 'Survival (0) ↔ self-expression (1)', unit: 'index 0–1', changeMode: 'pp', topic: 'attitudes',
    summary: 'Welzel’s emancipative/self-expression-values index — the survival vs self-expression axis of the Inglehart-Welzel cultural map. WVS Wave 7.',
    source: 'World Values Survey (Wave 7)', license: 'WVS terms — public aggregates', url: 'https://www.worldvaluessurvey.org/', parsedAt: new Date().toISOString().slice(0, 10),
  }, build('emancipative'));
  console.log(`✓ WVS → ${rows.length} countries (secular + self-expression)`);
}
main().catch((e) => { console.error('✗ parse_wvs failed:', e.message); process.exit(1); });
