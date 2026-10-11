/**
 * WHO health indicators → macro datasets. Country-level, both sexes, the
 * latest available year per country.
 *   node scripts/parse_who.mjs
 *
 * Two upstreams, chosen per indicator by licence:
 *
 * - data.who.int (WHO's open data portal). Its datasets are CC BY 4.0
 *   ("Unless specifically indicated otherwise, these Datasets are provided to
 *   you under a Creative Commons Attribution 4.0 International License (CC BY
 *   4.0)", https://data.who.int/about/data/terms-and-conditions). We read the
 *   same feed the portal's indicator pages render: the xMart OData table
 *   RELAY_MAY2023 at xmart-api-public.who.int, keyed by the GHO indicator code.
 *   Its values are the GHO API's values (checked 2026-10-12: every country and
 *   year we publish matched). The portal's own "Download" link points at a
 *   different table (RELAY_WHS, World Health Statistics vintage) whose alcohol
 *   and obesity figures differ from what the pages show — we follow the pages.
 *
 * - The GHO OData API (ghoapi.azureedge.net), only for the three indicators
 *   data.who.int does not carry: the age-standardised suicide rate (the portal
 *   has only the crude SDG 3.4.2 rate), the age-standardised NCD death rate and
 *   adult mortality. These fall under the older who.int dataset terms; see the
 *   'who' entry in src/data/licences.ts.
 */
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';

const GHO_API = 'https://ghoapi.azureedge.net/api';
const XMART = 'https://xmart-api-public.who.int/DATA_';
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

/** GET an xMart OData table, following @odata.nextLink if the server pages. */
async function xmart(table, params) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  let url = `${XMART}/${table}?${qs}`;
  const out = [];
  while (url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`xMart ${table}: ${res.status}`);
    const j = await res.json();
    out.push(...(j.value || []));
    url = j['@odata.nextLink'] || null;
  }
  return out;
}

/** WHO's M49 → ISO-3 reference. xMart stores some ISO codes in mixed case
 *  ("frA"), so they are upper-cased here. */
async function m49ToIso3() {
  const rows = await xmart('REF_GEO_WIDE', {
    $filter: "TERM_LANG eq 'en' and GEO_CODE_M49 ne null and VALID_TO eq null",
    $select: 'GEO_CODE_M49,GEO_CODE_ISO_3',
  });
  const m = new Map();
  for (const r of rows) if (r.GEO_CODE_ISO_3) m.set(r.GEO_CODE_M49, r.GEO_CODE_ISO_3.toUpperCase());
  if (m.size < 150) throw new Error(`REF_GEO_WIDE: only ${m.size} codes`);
  return m;
}

// Aggregates in the feed. Everything else is a country or territory —
// territories (Puerto Rico, Palestine, Réunion…) carry their own geo types,
// so filtering on 'COUNTRY' alone would drop them.
const AGGREGATES = ['GLOBAL', 'REGION', 'WHOREGION', 'CLASSIFICATION'];

/** One indicator from data.who.int → latest value per country, ignoring
 *  projections past `maxYear` (WHO's modelled series run to 2030).
 *  `sex` keeps only the both-sexes rows (DIM_SEX = TOTAL). */
async function dataWhoLatest(code, m49, { sex = true, maxYear = 2024 } = {}) {
  let filter = `IND_CODE eq '${code}' and DIM_TIME_TYPE eq 'YEAR' and `
    + AGGREGATES.map((t) => `DIM_GEO_CODE_TYPE ne '${t}'`).join(' and ');
  if (sex) filter += ` and DIM_1_CODE eq 'DIM_SEX' and DIM_MEMBER_1_CODE eq 'TOTAL'`;
  const rows = await xmart('RELAY_MAY2023', { $filter: filter, $select: 'DIM_GEO_CODE_M49,DIM_TIME,VALUE_NUMERIC' });
  if (!rows.length) throw new Error(`data.who.int ${code}: no rows`);
  const latest = new Map();
  for (const r of rows) {
    const iso = m49.get(r.DIM_GEO_CODE_M49), year = Number(r.DIM_TIME);
    if (!iso || r.VALUE_NUMERIC == null || year > maxYear) continue;
    const cur = latest.get(iso);
    if (!cur || year > cur.year) latest.set(iso, { year, value: Number(r.VALUE_NUMERIC) });
  }
  return latest;
}

