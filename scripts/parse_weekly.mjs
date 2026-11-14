/**
 * Economy this week — the latest reading of each headline indicator for
 * about 40 economies, each cell with its own period and source.
 *
 *   node scripts/parse_weekly.mjs
 *
 * Writes src/data/weekly/economy.json. Each cell keeps one preferred open
 * source, falling back to another only when it lags (never a paid source):
 *   GDP, % on a year ago and quarter on quarter (annualised)
 *       OECD Quarterly National Accounts (CC BY 4.0); IMF QNEA for others
 *   Consumer prices, % on a year ago      IMF CPI (monthly); euro area members
 *       harmonised (HICP, Eurostat), as weekly tables print them
 *   Unemployment rate, %                  Eurostat (EU, monthly, ILO definition);
 *       IMF Labor Statistics for the rest
 *   10-year government bond yield, %      OECD Financial market statistics (monthly),
 *       OECD members only (the partner series are other maturities)
 *   Currency per US$ and % change on a year ago   ECB daily reference rates,
 *       crossed through the dollar; IMF end-of-month rates where the ECB has none
 *   2026 forecasts: GDP, prices, current account, budget balance — the IMF
 *     WEO datasets already on the site (src/data/macro/imf-*.json)
 *   Commodities: Brent, gold, food and all-commodity indices — IMF PCPS
 * The Economist's weekly table was the model for the layout only; none of its
 * figures are used (they come from Haver Analytics and EIU, both licensed).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { ROOT } from './lib/datasets.mjs';
import countryNames from '../src/data/country-names.json' with { type: 'json' };
import countryAlpha2 from '../src/data/iso-alpha2.json' with { type: 'json' };
import countryCurrency from '../src/data/country-currency.json' with { type: 'json' };

const UA = { 'User-Agent': 'Mozilla/5.0 (BullDozer open-data refresh)' };
const OUT = join(ROOT, 'src', 'data', 'weekly', 'economy.json');

// The set of economies, in the familiar order of weekly indicator tables.
const COUNTRIES = [
  'USA', 'CHN', 'JPN', 'GBR', 'CAN', 'EA', 'AUT', 'BEL', 'FRA', 'DEU', 'GRC', 'ITA', 'NLD', 'ESP',
  'CZE', 'DNK', 'NOR', 'POL', 'RUS', 'SWE', 'CHE', 'TUR', 'AUS', 'HKG', 'IND', 'IDN', 'MYS', 'PAK',
  'PHL', 'SGP', 'KOR', 'TWN', 'THA', 'ARG', 'BRA', 'CHL', 'COL', 'MEX', 'PER', 'EGY', 'ISR', 'SAU', 'ZAF',
];
const NAME = { EA: 'Euro area' };
// Codes each source uses for the euro area aggregate.
const OECD_CODE = { EA: 'EA20' };
// Eurostat: the euro area is EA21 since Bulgaria joined in January 2026.
const ESTAT_CODE = { EA: 'EA21', GRC: 'EL', GBR: 'UK' };
const ESTAT_EU = new Set(['AUT', 'BEL', 'FRA', 'DEU', 'GRC', 'ITA', 'NLD', 'ESP', 'CZE', 'DNK', 'POL', 'SWE', 'EA']);
// OECD members among our economies (yields for others are other maturities).
const OECD_MEMBERS = new Set(['USA', 'JPN', 'GBR', 'CAN', 'EA', 'AUT', 'BEL', 'FRA', 'DEU', 'GRC', 'ITA', 'NLD', 'ESP', 'CZE', 'DNK', 'NOR', 'POL', 'SWE', 'CHE', 'TUR', 'AUS', 'KOR', 'CHL', 'COL', 'MEX', 'ISR']);
const IMF_CODE = { EA: 'G163' };
const EURO = new Set(['AUT', 'BEL', 'FRA', 'DEU', 'GRC', 'ITA', 'NLD', 'ESP', 'EA']);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-M09" / "2026-09" → { key: "2026-09", label: "Sep 2026" }; "2026-Q3" → { key: "2026-Q3", label: "Q3 2026" }. */
function period(p) {
  let m = String(p).match(/^(\d{4})-M?(\d{2})$/);
  if (m) return { key: `${m[1]}-${m[2]}`, label: `${MONTHS[+m[2] - 1]} ${m[1]}`, sort: +m[1] * 12 + (+m[2] - 1) };
  m = String(p).match(/^(\d{4})-Q(\d)$/);
  if (m) return { key: `${m[1]}-Q${m[2]}`, label: `Q${m[2]} ${m[1]}`, sort: +m[1] * 12 + (+m[2]) * 3 - 1 };
  // An annual figure is an average over the year: it sorts as June, so a Q3
  // or Q4 reading of the same year counts as fresher.
  return { key: String(p), label: String(p), sort: Number(String(p).slice(0, 4)) * 12 + 5 };
}

