/**
 * World Bank open API → macro datasets (reproducible, no key). Financial
 * inclusion (Global Findex) and financial access — concepts the site lacks.
 * The API returns country rows mixed with regional/income aggregates; we keep
 * only real ISO-3 countries (validated against iso-alpha2.json) and take the
 * latest non-null year per country.
 *   node scripts/parse_worldbank.mjs
 *   node scripts/parse_worldbank.mjs --only=life-expectancy
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';

const GAP = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey', 'Gapminder', 'ddf--entities--geo--country.csv');
const ALPHA2 = new URL('../src/data/iso-alpha2.json', import.meta.url).pathname;
const PARSED = new Date().toISOString().slice(0, 10);
const WB = { source: 'World Bank Open Data', license: 'CC BY 4.0', url: 'https://data.worldbank.org/' };

async function geoAndCountries() {
  const a3a2 = JSON.parse(await readFile(ALPHA2, 'utf8'));     // iso3 -> iso2
  const real = new Set(Object.keys(a3a2));                     // real ISO-3 only (excludes WB aggregates)
  const a2toa3 = Object.fromEntries(Object.entries(a3a2).map(([a3, a2]) => [a2, a3])); // iso2 -> iso3
  const geo = new Map();
  try {
    for (const r of await gapminderRows()) {
      const k = (r.iso3166_1_alpha3 || '').toUpperCase();
      if (k) geo.set(k, { name: r.name, region: REGION_4[r.world_4region] || 'Other' });
    }
  } catch {}
  return { real, a2toa3, geo };
}

/** Fetch a WDI / Findex series → latest non-null value per real country.
 *  WDI rows carry countryiso3code; Findex DB series leave it blank and put a
 *  2-letter code in country.id, so we fall back to an ISO2→ISO3 lookup. */
async function wbLatest(code, ctx, maxYear = 2024) {
  const res = await fetch(`https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=8000&date=2015:${maxYear}`);
  const j = await res.json();
  if (!Array.isArray(j) || !j[1]) throw new Error(`WB ${code}: empty`);
  const latest = new Map();
  for (const r of j[1]) {
    let iso = (r.countryiso3code || '').toUpperCase();
    if (!ctx.real.has(iso)) {
      const cid = (r.country?.id || '').toUpperCase(); // Findex leaves iso3 here; some series use iso2
      iso = ctx.real.has(cid) ? cid : (ctx.a2toa3[cid] || '');
    }
    const year = Number(r.date);
    if (r.value == null || !ctx.real.has(iso) || year > maxYear) continue;
    const cur = latest.get(iso);
    if (!cur || year > cur.year) latest.set(iso, { year, value: r.value });
  }
  return latest;
}

async function emit(slug, code, meta, ctx, maxYear) {
  let latest;
  try { latest = await wbLatest(code, ctx, maxYear); } catch (e) { console.warn(`– ${slug}: ${e.message}; skipped.`); return; }
  const data = [...latest.entries()].map(([iso, { year, value }]) => {
    const info = ctx.geo.get(iso);
    return { entity: info?.name || iso, group: info?.region || 'Other', period: String(year), value: round(value, 2), iso };
  });
  await writeDataset('macro', slug, { ...meta, parsedAt: PARSED }, data);
}

/** Full annual series (not just the latest year) for an indicator that
 *  competes with a long series from another source — life expectancy vs
 *  Gapminder's 1800–2020 run. Keeping every year lets pages pin a matching
 *  year (e.g. 2021 next to 2021 cause-of-death data) while headlines take the
 *  latest. Real ISO-3 countries only, same filter as wbLatest. */
async function emitSeries(slug, code, meta, ctx, from = 1990, to = 2025) {
  const res = await fetch(`https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=20000&date=${from}:${to}`);
  const j = await res.json();
  if (!Array.isArray(j) || !j[1]?.length) { console.warn(`– ${slug}: empty; skipped.`); return; }
  const data = [];
  for (const r of j[1]) {
    const iso = (r.countryiso3code || '').toUpperCase();
    if (r.value == null || !ctx.real.has(iso)) continue;
    const info = ctx.geo.get(iso);
    data.push({ entity: info?.name || r.country?.value || iso, group: info?.region || 'Other', period: String(r.date), value: round(r.value, 2), iso });
  }
  data.sort((a, b) => a.entity.localeCompare(b.entity) || a.period.localeCompare(b.period));
  await writeDataset('macro', slug, { ...meta, parsedAt: PARSED }, data);
}