/** One indicator from the GHO OData API (same shape as dataWhoLatest).
 *  `dim` filters Dim1 (e.g. SEX_BTSX); pass null for indicators with no Dim1. */
async function ghoLatest(code, { dim = 'SEX_BTSX', maxYear = 2024 } = {}) {
  let filter = `SpatialDimType eq 'COUNTRY'`;
  if (dim) filter += ` and Dim1 eq '${dim}'`;
  const res = await fetch(`${GHO_API}/${code}?$filter=${filter}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GHO ${code}: ${res.status}`);
  const rows = (await res.json()).value || [];
  const latest = new Map();
  for (const r of rows) {
    if (r.NumericValue == null || r.TimeDim > maxYear) continue;
    const iso = r.SpatialDim, year = r.TimeDim;
    const cur = latest.get(iso);
    if (!cur || year > cur.year) latest.set(iso, { year, value: r.NumericValue });
  }
  return latest;
}

async function emit(slug, fetchLatest, meta, g) {
  let latest;
  try { latest = await fetchLatest(); } catch (e) { console.warn(`– ${slug}: ${e.message}; skipped.`); process.exitCode = 1; return; }
  const data = [...latest.entries()].map(([iso, { year, value }]) => {
    const info = g.get(iso);
    return { entity: info?.name || iso, group: info?.region || 'Other', period: String(year), value: round(value, 2), iso };
  });
  // Upstream row order varies between calls; sort so a refresh diffs cleanly.
  data.sort((a, b) => a.iso.localeCompare(b.iso));
  await writeDataset('macro', slug, { ...meta, parsedAt: PARSED }, data);
}

