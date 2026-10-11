/**
 * Series first published from the QoG Standard Dataset, now read from each
 * indicator's original producer under that producer's open licence.
 *
 * QoG's terms allow only academic, non-commercial use: "We do not allow other
 * uses of these data including but not limited to redistribution,
 * commercialization and other for-profit usage."
 * (https://www.gu.se/en/quality-government/qog-data/data-downloads/standard-dataset)
 * The slugs keep their qog- prefix so existing links keep working.
 *
 * - World Bank, CC BY 4.0 — open API, no key:
 *     Worldwide Governance Indicators (API source 3): control of corruption,
 *     government effectiveness, voice & accountability;
 *     World Development Indicators: health spending, education spending,
 *     infant mortality.
 * - Transparency International, CC BY 4.0 — the Corruption Perceptions Index
 *   from TI's own results workbook ("the CPI and datasets are licensed under
 *   CC BY 4.0", https://www.transparency.org/en/copyright-enquiries).
 *
 * Not moved (their producers' terms do not allow our use either; see
 * src/data/licences.ts): Freedom House status, Fraser EFW, IEP Global Peace
 * Index, Yale EPI. The QoG copy of RSF's index is retired with RSF.
 *
 *   node scripts/parse_qog_originals.mjs
 */
import { readFile } from 'node:fs/promises';
import { writeDataset, pickPeriodsN, round } from './lib/datasets.mjs';
import { xlsxRows, xlsxSheetNames } from './lib/xlsx.mjs';

const today = new Date().toISOString().slice(0, 10);
const NAMES = JSON.parse(await readFile(new URL('../src/data/country-names.json', import.meta.url), 'utf8'));
const nameOf = (iso, fallback) => NAMES[iso]?.common || fallback || iso;

// World Bank regions, with the Americas merged as on the rest of the site.
// Afghanistan and Pakistan stay in South Asia (the Bank moved them to its
// Middle East & North Africa group in 2024), so groups match the earlier
// versions of these series.
const REGION_FIX = {
  'Latin America & Caribbean': 'Americas',
  'North America': 'Americas',
  'Middle East, North Africa, Afghanistan & Pakistan': 'Middle East & North Africa',
};
// Malta: the Bank files it under Middle East & North Africa; the site (and the
// earlier versions of these series) keep it in Europe.
const ISO_REGION_FIX = { AFG: 'South Asia', PAK: 'South Asia', TWN: 'East Asia & Pacific', MLT: 'Europe & Central Asia' };

/** World Bank country list → iso3 → region (real economies only; aggregates
 *  carry region "Aggregates"). */
async function wbCountries() {
  const res = await fetch('https://api.worldbank.org/v2/country?format=json&per_page=400');
  const j = await res.json();
  if (!Array.isArray(j) || !j[1]) throw new Error('WB country list: empty');
  const m = new Map();
  for (const c of j[1]) {
    if (c.region?.value === 'Aggregates' || !c.id) continue;
    m.set(c.id, ISO_REGION_FIX[c.id] || REGION_FIX[c.region.value.trim()] || c.region.value.trim());
  }
  return m;
}

/** Every year of a World Bank series, real countries only. */
async function wbSeries(code, source, countries) {
  const src = source ? `&source=${source}` : '';
  const res = await fetch(`https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=30000&date=2010:2030${src}`);
  if (!res.ok) throw new Error(`WB ${code}: ${res.status}`);
  const j = await res.json();
  if (!Array.isArray(j) || !j[1]?.length) throw new Error(`WB ${code}: empty`);
  if (j[0].pages > 1) throw new Error(`WB ${code}: paginated (${j[0].pages} pages)`);
  return j[1]
    .filter((r) => r.value != null && countries.has(r.countryiso3code))
    .map((r) => ({ iso: r.countryiso3code, name: r.country?.value, year: r.date, value: r.value }));
}

/** The latest CPI results workbook from transparency.org → every year's score. */
async function tiCpi() {
  const now = new Date().getUTCFullYear();
  for (let y = now; y >= now - 3; y--) {
    const page = await fetch(`https://www.transparency.org/en/cpi/${y}`);
    if (!page.ok) continue;
    const href = (await page.text()).match(/https:\/\/images\.transparencycdn\.org\/images\/CPI\d{4}_Results\.xlsx/)?.[0];
    if (!href) continue;
    const buf = Buffer.from(await (await fetch(href)).arrayBuffer());
    const sheet = xlsxSheetNames(buf).find((s) => /^CPI Timeseries/i.test(s));
    if (!sheet) throw new Error(`${href}: no timeseries sheet`);
    const rows = xlsxRows(buf, sheet);
    const hi = rows.findIndex((r) => r[1] === 'ISO3');
    if (hi < 0) throw new Error(`${href}: header row not found`);
    const cols = rows[hi].map((h, i) => [i, String(h ?? '').match(/^CPI score (\d{4})$/i)?.[1]]).filter(([, yr]) => yr);
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      // TI codes Kosovo as KSV; the site uses XKX
      const iso = String(r[1] ?? '').toUpperCase().replace(/^KSV$/, 'XKX');
      if (!/^[A-Z]{3}$/.test(iso)) continue;
      for (const [i, yr] of cols) if (typeof r[i] === 'number') out.push({ iso, name: r[0], year: yr, value: r[i] });
    }
    console.log(`  TI CPI: ${href} (${sheet})`);
    return { rows: out, url: href };
  }
  throw new Error('no CPI results workbook found on transparency.org');
}

