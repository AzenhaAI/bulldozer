/**
 * Parse the IMF World Economic Outlook tidy export into BullDozer datasets.
 *
 *   node scripts/parse_macro.mjs
 *   IMF_WEO_CSV=/path/to.csv REF_YEAR=2026 node scripts/parse_macro.mjs
 *
 * Source: a local tidy WEO export when present (the Mac); otherwise the IMF's
 * open DataMapper API, which always carries the latest WEO edition — so the
 * weekly run picks up a new edition (April, October) without the Mac. Country
 * names and regions are kept from our own files, so a refresh changes numbers,
 * not labels. Output JSON is committed.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { enRegion, latestN, writeDataset, round } from './lib/datasets.mjs';

const SRC =
  process.env.IMF_WEO_CSV ||
  join(homedir(), 'Documents', 'tableau_data', 'macro', 'imf_weo_apr2026_tidy.csv');
const REF_YEAR = Number(process.env.REF_YEAR) || new Date().getFullYear();

const SOURCE = {
  source: 'IMF World Economic Outlook (Apr 2026)',
  license: 'IMF terms — public data',
  url: 'https://www.imf.org/en/Publications/WEO',
  parsedAt: new Date().toISOString().slice(0, 10),
};

// indicator_code → dataset config
const INDICATORS = {
  NGDP_RPCH: { slug: 'imf-gdp-growth', title: 'Real GDP Growth', unit: '% YoY', valueLabel: 'Real GDP growth', changeMode: 'pp', dp: 1,
    summary: 'Annual percentage change of real gross domestic product.' },
  PCPIPCH: { slug: 'imf-inflation', title: 'Inflation (CPI)', unit: '% YoY', valueLabel: 'CPI inflation', changeMode: 'pp', dp: 1,
    summary: 'Annual percentage change of average consumer prices.' },
  LUR: { slug: 'imf-unemployment', title: 'Unemployment Rate', unit: '%', valueLabel: 'Unemployment rate', changeMode: 'pp', dp: 1,
    summary: 'Unemployed as a share of the total labour force.' },
  GGXWDG_NGDP: { slug: 'imf-govt-debt', title: 'Government Debt', unit: '% of GDP', valueLabel: 'Gross govt debt', changeMode: 'pp', dp: 1,
    summary: 'General government gross debt as a share of GDP.' },
  NGDPDPC: { slug: 'imf-gdp-per-capita', title: 'GDP per Capita', unit: 'USD', valueLabel: 'GDP per capita', changeMode: 'pct', dp: 0,
    summary: 'Gross domestic product per capita, current US dollars.' },
  BCA_NGDPD: { slug: 'imf-current-account', title: 'Current Account Balance', unit: '% of GDP', valueLabel: 'Current account', changeMode: 'pp', dp: 1,
    summary: 'Current account balance as a share of GDP.' },
  NGDPD: { slug: 'imf-gdp-usd', title: 'GDP (current US$)', unit: 'USD bn', valueLabel: 'GDP', changeMode: 'pct', dp: 1,
    summary: 'Gross domestic product at current prices, billions of US dollars.' },
  PPPGDP: { slug: 'imf-gdp-ppp', title: 'GDP (PPP)', unit: 'intl$ bn', valueLabel: 'GDP, PPP', changeMode: 'pct', dp: 1,
    summary: 'Gross domestic product based on purchasing-power-parity, billions of international dollars.' },
  PPPPC: { slug: 'imf-gdp-per-capita-ppp', title: 'GDP per Capita (PPP)', unit: 'intl$', valueLabel: 'GDP per capita, PPP', changeMode: 'pct', dp: 0,
    summary: 'GDP per capita based on purchasing-power-parity, international dollars.' },
  PPPSH: { slug: 'imf-world-gdp-share', title: 'Share of World GDP (PPP)', unit: '%', valueLabel: 'Share of world GDP', changeMode: 'pp', dp: 2,
    summary: 'Country share of world GDP, PPP basis.' },
  // Three decimals, not one. Stored in millions, one decimal rounds anything
  // under fifty thousand people to zero — San Marino, Nauru, Tuvalu, Palau,
  // Liechtenstein and the Marshall Islands all published "Population: 0
  // million" on their own country pages, beside a Gapminder figure saying
  // 0.01. Three decimals resolves to the thousand, which every state on earth
  // clears.
  LP: { slug: 'imf-population', title: 'Population', unit: 'million', valueLabel: 'Population', changeMode: 'pct', dp: 3,
    summary: 'Total population, millions of people.' },
  GGXCNL_NGDP: { slug: 'imf-fiscal-balance', title: 'Fiscal Balance', unit: '% of GDP', valueLabel: 'Govt net lending/borrowing', changeMode: 'pp', dp: 1,
    summary: 'General government net lending/borrowing as a share of GDP.' },
};

const DATAMAPPER = 'https://www.imf.org/external/datamapper/api/v1';
// The IMF's CDN refuses requests without a User-Agent (Access Denied page).
const IMF_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; BullDozer data refresh; +https://azenha.ai/bulldozer/)', Accept: 'application/json' };

/** The latest WEO from the IMF DataMapper API, as rows shaped like the tidy CSV.
 *  Aggregates (ADVEC, EURO, WEOWORLD…) are dropped by keeping real ISO-3 codes;
 *  names and regions come from the dataset already on disk, else Gapminder. */