async function main() {
  const g = await geo();
  const m49 = await m49ToIso3();

  // data.who.int, CC BY 4.0. `url` is the indicator's page on the portal.
  const OPEN = { source: 'WHO Global Health Observatory (data.who.int)', license: 'CC BY 4.0' };
  const page = (path) => ({ ...OPEN, url: `https://data.who.int/indicators/i/${path}` });

  await emit('who-alcohol', () => dataWhoLatest('SA_0000001688', m49, { maxYear: 2022 }), {
    title: 'Alcohol Consumption per Capita', valueLabel: 'Litres of pure alcohol per person (15+)', unit: 'litres', changeMode: 'pct', topic: 'health',
    summary: 'Total recorded + unrecorded alcohol consumption per person aged 15+, in litres of pure alcohol. WHO Global Health Observatory.', ...page('EF38E6A/EE6F72A'),
  }, g);
  await emit('who-tobacco', () => dataWhoLatest('M_Est_tob_curr_std', m49, { maxYear: 2022 }), {
    title: 'Tobacco Use Prevalence', valueLabel: 'Age-standardised current tobacco use (15+)', unit: '%', changeMode: 'pp', topic: 'health',
    summary: 'Age-standardised prevalence of current tobacco use among people aged 15+, both sexes. WHO Global Health Observatory.', ...page('847662C/75DDA77'),
  }, g);
  await emit('who-road-deaths', () => dataWhoLatest('RS_198', m49, { sex: false }), {
    title: 'Road Traffic Deaths', valueLabel: 'Road traffic deaths per 100,000', unit: 'per 100k', changeMode: 'pct', topic: 'safety',
    summary: 'Estimated road traffic death rate per 100,000 population. WHO Global Health Observatory.', ...page('B9D9E6A/D6176E2'),
  }, g);
  await emit('who-obesity', () => dataWhoLatest('NCD_BMI_30A', m49, { maxYear: 2022 }), {
    title: 'Adult Obesity', valueLabel: 'Age-standardised obesity prevalence (18+)', unit: '%', changeMode: 'pp', topic: 'health',
    summary: 'Age-standardised prevalence of obesity (BMI ≥ 30) among adults aged 18+, both sexes. WHO Global Health Observatory.', ...page('C6262EC/BEFA58B'),
  }, g);
  await emit('who-uhc', () => dataWhoLatest('UHC_INDEX_REPORTED', m49, { sex: false }), {
    title: 'Universal Health Coverage Index', valueLabel: 'UHC service coverage index (0–100)', unit: 'index 0–100', changeMode: 'pp', topic: 'health',
    summary: 'WHO/World Bank Universal Health Coverage service coverage index (0–100), SDG 3.8.1. WHO Global Health Observatory.', ...page('3805B1E/9A706FD'),
  }, g);
  await emit('who-hypertension', () => dataWhoLatest('NCD_HYP_PREVALENCE_A', m49), {
    title: 'Hypertension Prevalence', valueLabel: 'Age-standardised hypertension (30–79)', unit: '%', changeMode: 'pp', topic: 'health',
    summary: 'Age-standardised prevalence of hypertension among adults aged 30–79, both sexes. WHO Global Health Observatory.', ...page('7DA4E68/608DE39'),
  }, g);
  // Mortality. These are WHO estimates rather than registered deaths — for
  // countries without civil registration they are modelled — and the summaries
  // say so, because a modelled figure shown as a count is the kind of number
  // that lies quietly.
  await emit('who-ncd-mortality-30-70', () => dataWhoLatest('NCDMORT3070', m49), {
    title: 'Premature NCD Mortality', valueLabel: 'Probability of dying at 30–70 from the four main NCDs', unit: '%', changeMode: 'pp', topic: 'health',
    summary: 'Probability of dying between ages 30 and 70 from cardiovascular disease, cancer, diabetes or chronic respiratory disease, both sexes. SDG 3.4.1. WHO estimate, modelled where death registration is incomplete.', ...page('C540135/1F96863'),
  }, g);

  // Not on data.who.int (checked 2026-10-12) — still from the GHO API.
  const GHO = { source: 'WHO Global Health Observatory', license: 'WHO terms of use for datasets (who.int): for public health purposes; see azenha.ai/bulldozer/licences', url: 'https://www.who.int/data/gho' };
  await emit('who-suicide', () => ghoLatest('MH_12'), {
    title: 'Suicide Rate', valueLabel: 'Age-standardised suicides per 100,000', unit: 'per 100k', changeMode: 'pct', topic: 'health',
    summary: 'Age-standardised suicide mortality rate per 100,000 population, both sexes. WHO Global Health Observatory.', ...GHO,
  }, g);
  await emit('who-ncd-mortality-rate', () => ghoLatest('WHS2_131'), {
    title: 'NCD Mortality Rate', valueLabel: 'Age-standardised NCD deaths per 100,000', unit: 'per 100k', changeMode: 'pct', topic: 'health',
    summary: 'Age-standardised death rate from noncommunicable diseases per 100,000 population, both sexes. WHO estimate, modelled where death registration is incomplete.', ...GHO,
  }, g);
  await emit('who-adult-mortality', () => ghoLatest('WHOSIS_000004'), {
    title: 'Adult Mortality', valueLabel: 'Probability of dying between 15 and 60, per 1,000', unit: 'per 1,000', changeMode: 'pct', topic: 'health',
    summary: 'Probability that a 15-year-old dies before reaching 60, per 1,000 population, both sexes. WHO estimate, modelled where death registration is incomplete.', ...GHO,
  }, g);
  console.log('✓ WHO: datasets written');
}
main();