// Sources that did not answer this run: a missing OECD flow stops the run
// (the last file stays), others are listed in the JSON as `degraded`.
const failed = [];
// The OECD answers 500 to calls in quick succession: space them out and back off.
let lastOecd = 0;
async function get(url, accept) {
  const isOecd = url.includes('sdmx.oecd.org');
  for (let i = 0; i < 4; i++) {
    if (isOecd) { const wait = lastOecd + 20000 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); lastOecd = Date.now(); }
    try {
      const res = await fetch(url, { headers: { ...UA, ...(accept ? { Accept: accept } : {}) }, signal: AbortSignal.timeout(120_000) });
      if (res.ok) return res.text();
      if (res.status === 404) return '';
      console.warn(`  – ${res.status} ${url.slice(0, 120)}`);
    } catch (e) { console.warn(`  – ${e.message} ${url.slice(0, 120)}`); }
    await new Promise((r) => setTimeout(r, (isOecd ? 30000 : 2000) * (i + 1)));
  }
  return null;
}

const IMF_CSV = 'application/vnd.sdmx.data+csv;version=2.0.0';
/** IMF SDMX 3.0 rows for a key with the country list in first position. */
async function imf(flow, keyRest, since, agency = 'IMF.STA', countries = COUNTRIES) {
  const codes = countries.map((c) => IMF_CODE[c] || c).join('+');
  const url = `https://api.imf.org/external/sdmx/3.0/data/dataflow/${agency}/${flow}/+/${codes}${keyRest ? '.' + keyRest : ''}?c%5BTIME_PERIOD%5D=ge:${since}`;
  const text = await get(url, IMF_CSV);
  if (text == null) { failed.push(`IMF ${flow}`); return []; }
  const back = Object.fromEntries(Object.entries(IMF_CODE).map(([k, v]) => [v, k]));
  return [...parseCsvObjects(text)].map((r) => ({ ...r, COUNTRY: back[r.COUNTRY] || r.COUNTRY })).filter((r) => r.OBS_VALUE !== '');
}

/** OECD SDMX rows (csv with labels). */
async function oecd(flow, key, since) {
  const url = `https://sdmx.oecd.org/public/rest/data/${flow}/${key}?startPeriod=${since}&format=csvfilewithlabels`;
  const text = await get(url);
  // One flaky source must not sink the week: the cells fall back to the
  // others, and the fill check at the end guards against a broken run.
  if (text == null) { failed.push(`OECD ${flow}`); return []; }
  const back = Object.fromEntries(Object.entries(OECD_CODE).map(([k, v]) => [v, k]));
  const want = new Set(COUNTRIES);
  return [...parseCsvObjects(text)].map((r) => ({ ...r, REF_AREA: back[r.REF_AREA] || r.REF_AREA })).filter((r) => r.OBS_VALUE !== '' && want.has(r.REF_AREA));
}