/** Keep the eight most recent well-covered years, as parse_tidy did. */
function toData(rows, dp, region) {
  const counts = new Map();
  for (const r of rows) counts.set(r.year, (counts.get(r.year) ?? 0) + 1);
  const keep = pickPeriodsN(counts, 8);
  const data = rows
    .filter((r) => keep.includes(r.year))
    .map((r) => ({ entity: nameOf(r.iso, r.name), group: region(r.iso), period: r.year, value: round(r.value, dp), iso: r.iso }))
    .sort((a, b) => a.iso.localeCompare(b.iso) || a.period.localeCompare(b.period));
  return { data, keep };
}

const WB_SERIES = [
  { slug: 'qog-wbgi-cce', code: 'GOV_WGI_CC.EST', source: 3, dp: 2, title: 'Control of Corruption', unit: 'estimate (−2.5 to +2.5)', mode: 'pp',
    what: 'perceptions of the extent to which public power is exercised for private gain' },
  { slug: 'qog-wbgi-gee', code: 'GOV_WGI_GE.EST', source: 3, dp: 2, title: 'Government Effectiveness', unit: 'estimate (−2.5 to +2.5)', mode: 'pp',
    what: 'perceptions of the quality of public services, the civil service and policy implementation' },
  { slug: 'qog-wbgi-vae', code: 'GOV_WGI_VA.EST', source: 3, dp: 2, title: 'Voice & Accountability', unit: 'estimate (−2.5 to +2.5)', mode: 'pp',
    what: 'perceptions of the extent to which citizens can select their government, and of freedom of expression, association and the media' },
  { slug: 'qog-wdi-chexppgdp', code: 'SH.XPD.CHEX.GD.ZS', dp: 1, title: 'Health Spending', unit: '% of GDP', mode: 'pp',
    what: 'current health expenditure as a share of GDP (WHO Global Health Expenditure Database)' },
  { slug: 'qog-wdi-expedu', code: 'SE.XPD.TOTL.GD.ZS', dp: 1, title: 'Education Spending', unit: '% of GDP', mode: 'pp',
    what: 'government expenditure on education as a share of GDP (UNESCO Institute for Statistics)' },
  { slug: 'qog-wdi-mortinf', code: 'SP.DYN.IMRT.IN', dp: 1, title: 'Infant Mortality', unit: 'per 1k births', mode: 'pct',
    what: 'deaths before age one per 1,000 live births (UN Inter-agency Group for Child Mortality Estimation)' },
];

async function main() {
  console.log('Former QoG series → original producers');
  const countries = await wbCountries();
  const region = (iso) => countries.get(iso) || ISO_REGION_FIX[iso] || 'Other';

  for (const s of WB_SERIES) {
    let rows;
    try { rows = await wbSeries(s.code, s.source, countries); } catch (e) { console.warn(`– ${s.slug}: ${e.message}; skipped.`); process.exitCode = 1; continue; }
    const { data, keep } = toData(rows, s.dp, region);
    const wgi = s.source === 3;
    await writeDataset('survey', s.slug, {
      // "(WB)" as on the other World Bank series (parse_tidy.mjs)
      title: `${s.title} (WB)`,
      summary: `${s.title}: ${s.what}. World Bank, ${wgi ? 'Worldwide Governance Indicators' : 'World Development Indicators'} (${s.code}), ${keep[0]}–${keep.at(-1)}.`,
      unit: s.unit,
      valueLabel: s.title,
      changeMode: s.mode,
      source: wgi ? 'World Bank — Worldwide Governance Indicators' : 'World Bank — World Development Indicators',
      license: 'CC BY 4.0',
      url: wgi ? 'https://www.worldbank.org/en/publication/worldwide-governance-indicators' : `https://data.worldbank.org/indicator/${s.code}`,
      parsedAt: today,
    }, data);
  }

  try {
    const { rows } = await tiCpi();
    const { data, keep } = toData(rows, 1, region);
    await writeDataset('survey', 'qog-ti-cpi', {
      // "(TI)" tells it apart from cpi-corruption-perceptions, the same index via OWID
      title: 'Corruption Perceptions Index (TI)',
      summary: `Corruption Perceptions Index: perceived public-sector corruption, scored 0–100 (100 = very clean). Transparency International, ${keep[0]}–${keep.at(-1)}.`,
      unit: '0–100',
      valueLabel: 'Corruption Perceptions Index',
      changeMode: 'pp',
      // 'Transparency International CPI' is what the licence and source cards
      // match on (src/data/licences.ts, src/data/sources.ts).
      source: 'Transparency International CPI',
      license: 'CC BY 4.0. Source: Transparency International',
      url: 'https://www.transparency.org/en/cpi',
      parsedAt: today,
    }, data);
  } catch (e) {
    console.warn(`– qog-ti-cpi: ${e.message}; skipped.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('✗ parse_qog_originals failed:', err.message);
  process.exit(1);
});
