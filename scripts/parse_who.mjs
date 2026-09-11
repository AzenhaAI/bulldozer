/**
 * WHO Global Health Observatory (GHO) → macro datasets, fetched live from the
 * open OData API (reproducible, no microdata). Country-level, both sexes, the
 * latest available year per country. Roadmap themes: alcohol & tobacco.
 *   node scripts/parse_who.mjs
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';

const GAP = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey', 'Gapminder', 'ddf--entities--geo--country.csv');
const API = 'https://ghoapi.azureedge.net/api';
const PARSED = new Date().toISOString().slice(0, 10);

async function geo() {
  const m = new Map();
  try {
    for (const r of await gapminderRows()) {
      const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
      if (a3) m.set(a3, { name: r.name, region: REGION_4[r.world_4region] || 'Other' });
    }
  } catch {}
  return m;
}

/** Fetch one GHO indicator → latest value per country, ignoring future
 *  projections (WHO modelled series run to 2030 — keep actuals only).
 *  `dim` filters Dim1 (e.g. SEX_BTSX); pass null for indicators with no Dim1. */
async function ghoLatest(code, { dim = 'SEX_BTSX', maxYear = 2024 } = {}) {
  let filter = `SpatialDimType eq 'COUNTRY'`;
  if (dim) filter += ` and Dim1 eq '${dim}'`;
  const res = await fetch(`${API}/${code}?$filter=${filter}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GHO ${code}: ${res.status}`);
  const rows = (await res.json()).value || [];
  const latest = new Map(); // iso3 -> {year, value}
  for (const r of rows) {
    if (r.NumericValue == null || r.TimeDim > maxYear) continue;
    const iso = r.SpatialDim, year = r.TimeDim;
    const cur = latest.get(iso);
    if (!cur || year > cur.year) latest.set(iso, { year, value: r.NumericValue });
  }
  return latest;
}

async function emit(slug, code, meta, g, opts) {
  let latest;
  try { latest = await ghoLatest(code, opts); } catch (e) { console.warn(`– ${slug}: ${e.message}; skipped.`); return; }
  const data = [...latest.entries()].map(([iso, { year, value }]) => {
    const info = g.get(iso);
    return { entity: info?.name || iso, group: info?.region || 'Other', period: String(year), value: round(value, 2), iso };
  });
  await writeDataset('macro', slug, { ...meta, parsedAt: PARSED }, data);
}

async function main() {
  const g = await geo();
  const WHO = { source: 'WHO Global Health Observatory', license: 'CC BY-NC-SA 3.0 IGO', url: 'https://www.who.int/data/gho' };

  await emit('who-alcohol', 'SA_0000001688', {
    title: 'Alcohol Consumption per Capita', valueLabel: 'Litres of pure alcohol per person (15+)', unit: 'litres', changeMode: 'pct', topic: 'health',
    summary: 'Total recorded + unrecorded alcohol consumption per person aged 15+, in litres of pure alcohol. WHO Global Health Observatory.', ...WHO,
  }, g, { maxYear: 2022 });
  await emit('who-tobacco', 'M_Est_tob_curr_std', {
    title: 'Tobacco Use Prevalence', valueLabel: 'Age-standardised current tobacco use (15+)', unit: '%', changeMode: 'pp', topic: 'health',
    summary: 'Age-standardised prevalence of current tobacco use among people aged 15+, both sexes. WHO Global Health Observatory.', ...WHO,
  }, g, { maxYear: 2022 });
  await emit('who-suicide', 'MH_12', {
    title: 'Suicide Rate', valueLabel: 'Age-standardised suicides per 100,000', unit: 'per 100k', changeMode: 'pct', topic: 'health',
    summary: 'Age-standardised suicide mortality rate per 100,000 population, both sexes. WHO Global Health Observatory.', ...WHO,
  }, g);
  await emit('who-road-deaths', 'RS_198', {
    title: 'Road Traffic Deaths', valueLabel: 'Road traffic deaths per 100,000', unit: 'per 100k', changeMode: 'pct', topic: 'safety',
    summary: 'Estimated road traffic death rate per 100,000 population. WHO Global Health Observatory.', ...WHO,
  }, g, { dim: null });
  await emit('who-obesity', 'NCD_BMI_30A', {
    title: 'Adult Obesity', valueLabel: 'Age-standardised obesity prevalence (18+)', unit: '%', changeMode: 'pp', topic: 'health',
    summary: 'Age-standardised prevalence of obesity (BMI ≥ 30) among adults aged 18+, both sexes. WHO Global Health Observatory.', ...WHO,
  }, g, { maxYear: 2022 });
  await emit('who-uhc', 'UHC_INDEX_REPORTED', {
    title: 'Universal Health Coverage Index', valueLabel: 'UHC service coverage index (0–100)', unit: 'index 0–100', changeMode: 'pp', topic: 'health',
    summary: 'WHO/World Bank Universal Health Coverage service coverage index (0–100), SDG 3.8.1. WHO Global Health Observatory.', ...WHO,
  }, g, { dim: null });
  await emit('who-hypertension', 'NCD_HYP_PREVALENCE_A', {
    title: 'Hypertension Prevalence', valueLabel: 'Age-standardised hypertension (30–79)', unit: '%', changeMode: 'pp', topic: 'health',
    summary: 'Age-standardised prevalence of hypertension among adults aged 30–79, both sexes. WHO Global Health Observatory.', ...WHO,
  }, g);
  // Mortality. All three are WHO estimates rather than registered deaths — for
  // countries without civil registration they are modelled — and the summaries
  // say so, because a modelled figure shown as a count is the kind of number
  // that lies quietly.
  await emit('who-ncd-mortality-30-70', 'NCDMORT3070', {
    title: 'Premature NCD Mortality', valueLabel: 'Probability of dying at 30–70 from the four main NCDs', unit: '%', changeMode: 'pp', topic: 'health',
    summary: 'Probability of dying between ages 30 and 70 from cardiovascular disease, cancer, diabetes or chronic respiratory disease, both sexes. SDG 3.4.1. WHO estimate, modelled where death registration is incomplete.', ...WHO,
  }, g);
  await emit('who-ncd-mortality-rate', 'WHS2_131', {
    title: 'NCD Mortality Rate', valueLabel: 'Age-standardised NCD deaths per 100,000', unit: 'per 100k', changeMode: 'pct', topic: 'health',
    summary: 'Age-standardised death rate from noncommunicable diseases per 100,000 population, both sexes. WHO estimate, modelled where death registration is incomplete.', ...WHO,
  }, g);
  await emit('who-adult-mortality', 'WHOSIS_000004', {
    title: 'Adult Mortality', valueLabel: 'Probability of dying between 15 and 60, per 1,000', unit: 'per 1,000', changeMode: 'pct', topic: 'health',
    summary: 'Probability that a 15-year-old dies before reaching 60, per 1,000 population, both sexes. WHO estimate, modelled where death registration is incomplete.', ...WHO,
  }, g);
  console.log('✓ WHO GHO: datasets written');
}
main();