const LIFE = ['wb-life-expectancy', 'SP.DYN.LE00.IN', {
  title: 'Life Expectancy', valueLabel: 'Life expectancy at birth (years)', unit: 'years', changeMode: 'pp', topic: 'health',
  summary: 'Life expectancy at birth, total, in years — World Bank WDI series SP.DYN.LE00.IN, from the UN World Population Prospects. Fresher than the long Gapminder series (which ends in 2020); annual values since 1990.', ...WB,
}];

/** Share of world market capitalisation, per year — computed from the
 *  absolute US$ series (CM.MKT.LCAP.CD) against the WLD aggregate, so each
 *  year's shares are honest within that year. Country names fall back to the
 *  already-parsed datasets when the Gapminder geo file isn't around. */
async function emitMarketCapShare(ctx) {
  const res = await fetch('https://api.worldbank.org/v2/country/all/indicator/CM.MKT.LCAP.CD?format=json&per_page=20000&date=2013:2024');
  const j = await res.json();
  if (!Array.isArray(j) || !j[1]) { console.warn('– wb-market-cap-share: empty; skipped.'); return; }
  if (!ctx.geo.size) {
    for (const f of ['wb-market-cap', 'imf-gdp-usd']) {
      try {
        const ds = JSON.parse(await readFile(new URL(`../src/data/macro/${f}.json`, import.meta.url), 'utf8'));
        for (const o of ds.data) if (o.iso && !ctx.geo.has(o.iso)) ctx.geo.set(o.iso, { name: o.entity, region: o.group });
      } catch {}
    }
  }
  const world = new Map(); // year -> world total, US$
  const rows = [];
  for (const r of j[1]) {
    if (r.value == null) continue;
    const iso = (r.countryiso3code || '').toUpperCase();
    const year = Number(r.date);
    if (iso === 'WLD') { world.set(year, r.value); continue; }
    if (ctx.real.has(iso)) rows.push({ iso, year, cap: r.value });
  }
  const data = rows.filter((r) => world.get(r.year)).map((r) => {
    const info = ctx.geo.get(r.iso);
    return { entity: info?.name || r.iso, group: info?.region || 'Other', period: String(r.year), value: round((r.cap / world.get(r.year)) * 100, 3), iso: r.iso };
  });
  await writeDataset('macro', 'wb-market-cap-share', {
    title: 'Share of World Market Cap', valueLabel: 'Share of world listed-company market cap', unit: '% of world', changeMode: 'pp', topic: 'economy',
    summary: 'Country’s listed-company market capitalisation as a share of the world total, in current US$ — who owns how much of the world’s stock market. Computed from World Bank CM.MKT.LCAP.CD against the world aggregate, per year.', ...WB, parsedAt: PARSED,
  }, data);
}