/** Eurostat JSON-stat → Map(iso → {value, period, label, sort, source}) of each country's latest month. */
async function eurostat(table, params) {
  const geos = [...ESTAT_EU].map((c) => ESTAT_CODE[c] || (countryAlpha2[c] ?? c));
  const back = Object.fromEntries([...ESTAT_EU].map((c) => [ESTAT_CODE[c] || (countryAlpha2[c] ?? c), c]));
  const q = new URLSearchParams(params);
  for (const g of geos) q.append('geo', g);
  const text = await get(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${table}?${q}`);
  const out = new Map();
  if (!text) { failed.push(`Eurostat ${table}`); return out; }
  const d = JSON.parse(text);
  const gi = d.dimension.geo.category.index, ti = d.dimension.time.category.index;
  const nT = Object.keys(ti).length;
  for (const [g, gIdx] of Object.entries(gi)) {
    for (const [t, tIdx] of Object.entries(ti)) {
      const v = d.value[String(gIdx * nT + tIdx)];
      if (v == null) continue;
      const p = period(t);
      const iso = back[g];
      if (!out.has(iso) || p.sort > out.get(iso).sort) out.set(iso, { value: v, period: p.key, label: p.label, sort: p.sort, source: 'Eurostat' });
    }
  }
  return out;
}

/** Latest observation per country from rows → Map(iso → {value, period, label, sort, source}). */
function latest(rows, isoKey, periodKey, valueKey, source, filter = () => true) {
  const out = new Map();
  for (const r of rows) {
    if (!filter(r)) continue;
    const v = Number(r[valueKey]);
    if (!Number.isFinite(v)) continue;
    const p = period(r[periodKey]);
    const cur = out.get(r[isoKey]);
    if (!cur || p.sort > cur.sort) out.set(r[isoKey], { value: v, period: p.key, label: p.label, sort: p.sort, source });
  }
  return out;
}

/**
 * One source per country where it can be: the first map that has the country
 * wins unless it is more than `lag` months behind the freshest candidate.
 * Switching between series with different definitions (India's OECD and IMF
 * CPI differ by up to 0.8 points in the same month) would move the number
 * for reasons that are not news.
 */
function preferred(lag, ...maps) {
  const out = new Map();
  const isos = new Set(maps.flatMap((m) => [...m.keys()]));
  for (const iso of isos) {
    const cands = maps.map((m) => m.get(iso)).filter(Boolean);
    const best = Math.max(...cands.map((c) => c.sort));
    out.set(iso, cands.find((c) => best - c.sort <= lag));
  }
  return out;
}

const round = (v, dp) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp);
// A reading more than two years old is not "latest": left blank.
const STALE_MONTHS = 24;
const nowSort = new Date().getUTCFullYear() * 12 + new Date().getUTCMonth();
const fresh = (c) => c && nowSort - c.sort <= STALE_MONTHS;
const cell = (c, dp) => (fresh(c) ? { value: round(c.value, dp), period: c.label, source: c.source } : null);

async function weoForecast(slug, year) {
  try {
    const d = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'macro', `${slug}.json`), 'utf8'));
    return new Map(d.data.filter((o) => String(o.period) === year).map((o) => [o.iso, o.value]));
  } catch { return new Map(); }
}

async function main() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const since = `${y - 2}-01`;
  const sinceQ = `${y - 2}-Q1`;
  // The OECD answers 500 when a key lists a country it does not carry: ask
  // for all areas and keep ours.
  const oecdList = '';
  console.log('Economy this week →');

  // GDP: OECD growth rates (GY = on a year ago, G1 = on previous quarter); IMF QNEA levels for the rest.
  const qna = await oecd('OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_OECD,1.1', `Q..${oecdList}.S1..B1GQ......G1+GY.`, sinceQ);
  const gdpY = latest(qna, 'REF_AREA', 'TIME_PERIOD', 'OBS_VALUE', 'OECD', (r) => r.TRANSFORMATION === 'GY');
  const gdpQ = latest(qna, 'REF_AREA', 'TIME_PERIOD', 'OBS_VALUE', 'OECD', (r) => r.TRANSFORMATION === 'G1');
  const qnea = await imf('QNEA', 'B1GQ.Q.SA.XDC.Q', sinceQ);
  const lv = new Map();
  for (const r of qnea) (lv.get(r.COUNTRY) ?? lv.set(r.COUNTRY, new Map()).get(r.COUNTRY)).set(r.TIME_PERIOD, Number(r.OBS_VALUE));
  const imfY = new Map(), imfQ = new Map();
  for (const [iso, m] of lv) {
    const ps = [...m.keys()].sort();
    const last = ps.at(-1); if (!last) continue;
    const [yy, q] = last.split('-Q').map(Number);
    const ago = `${yy - 1}-Q${q}`, prev = q > 1 ? `${yy}-Q${q - 1}` : `${yy - 1}-Q4`;
    const p = period(last);
    if (m.has(ago)) imfY.set(iso, { value: (m.get(last) / m.get(ago) - 1) * 100, period: p.key, label: p.label, sort: p.sort, source: 'IMF' });
    if (m.has(prev)) imfQ.set(iso, { value: (m.get(last) / m.get(prev) - 1) * 100, period: p.key, label: p.label, sort: p.sort, source: 'IMF' });
  }
  const gdpYoy = preferred(3, gdpY, imfY);
  const gdpQoq = preferred(3, gdpQ, imfQ);

  // Prices, unemployment, currencies: IMF.
  // IMF first (one definition for all), the OECD where the IMF is more than a month behind.
  const cpiImf = preferred(1,
    latest(await imf('CPI', 'CPI._T.YOY_PCH_PA_PT.M', `${y - 2}-M01`), 'COUNTRY', 'TIME_PERIOD', 'OBS_VALUE', 'IMF'),
    latest(await oecd('OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,1.0', '.M.N.CPI.PA._T.N.GY', `${y - 2}-01`), 'REF_AREA', 'TIME_PERIOD', 'OBS_VALUE', 'OECD'));
  const hicp = await eurostat('prc_hicp_minr', { unit: 'RCH_A', coicop18: 'TOTAL', sinceTimePeriod: `${y - 2}-01` });
  // Euro area members: the harmonised index, as weekly tables print them.
  const cpi = new Map(cpiImf);
  for (const [iso, v] of hicp) if (EURO.has(iso)) cpi.set(iso, v);
  const ls = await imf('LS', 'U.PT.*', `${y - 2}-M01`);
  // Unemployment, ILO definition everywhere: the freshest of Eurostat, the
  // OECD's monthly series, ILOSTAT (monthly, then quarterly) and the IMF.
  const une = await oecd('OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M,1.0', '.UNE_LF_M.PT_LF_SUB..Y._T.Y_GE15..M', `${y - 2}-01`);
  const ilo = async (f) => {
    const t = await get(`https://rplumber.ilo.org/data/indicator/?id=UNE_DEAP_SEX_AGE_RT_${f}&ref_area=${COUNTRIES.filter((c) => c !== 'EA').join('+')}&sex=SEX_T&classif1=AGE_YTHADULT_YGE15&timefrom=${y - 2}&format=.csv`);
    return latest([...parseCsvObjects((t || '').replace(/^\uFEFF/, ''))].map((r) => ({ ...r, time: r.time?.replace(/M(\d\d)$/, '-$1').replace(/Q(\d)$/, '-Q$1') })), 'ref_area', 'time', 'obs_value', 'ILO');
  };
  const unemp = preferred(2,
    await eurostat('une_rt_m', { s_adj: 'SA', age: 'TOTAL', sex: 'T', unit: 'PC_ACT', sinceTimePeriod: `${y - 2}-01` }),
    latest(une, 'REF_AREA', 'TIME_PERIOD', 'OBS_VALUE', 'OECD', (r) => r.MEASURE === 'UNE_LF_M' && r.ADJUSTMENT === 'Y' && r.SEX === '_T' && r.AGE === 'Y_GE15' && r.FREQ === 'M'),
    await ilo('M'), await ilo('Q'),
    latest(ls, 'COUNTRY', 'TIME_PERIOD', 'OBS_VALUE', 'IMF'));
  const er = await imf('ER', 'XDC_USD.EOP_RT.M', `${y - 2}-M01`, 'IMF.STA', COUNTRIES.filter((c) => !EURO.has(c) && c !== 'USA'));
  const fxByIso = new Map();
  for (const r of er) (fxByIso.get(r.COUNTRY) ?? fxByIso.set(r.COUNTRY, new Map()).get(r.COUNTRY)).set(r.TIME_PERIOD, Number(r.OBS_VALUE));

  // ECB daily reference rates (per euro), crossed through the dollar.
  const ecbText = await get(`https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?startPeriod=${y - 1}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01&format=csvdata`);
  const ecb = new Map();
  for (const r of ecbText ? parseCsvObjects(ecbText) : []) (ecb.get(r.CURRENCY) ?? ecb.set(r.CURRENCY, new Map()).get(r.CURRENCY)).set(r.TIME_PERIOD, Number(r.OBS_VALUE));
  const usd = ecb.get('USD');
  const ecbFx = (cur) => {
    if (!usd) return null;
    const perUsdAt = (day) => (cur === 'EUR' ? 1 / usd.get(day) : ecb.get(cur)?.get(day) / usd.get(day));
    const days = [...usd.keys()].filter((d) => cur === 'EUR' || ecb.get(cur)?.has(d)).sort();
    const last = days.at(-1);
    if (!last || (now - new Date(last)) / 864e5 > 14) return null; // a stale series (e.g. suspended) is not "latest"
    const target = new Date(last); target.setUTCFullYear(target.getUTCFullYear() - 1);
    const ago = days.filter((d) => d <= target.toISOString().slice(0, 10)).at(-1);
    const v = perUsdAt(last);
    const d = new Date(last + 'T00:00:00Z');
    return { v, label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, chg: ago ? (perUsdAt(ago) / v - 1) * 100 : null };
  };

  // 10-year government bond yields: OECD long-term interest rates.
  const ltr = await oecd('OECD.SDD.STES,DSD_STES@DF_FINMARK,4.0', `${oecdList}.M.IRLT.PA.....`, `${y - 2}-01`);
  const ylByIso = new Map();
  for (const r of ltr) (ylByIso.get(r.REF_AREA) ?? ylByIso.set(r.REF_AREA, new Map()).get(r.REF_AREA)).set(r.TIME_PERIOD, Number(r.OBS_VALUE));

  // Forecasts for this year from the WEO datasets on the site.
  const yr = String(y);
  const [fGdp, fCpi, fCa, fBud] = await Promise.all(['imf-gdp-growth', 'imf-inflation', 'imf-current-account', 'imf-fiscal-balance'].map((s) => weoForecast(s, yr)));

  const rows = [];
  const dp = (v) => (v >= 100 ? 0 : v >= 10 ? 1 : 2);
  for (const iso of COUNTRIES) {
    const cur = EURO.has(iso) ? 'EUR' : countryCurrency[iso]?.code;
    const fx = fxByIso.get(iso);
    let fxCell = null;
    const e = cur && cur !== 'USD' ? ecbFx(cur) : null;
    if (e) fxCell = { perUsd: round(e.v, dp(e.v)), period: e.label, source: 'ECB', changeYoy: round(e.chg, 1) };
    else if (fx?.size) {
      const ps = [...fx.keys()].sort(); const last = ps.at(-1);
      const [yy, mm] = last.split('-M');
      const ago = `${+yy - 1}-M${mm}`;
      const p = period(last);
      if (fresh(p)) fxCell = { perUsd: round(fx.get(last), dp(fx.get(last))), period: p.label, source: 'IMF',
        // Positive: the currency gained against the dollar (fewer units per $).
        changeYoy: fx.has(ago) ? round((fx.get(ago) / fx.get(last) - 1) * 100, 1) : null };
    }
    const yl = OECD_MEMBERS.has(iso) ? ylByIso.get(iso) : null;
    let ylCell = null;
    if (yl?.size) {
      const ps = [...yl.keys()].sort(); const last = ps.at(-1);
      const [yy, mm] = last.split('-');
      const ago = `${+yy - 1}-${mm}`;
      if (fresh(period(last))) ylCell = { value: round(yl.get(last), 2), period: period(last).label, source: 'OECD', changeBp: yl.has(ago) ? Math.round((yl.get(last) - yl.get(ago)) * 100) : null };
    }
    const q = gdpQoq.get(iso);
    rows.push({
      iso, name: NAME[iso] || countryNames[iso]?.common || iso,
      gdp: cell(gdpYoy.get(iso), 1),
      // Quarter on quarter, annualised as in most weekly tables: (1 + q)^4 − 1.
      gdpQoqAnn: fresh(q) ? { value: round(((1 + q.value / 100) ** 4 - 1) * 100, 1), period: q.label, source: q.source } : null,
      gdpForecast: round(fGdp.get(iso), 1),
      cpi: cell(cpi.get(iso), 1),
      cpiForecast: round(fCpi.get(iso), 1),
      unemployment: cell(unemp.get(iso), 1),
      currentAccount: round(fCa.get(iso), 1),
      budgetBalance: round(fBud.get(iso), 1),
      yield10y: ylCell,
      currency: fxCell,
    });
  }

  // Commodities: IMF Primary Commodity Prices, monthly.
  const COMMOD = [['POILBRE', 'Brent crude', '$ a barrel'], ['PGOLD', 'Gold', '$ an ounce'], ['PFOOD', 'Food (IMF index)', 'index'], ['PALLMETA', 'Metals (IMF index)', 'index'], ['PALLFNF', 'All commodities (IMF index)', 'index']];
  const pcps = await imf('PCPS', `${COMMOD.map((c) => c[0]).join('+')}.*.M`, `${y - 2}-M01`, 'IMF.RES', ['G001']); // G001: world
  const commodities = [];
  for (const [code, name, unit] of COMMOD) {
    const rs = pcps.filter((r) => r.INDICATOR === code && r.DATA_TRANSFORMATION === (unit === 'index' ? 'INDEX' : 'USD'));
    const m = new Map(rs.map((r) => [r.TIME_PERIOD, Number(r.OBS_VALUE)]));
    const ps = [...m.keys()].sort(); const last = ps.at(-1);
    if (!last) continue;
    const [yy, mm] = last.split('-M');
    const prevM = +mm > 1 ? `${yy}-M${String(+mm - 1).padStart(2, '0')}` : `${+yy - 1}-M12`;
    const ago = `${+yy - 1}-M${mm}`;
    commodities.push({ name, unit, value: round(m.get(last), 1), period: period(last).label,
      changeMonth: m.has(prevM) ? round((m.get(last) / m.get(prevM) - 1) * 100, 1) : null,
      changeYear: m.has(ago) ? round((m.get(last) / m.get(ago) - 1) * 100, 1) : null, source: 'IMF' });
  }

  const filled = (k) => rows.filter((r) => r[k] != null).length;
  console.log(`  GDP ${filled('gdp')}, q/q ${filled('gdpQoqAnn')}, CPI ${filled('cpi')}, unemployment ${filled('unemployment')}, 10y ${filled('yield10y')}, FX ${filled('currency')} of ${rows.length}; commodities ${commodities.length}`);
  if (failed.length) console.warn(`  – did not answer: ${failed.join('; ')}`);
  if (failed.some((f) => f.startsWith('OECD'))) throw new Error('an OECD flow did not answer — keeping the last file (run again later)');
  if (filled('gdp') < 30 || filled('cpi') < 30) throw new Error('too few readings — a source changed; keeping the last file');
  await mkdir(join(ROOT, 'src', 'data', 'weekly'), { recursive: true });
  await writeFile(OUT, JSON.stringify({ asOf: now.toISOString().slice(0, 10), forecastYear: yr, degraded: failed, rows, commodities }, null, 1) + '\n');
  console.log(`✓ ${OUT}`);
}

main().catch((e) => { console.error('✗ parse_weekly failed:', e.message); process.exit(1); });
