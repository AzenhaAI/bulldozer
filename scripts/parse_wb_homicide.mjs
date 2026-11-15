/**
 * Homicide rate (slug gapminder-homicide) from the World Bank API, series
 * VC.IHR.PSRC.P5 — UNODC's recorded intentional homicides per 100,000 people.
 *
 *   node scripts/parse_wb_homicide.mjs
 *
 * Why not Gapminder: the slug used to be filled from Gapminder's
 * murder_per_100000_people, a modelled series that disagreed with UNODC on
 * 757 of 918 country-years (El Salvador 2022: 54.1 there, 7.9 at UNODC) —
 * review, 15 Nov 2026. parse_surveys.mjs no longer writes this slug.
 *
 * Reads only the public API and repo files: country names from
 * src/data/country-names.json, regions from the bundled Gapminder geo snapshot
 * (scripts/lib/gapminder_geo.json), the same four-region taxonomy the slug has
 * always used. Real ISO-3 countries only (iso-alpha2.json), so WB aggregates
 * and the Channel Islands (CHI) are dropped.
 */
import { readFile } from 'node:fs/promises';
import { REGION_4, pickPeriodsN, writeDataset, round } from './lib/datasets.mjs';

const SLUG = 'gapminder-homicide';
const CODE = 'VC.IHR.PSRC.P5';
const API = `https://api.worldbank.org/v2/country/all/indicator/${CODE}?format=json&per_page=20000&date=2000:2025`;
const YEARS = 10; // last ten years with decent coverage, as the other WB series
const DP = 1;

const json = async (rel) => JSON.parse(await readFile(new URL(rel, import.meta.url), 'utf8'));

async function main() {
  const alpha = await json('../src/data/iso-alpha2.json');
  const names = await json('../src/data/country-names.json');
  const region = new Map();
  for (const r of await json('./lib/gapminder_geo.json')) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) region.set(a3, REGION_4[r.world_4region] || 'Other');
  }
  region.set('XKX', 'Europe'); // Kosovo is not in the Gapminder snapshot

  const res = await fetch(API);
  const j = await res.json();
  if (!Array.isArray(j) || !j[1]?.length) throw new Error(`WB ${CODE}: empty response`);

  const byIso = new Map(); // iso -> { name, years: {year: value} }
  const counts = new Map(); // year -> country count
  for (const r of j[1]) {
    const iso = (r.countryiso3code || '').toUpperCase();
    if (r.value == null || !(iso in alpha)) continue;
    let rec = byIso.get(iso);
    if (!rec) byIso.set(iso, (rec = { name: names[iso]?.common || r.country?.value || iso, years: {} }));
    rec.years[r.date] = r.value;
    counts.set(r.date, (counts.get(r.date) ?? 0) + 1);
  }
  const keep = pickPeriodsN(counts, YEARS, new Date().getFullYear());

  const data = [];
  for (const [iso, rec] of byIso) {
    for (const p of keep) {
      if (rec.years[p] == null) continue;
      data.push({ entity: rec.name, group: region.get(iso) || 'Other', period: p, value: round(rec.years[p], DP), iso });
    }
  }
  data.sort((a, b) => a.entity.localeCompare(b.entity) || a.period.localeCompare(b.period));

  await writeDataset('survey', SLUG, {
    title: 'Homicide Rate',
    summary: `Intentional homicides per 100,000 people (UNODC), ${keep[0]}–${keep.at(-1)}. Recorded by police and public-health sources, not modelled; countries report with a lag, so each country is ranked on its latest year.`,
    unit: 'per 100k',
    valueLabel: 'Homicides',
    changeMode: 'pct',
    // UNODC reporting lags by country: the newest year covers ~80 countries,
    // so profiles rank each country's latest reading (see countryIndex.ts).
    latestPerCountry: true,
    source: 'UNODC via World Bank Open Data',
    license: 'CC BY 4.0',
    url: `https://data.worldbank.org/indicator/${CODE}`,
    parsedAt: new Date().toISOString().slice(0, 10),
  }, data, { carryForward: false }); // never carry old modelled rows over
}

main().catch((e) => { console.error('✗ parse_wb_homicide failed:', e.message); process.exit(1); });
