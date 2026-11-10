/**
 * Splits beside the headline figure we already publish: women and men, younger
 * and older, poorer and richer.
 *
 *   node scripts/parse_splits.mjs
 *
 * For a dataset whose upstream also publishes the series by sex, age group or
 * income group, this writes src/data/splits/<slug>.json with, per country, the
 * two groups' values for the SAME year as that country's headline figure. A split
 * from another year beside the headline would read as a contradiction
 * ("82.8 overall, but 84.5 and 81.2 — which year?"), so a country whose
 * upstream has no split for that exact year gets none.
 *
 * Kept out of the dataset files on purpose: writeDataset() rewrites those as
 * { meta, data } on every refresh and would drop anything else. Run after the
 * parsers that own the datasets (it is last in run_parsers.mjs).
 *
 * Same upstreams as the datasets themselves, so the licence is theirs:
 * World Bank WDI (CC BY 4.0), data.who.int (CC BY 4.0), WHO GHO API.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { round } from './lib/datasets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'data', 'splits');
const PARSED = new Date().toISOString().slice(0, 10);

// ── upstream fetchers: each returns Map("ISO|year" → { female, male }) ──────

const put = (m, iso, year, sex, v) => {
  const k = `${iso}|${year}`;
  const e = m.get(k) || {};
  e[sex] = v;
  m.set(k, e);
};

async function worldBank(femaleCode, maleCode, names = ['female', 'male']) {
  const m = new Map();
  for (const [code, sex] of [[femaleCode, names[0]], [maleCode, names[1]]]) {
    const res = await fetch(`https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=20000&date=1990:2025`);
    const j = await res.json();
    if (!Array.isArray(j) || !j[1]?.length) throw new Error(`World Bank ${code}: empty`);
    for (const r of j[1]) {
      const iso = (r.countryiso3code || '').toUpperCase();
      if (iso && r.value != null) put(m, iso, String(r.date), sex, Number(r.value));
    }
  }
  return m;
}

const XMART = 'https://xmart-api-public.who.int/DATA_';
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

let m49cache = null;
async function m49ToIso3() {
  if (m49cache) return m49cache;
  const rows = await xmart('REF_GEO_WIDE', {
    $filter: "TERM_LANG eq 'en' and GEO_CODE_M49 ne null and VALID_TO eq null",
    $select: 'GEO_CODE_M49,GEO_CODE_ISO_3',
  });
  const m = new Map();
  for (const r of rows) if (r.GEO_CODE_ISO_3) m.set(r.GEO_CODE_M49, r.GEO_CODE_ISO_3.toUpperCase());
  if (m.size < 150) throw new Error(`REF_GEO_WIDE: only ${m.size} codes`);
  return (m49cache = m);
}

async function dataWho(code) {
  const m49 = await m49ToIso3();
  const rows = await xmart('RELAY_MAY2023', {
    $filter: `IND_CODE eq '${code}' and DIM_TIME_TYPE eq 'YEAR' and DIM_1_CODE eq 'DIM_SEX' and DIM_MEMBER_1_CODE ne 'TOTAL'`,
    $select: 'DIM_GEO_CODE_M49,DIM_TIME,DIM_MEMBER_1_CODE,VALUE_NUMERIC',
  });
  const m = new Map();
  for (const r of rows) {
    const iso = m49.get(r.DIM_GEO_CODE_M49);
    const sex = r.DIM_MEMBER_1_CODE === 'FEMALE' ? 'female' : r.DIM_MEMBER_1_CODE === 'MALE' ? 'male' : null;
    if (iso && sex && r.VALUE_NUMERIC != null) put(m, iso, String(r.DIM_TIME), sex, Number(r.VALUE_NUMERIC));
  }
  if (!m.size) throw new Error(`data.who.int ${code}: no rows by sex`);
  return m;
}

async function gho(code) {
  const m = new Map();
  for (const [dim, sex] of [['SEX_FMLE', 'female'], ['SEX_MLE', 'male']]) {
    const res = await fetch(`https://ghoapi.azureedge.net/api/${code}?$filter=SpatialDimType eq 'COUNTRY' and Dim1 eq '${dim}'`,
      { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`GHO ${code}: ${res.status}`);
    for (const r of (await res.json()).value || []) {
      if (r.NumericValue != null) put(m, r.SpatialDim, String(r.TimeDim), sex, Number(r.NumericValue));
    }
  }
  if (!m.size) throw new Error(`GHO ${code}: no rows by sex`);
  return m;
}

// ── which datasets get a split, and from where ──────────────────────────────

const TARGETS = [
  // Global Findex publishes every headline by sex, age and income, same survey and year.
  { slug: 'wb-account-ownership', fetch: () => worldBank('FX.OWN.TOTL.FE.ZS', 'FX.OWN.TOTL.MA.ZS'),
    age: () => worldBank('FX.OWN.TOTL.YG.ZS', 'FX.OWN.TOTL.OL.ZS', ['a', 'b']), ageLabels: ['15–24', '25+'],
    income: () => worldBank('FX.OWN.TOTL.40.ZS', 'FX.OWN.TOTL.60.ZS', ['a', 'b']), incomeLabels: ['Poorest 40%', 'Richest 60%'],
    source: 'World Bank Global Findex (FX.OWN.TOTL.*)', url: 'https://www.worldbank.org/en/publication/globalfindex' },
  // Poverty and Inequality Platform: the bottom 40%'s mean beside everyone's, same survey.
  { slug: 'wb-average-income', fetch: null,
    income: () => worldBank('SI.SPR.PC40', 'SI.SPR.PCAP', ['a', 'b']), incomeLabels: ['Poorest 40%', 'Everyone'],
    source: 'World Bank Poverty and Inequality Platform (SI.SPR.PC40)', url: 'https://pip.worldbank.org/' },
  { slug: 'wb-life-expectancy', fetch: () => worldBank('SP.DYN.LE00.FE.IN', 'SP.DYN.LE00.MA.IN'),
    source: 'World Bank Open Data (SP.DYN.LE00.FE.IN, SP.DYN.LE00.MA.IN)', url: 'https://data.worldbank.org/indicator/SP.DYN.LE00.FE.IN' },
  { slug: 'who-tobacco', fetch: () => dataWho('M_Est_tob_curr_std'), source: 'WHO Global Health Observatory (data.who.int)', url: 'https://data.who.int/indicators/i/847662C/75DDA77' },
  { slug: 'who-obesity', fetch: () => dataWho('NCD_BMI_30A'), source: 'WHO Global Health Observatory (data.who.int)', url: 'https://data.who.int/indicators/i/C6262EC/BEFA58B' },
  { slug: 'who-hypertension', fetch: () => dataWho('NCD_HYP_PREVALENCE_A'), source: 'WHO Global Health Observatory (data.who.int)', url: 'https://data.who.int/indicators/i/7DA4E68/608DE39' },
  { slug: 'who-ncd-mortality-30-70', fetch: () => dataWho('NCDMORT3070'), source: 'WHO Global Health Observatory (data.who.int)', url: 'https://data.who.int/indicators/i/C540135/1F96863' },
  { slug: 'who-suicide', fetch: () => gho('MH_12'), source: 'WHO Global Health Observatory', url: 'https://www.who.int/data/gho' },
  { slug: 'who-ncd-mortality-rate', fetch: () => gho('WHS2_131'), source: 'WHO Global Health Observatory', url: 'https://www.who.int/data/gho' },
  { slug: 'who-adult-mortality', fetch: () => gho('WHOSIS_000004'), source: 'WHO Global Health Observatory', url: 'https://www.who.int/data/gho' },
];

async function one(t) {
  const ds = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'macro', `${t.slug}.json`), 'utf8'));
  // The headline per country is its newest period in the dataset.
  const head = new Map();
  for (const r of ds.data) {
    if (!r.iso || r.value == null) continue;
    const cur = head.get(r.iso);
    if (!cur || String(r.period) > cur.period) head.set(r.iso, { period: String(r.period) });
  }
  const isos = [...head.keys()].sort();
  const pick = (m, keys) => {
    const out = {};
    for (const iso of isos) {
      const { period } = head.get(iso);
      const e = m.get(`${iso}|${period}`);
      if (e && keys.every((k) => e[k] != null)) out[iso] = { period, ...Object.fromEntries(keys.map((k) => [k, round(e[k], 2)])) };
    }
    return out;
  };
  const file = { meta: { slug: t.slug, dims: {}, source: t.source, url: t.url, parsedAt: PARSED,
    note: 'Two groups’ values for the same year as each country’s headline figure.' } };
  const report = [];
  // A split for under half the countries means the upstream changed shape;
  // keep what we have rather than publish a thinned file.
  const check = (n, what) => { if (n < head.size / 2) throw new Error(`${what}: only ${n} of ${head.size} countries matched by year`); report.push(`${what} ${n}`); };
  if (t.fetch) {
    file.bySex = pick(await t.fetch(), ['female', 'male']);
    check(Object.keys(file.bySex).length, 'sex');
    file.meta.dims.sex = ['Women', 'Men'];
  }
  if (t.age) {
    file.byAge = pick(await t.age(), ['a', 'b']);
    check(Object.keys(file.byAge).length, 'age');
    file.meta.dims.age = t.ageLabels;
  }
  if (t.income) {
    file.byIncome = pick(await t.income(), ['a', 'b']);
    check(Object.keys(file.byIncome).length, 'income');
    file.meta.dims.income = t.incomeLabels;
  }
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, `${t.slug}.json`), JSON.stringify(file, null, 2) + '\n');
  console.log(`  ✓ ${t.slug}: ${report.join(', ')} of ${head.size} countries`);
}

for (const t of TARGETS) {
  try { await one(t); } catch (e) { console.warn(`  – ${t.slug}: ${e.message}; kept the existing split.`); process.exitCode = 1; }
}