async function fromDataMapper() {
  const { readFile: rf } = await import('node:fs/promises');
  const alpha = JSON.parse(await rf(new URL('../src/data/iso-alpha2.json', import.meta.url), 'utf8'));
  const known = new Map();
  try {
    const cur = JSON.parse(await rf(new URL('../src/data/macro/imf-gdp-growth.json', import.meta.url), 'utf8'));
    for (const o of cur.data) if (o.iso) known.set(o.iso, { name: o.entity, region: o.group });
  } catch { /* first run */ }
  // IMF's own codes for two territories, and Syria, back in the WEO from Oct 2026;
  // regions in the WEO taxonomy the other rows use.
  for (const [iso, name, region] of [['UVK', 'Kosovo', 'Europe & Central Asia'], ['WBG', 'West Bank and Gaza', 'Middle East & North Africa'],
    ['SYR', 'Syria', 'Middle East & North Africa']]) if (!known.has(iso)) known.set(iso, { name, region });
  const { gapminderRows, REGION_4 } = await import('./lib/datasets.mjs');
  const geo = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) geo.set(a3, { name: r.name, region: REGION_4[r.world_4region] || 'Other' });
  }
  const meta = await (await fetch(`${DATAMAPPER}/indicators`, { headers: IMF_HEADERS })).json();
  const edition = (meta.indicators?.NGDP_RPCH?.source || '').match(/\(([^)]+)\)/)?.[1] || 'latest';
  const rows = [];
  for (const code of Object.keys(INDICATORS)) {
    const j = await (await fetch(`${DATAMAPPER}/${code}`, { headers: IMF_HEADERS })).json();
    const byIso = j.values?.[code] || {};
    for (const [iso, years] of Object.entries(byIso)) {
      if (!(iso in alpha) && !known.has(iso)) continue; // UVK, WBG: IMF codes we already use
      const k = known.get(iso) || geo.get(iso);
      if (!k) continue;
      for (const [year, value] of Object.entries(years)) {
        rows.push({ indicator_code: code, country: k.name, region: k.region, iso3: iso, year, value: String(value), _regionEn: true });
      }
    }
  }
  return { rows, edition };
}

async function main() {
  let text = null;
  try {
    text = await readFile(SRC, 'utf8');
  } catch { /* no local export: use the API below */ }
  let apiRows = null;
  if (text === null) {
    try {
      const { rows, edition } = await fromDataMapper();
      apiRows = rows;
      SOURCE.source = `IMF World Economic Outlook (${edition.replace(/^(\w{3})\w* (\d{4})$/, '$1 $2')})`;
      SOURCE.url = 'https://www.imf.org/external/datamapper/';
    } catch (e) {
      console.warn(`– IMF WEO: no local export and the DataMapper API failed (${e.message}); skipped.`);
      return;
    }
  }

  // Collect: code → country → { region, byYear: {year: value} }
  const collected = {};
  for (const code of Object.keys(INDICATORS)) collected[code] = new Map();

  for (const row of apiRows || parseCsvObjects(text)) {
    const code = row.indicator_code;
    if (!collected[code]) continue;
    const value = Number(row.value);
    if (!row.country || row.value === '' || Number.isNaN(value)) continue;
    const map = collected[code];
    let rec = map.get(row.country);
    if (!rec) {
      rec = { region: row._regionEn ? row.region : enRegion(row.region), iso: (row.iso3 || '').toUpperCase(), byYear: {} };
      map.set(row.country, rec);
    }
    rec.byYear[row.year] = value;
  }

  console.log(`IMF WEO → ${apiRows ? SOURCE.source + ' via DataMapper' : SRC.split('/').pop()} (ref year ${REF_YEAR})`);
  for (const [code, cfg] of Object.entries(INDICATORS)) {
    const map = collected[code];
    const allYears = new Set();
    for (const rec of map.values()) for (const y of Object.keys(rec.byYear)) allYears.add(y);
    const keep = latestN([...allYears], 8, REF_YEAR);
    if (keep.length < 2) {
      console.log(`  – ${cfg.slug}: not enough years, skipped`);
      continue;
    }

    const data = [];
    for (const [country, rec] of map) {
      for (const period of keep) {
        const v = rec.byYear[period];
        if (v == null) continue;
        data.push({ entity: country, group: rec.region, period, value: round(v, cfg.dp), iso: rec.iso });
      }
    }

    await writeDataset('macro', cfg.slug, {
      title: cfg.title,
      summary: `${cfg.summary} IMF WEO, ${keep[0]}–${keep.at(-1)}.`,
      unit: cfg.unit,
      valueLabel: cfg.valueLabel,
      changeMode: cfg.changeMode,
      ...SOURCE,
    }, data, { carryForward: false }); // each WEO edition replaces the last whole
  }
}

main().catch((err) => {
  console.error('✗ parse_macro failed:', err.message);
  process.exit(1);
});
