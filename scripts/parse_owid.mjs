/**
 * Our World in Data enrichment — fetch tidy grapher CSVs (entity,code,year,value)
 * for indicators not already in BullDozer, and emit datasets.
 *   node scripts/parse_owid.mjs
 * Live fetch from ourworldindata.org (CC BY 4.0), reproducible.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects, parseCsvRows } from './lib/csv.mjs';
import { gapminderRows, REGION_4, pickPeriodsN, writeDataset, round } from './lib/datasets.mjs';

const GAP = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey', 'Gapminder', 'ddf--entities--geo--country.csv');
const REF_YEAR = new Date().getFullYear();

const INDICATORS = [
  { grapher: 'mean-years-of-schooling-long-run', slug: 'owid-schooling', title: 'Mean Years of Schooling', unit: 'years', topic: 'education', mode: 'pp', dp: 1, summary: 'Average years of formal education among adults.' },
  { grapher: 'share-of-the-population-with-access-to-electricity', slug: 'owid-electricity', title: 'Access to Electricity', unit: '%', topic: 'connectivity', mode: 'pp', dp: 1, summary: 'Share of the population with access to electricity.' },
  { grapher: 'share-of-population-in-extreme-poverty', slug: 'owid-extreme-poverty', title: 'Extreme Poverty', unit: '%', topic: 'economy', mode: 'pp', dp: 1, latest: true,
    summary: 'Share of the population living below the international poverty line ($3 a day, 2021 prices), from national household surveys. Each country’s latest survey, so years differ.' },
  { grapher: 'share-electricity-renewables', slug: 'owid-renewables', title: 'Renewable Electricity', unit: '%', topic: 'environment', mode: 'pp', dp: 1, summary: 'Share of electricity generated from renewable sources.' },
  { grapher: 'military-expenditure-as-a-share-of-gdp', slug: 'owid-military', title: 'Military Spending', unit: '% of GDP', topic: 'governance', mode: 'pp', dp: 2, summary: 'Military expenditure as a share of GDP.' },
  // The grapher publishes a share of children, not a rate per 1,000: Nigeria
  // 11.6 means 11.6% (116 per 1,000). Labelled "per 1,000" it read ten times lower.
  { grapher: 'child-mortality-igme', slug: 'owid-child-mortality', title: 'Child Mortality (under-5)', unit: '%', topic: 'health', mode: 'pp', dp: 1, summary: 'Share of children who die before their fifth birthday (UN IGME estimates).' },
  { grapher: 'prevalence-of-undernourishment', slug: 'owid-undernourishment', title: 'Undernourishment', unit: '%', topic: 'health', mode: 'pp', dp: 1, summary: 'Share of the population whose food intake is insufficient.' },
  { grapher: 'income-share-top-10-before-tax-wid', slug: 'owid-income-top10', title: 'Income Share of Top 10%', unit: '% of income', topic: 'economy', mode: 'pp', dp: 1, summary: 'Share of pre-tax national income received by the richest 10% (World Inequality Database).' },
  { grapher: 'income-share-top-1-before-tax-wid', slug: 'owid-income-top1', title: 'Income Share of Top 1%', unit: '% of income', topic: 'economy', mode: 'pp', dp: 1, summary: 'Share of pre-tax national income received by the richest 1% (World Inequality Database).' },
  { grapher: 'gender-inequality-index-from-the-human-development-report', slug: 'owid-gender-inequality', title: 'Gender Inequality Index', unit: 'index 0–1', topic: 'demographics', mode: 'pp', dp: 3, summary: 'UNDP Gender Inequality Index across reproductive health, empowerment and the labour market (0 = equality, 1 = maximum inequality).' },
];

async function iso3Region() {
  const m = new Map();
  try {
    for (const r of await gapminderRows()) {
      const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
      if (a3) m.set(a3, REGION_4[r.world_4region] || 'Other');
    }
  } catch {}
  return m;
}

async function fetchCsv(grapher) {
  const res = await fetch(`https://ourworldindata.org/grapher/${grapher}.csv?csvType=full&useColumnShortNames=true`);
  if (!res.ok) throw new Error(`${res.status} ${grapher}`);
  return res.text();
}

async function main() {
  console.log('OWID enrichment →');
  const region = await iso3Region();
  for (const cfg of INDICATORS) {
    let text;
    try { text = await fetchCsv(cfg.grapher); } catch (e) { console.warn(`– ${cfg.slug}: fetch failed (${e.message})`); continue; }
    const header = parseCsvRows(text.slice(0, text.indexOf('\n')))[0];
    // Graphers now carry helper columns (population_historical, owid_region)
    // after the value; the value is the first column that is none of these.
    const valueKey = header.find((h) => !['entity', 'code', 'year', 'Entity', 'Code', 'Year', 'population_historical', 'owid_region'].includes(h));

    const byIso = new Map(); const yearCounts = new Map();
    for (const r of parseCsvObjects(text)) {
      const iso = (r.code || r.Code || '').toUpperCase();
      if (!/^[A-Z]{3}$/.test(iso)) continue; // valid country ISO3 only
      // A blank cell is a year with no estimate, not zero: Number('') is 0, and
      // that put 183 countries at 0% extreme poverty (caught 10 Nov 2026).
      const raw = (r[valueKey] ?? '').trim();
      if (raw === '') continue;
      const v = Number(raw); const y = r.year || r.Year;
      if (Number.isNaN(v) || !y) continue;
      let rec = byIso.get(iso); if (!rec) byIso.set(iso, rec = { name: r.entity || r.Entity, byYear: {} });
      rec.byYear[y] = v;
      yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1);
    }
    // Survey-based series: every year since 2010 is kept, and pages show each
    // country's latest survey (latestPerCountry) rather than a common year.
    const periods = cfg.latest ? [...yearCounts.keys()].filter((y) => +y >= 2010 && +y <= REF_YEAR).sort() : pickPeriodsN(yearCounts, 8, REF_YEAR);
    if (!periods.length) { console.log(`  – ${cfg.slug}: no usable years`); continue; }
    const data = [];
    for (const [iso, rec] of byIso) for (const p of periods) {
      if (rec.byYear[p] == null) continue;
      data.push({ entity: rec.name, group: region.get(iso) || 'Other', period: p, value: round(rec.byYear[p], cfg.dp), iso });
    }
    await writeDataset('macro', cfg.slug, {
      title: cfg.title, summary: `${cfg.summary} Our World in Data, ${periods[0]}–${periods.at(-1)}.`,
      ...(cfg.latest ? { latestPerCountry: true } : {}),
      unit: cfg.unit, valueLabel: cfg.title, changeMode: cfg.mode, topic: cfg.topic,
      source: 'Our World in Data', license: 'CC BY 4.0',
      url: `https://ourworldindata.org/grapher/${cfg.grapher}`, parsedAt: new Date().toISOString().slice(0, 10),
    }, data, { carryForward: false }); // full refetch each run; carrying would keep the old zeros
  }
}
main().catch((e) => { console.error('✗ parse_owid failed:', e.message); process.exit(1); });
