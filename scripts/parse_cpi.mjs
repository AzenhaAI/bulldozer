/**
 * Transparency International — Corruption Perceptions Index.
 *   node scripts/parse_cpi.mjs
 * TI's own Excel ships with a broken workbook manifest (openpyxl and pandas
 * both fail on it), so we fetch the same series from Our World in Data's
 * grapher mirror.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects, parseCsvRows } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, pickPeriodsN, round } from './lib/datasets.mjs';

const GAP = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey', 'Gapminder', 'ddf--entities--geo--country.csv');

async function iso3Region() {
  const m = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) m.set(a3, REGION_4[r.world_4region] || 'Other');
  }
  return m;
}

async function main() {
  console.log('Transparency International CPI (via OWID) →');
  const region = await iso3Region();
  const res = await fetch('https://ourworldindata.org/grapher/ti-corruption-perception-index.csv?csvType=full&useColumnShortNames=true');
  if (!res.ok) throw new Error(`fetch failed (${res.status})`);
  const text = await res.text();
  const header = parseCsvRows(text.slice(0, text.indexOf('\n')))[0];
  const valueKey = header.find((h) => !['entity', 'code', 'year'].includes(h.toLowerCase()) && !h.includes('annotation'));

  const rows = [];
  const counts = new Map();
  for (const r of parseCsvObjects(text)) {
    const iso = (r.code || '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso) || !region.has(iso)) continue;
    const v = Number(r[valueKey]);
    if (Number.isNaN(v)) continue;
    rows.push({ entity: r.entity, group: region.get(iso), period: r.year, value: round(v, 0), iso });
    counts.set(r.year, (counts.get(r.year) ?? 0) + 1);
  }
  const periods = pickPeriodsN(counts, 8);
  const data = rows.filter((r) => periods.includes(r.period));
  if (data.length < 300) throw new Error(`only ${data.length} rows`);
  await writeDataset('macro', 'cpi-corruption-perceptions', {
    title: 'Corruption Perceptions Index', unit: 'score 0–100 (100 = cleanest)', valueLabel: 'CPI score',
    changeMode: 'pp', topic: 'governance',
    summary: 'Perceived public-sector corruption as scored by experts and business surveys; higher means cleaner.',
    // 'via OWID', not the full name — the OWID catalogue card collects
    // datasets by substring match, and this belongs to the TI card
    source: 'Transparency International CPI (via OWID)',
    // TI asks that datasets be attributed as "Source: Transparency International": https://www.transparency.org/en/copyright-enquiries
    license: 'CC BY 4.0. Source: Transparency International',
    url: 'https://www.transparency.org/en/cpi', parsedAt: new Date().toISOString().slice(0, 10),
  }, data);
}
main().catch((e) => { console.error('✗ parse_cpi failed:', e.message); process.exit(1); });