async function main() {
  const ctx = await geoAndCountries();
  if (process.argv.includes('--only=market-cap-share')) { await emitMarketCapShare(ctx); return; }
  if (process.argv.includes('--only=life-expectancy')) { await emitSeries(...LIFE, ctx); return; }
  // Nominal exchange rate — local currency per US$ (period average).
  await emit('wb-exchange-rate', 'PA.NUS.FCRF', {
    title: 'Exchange Rate (per US$)', valueLabel: 'Local currency units per US$ (period average)', unit: 'LCU per US$', changeMode: 'pct', topic: 'economy',
    summary: 'Nominal official exchange rate — units of local currency per US dollar, annual average. World Bank / IMF.', ...WB,
  }, ctx);
  await emit('wb-account-ownership', 'FX.OWN.TOTL.ZS', {
    title: 'Bank Account Ownership', valueLabel: 'Adults (15+) with a financial account', unit: '%', changeMode: 'pp', topic: 'economy',
    summary: 'Share of adults (15+) with an account at a financial institution or mobile-money provider. World Bank Global Findex.', ...WB,
  }, ctx);
  await emit('wb-bank-branches', 'FB.CBK.BRCH.P5', {
    title: 'Bank Branches', valueLabel: 'Commercial bank branches per 100,000 adults', unit: 'per 100k', changeMode: 'pct', topic: 'economy',
    summary: 'Commercial bank branches per 100,000 adults — a measure of physical financial access. World Bank.', ...WB,
  }, ctx);
  await emit('wb-debit-card', 'fin2.t.d', {
    title: 'Debit Card Ownership', valueLabel: 'Adults (15+) who own a debit card', unit: '%', changeMode: 'pp', topic: 'economy',
    summary: 'Share of adults (15+) who own a debit card. World Bank Global Findex.', ...WB,
  }, ctx);
  // Fintech / digital finance (Global Findex)
  await emit('wb-digital-payments', 'g20.t.made', {
    title: 'Made a Digital Payment', valueLabel: 'Adults (15+) who made a digital payment', unit: '%', changeMode: 'pp', topic: 'economy',
    summary: 'Share of adults (15+) who made or received a digital payment in the past year — the headline fintech-adoption measure. World Bank Global Findex.', ...WB,
  }, ctx);
  await emit('wb-mobile-money', 'mobileaccount.t.d', {
    title: 'Mobile Money Account', valueLabel: 'Adults (15+) with a mobile-money account', unit: '%', changeMode: 'pp', topic: 'economy',
    summary: 'Share of adults (15+) with a mobile-money account (e.g. M-Pesa) — fintech beyond traditional banks. World Bank Global Findex.', ...WB,
  }, ctx);
  // Digital-services usage
  await emit('wb-online-news', 'con30d', {
    title: 'Read News Online', valueLabel: 'Adults (15+) who read news online (3 months)', unit: '%', changeMode: 'pp', topic: 'connectivity',
    summary: 'Share of adults (15+) who read news online in the past three months — a digital-services engagement measure. World Bank Digital Progress & Trends.', ...WB,
  }, ctx);
  await emit('wb-mobile-subscriptions', 'IT.CEL.SETS.P2', {
    title: 'Mobile Subscriptions', valueLabel: 'Mobile cellular subscriptions per 100 people', unit: 'per 100', changeMode: 'pct', topic: 'connectivity',
    summary: 'Mobile cellular subscriptions per 100 people (can exceed 100 where people hold multiple SIMs). World Bank / ITU.', ...WB,
  }, ctx, 2022); // cap: 2023/24 carry provisional outliers
  // Stock markets & listed companies (World Development Indicators)
  await emit('wb-market-cap', 'CM.MKT.LCAP.GD.ZS', {
    title: 'Stock Market Capitalisation', valueLabel: 'Listed-company market cap (% of GDP)', unit: '% of GDP', changeMode: 'pct', topic: 'economy',
    summary: 'Total market capitalisation of listed domestic companies as a share of GDP — financial-market depth. World Bank.', ...WB,
  }, ctx);
  await emit('wb-stocks-traded', 'CM.MKT.TRAD.GD.ZS', {
    title: 'Stocks Traded', valueLabel: 'Value of stocks traded (% of GDP)', unit: '% of GDP', changeMode: 'pct', topic: 'economy',
    summary: 'Total value of shares traded during the year as a share of GDP — stock-market activity and liquidity. World Bank.', ...WB,
  }, ctx);
  await emit('wb-listed-companies', 'CM.MKT.LDOM.NO', {
    title: 'Listed Companies', valueLabel: 'Domestic companies listed on the stock exchange', unit: 'count', changeMode: 'pct', topic: 'economy',
    summary: 'Number of domestic companies listed on the country’s stock exchange(s) at year end. World Bank.', ...WB,
  }, ctx);
  await emitMarketCapShare(ctx);
  // Health — full annual series, see emitSeries.
  await emitSeries(...LIFE, ctx);
  console.log('✓ World Bank: datasets written');
}
main();
