/**
 * AmericasBarometer 2004–2026 (LAPOP Lab) → country-level attitudes and
 * experiences across the Americas, weighted %, one value per country and wave.
 *
 *   node scripts/parse_lapop.mjs
 *
 * Reads two files written by scripts/tools/lapop_aggregate.py, which documents
 * every answer code used: lapop_2004_2023_by_country.csv from the free Grand
 * Merge (28 countries, ten waves, with gaps: the free file leaves out some
 * country-waves, Uruguay after 2014 among them) and lapop_2026_by_country.csv
 * from the 2025/26 merged file.
 * The merged .dta is obtained as a Free User under LAPOP's Datasets Usage
 * Agreement (no redistribution of the data), so only these aggregates are kept.
 *
 * Checked against LAPOP's own 2026 report, The Pulse of Democracy: support for
 * democracy runs from 50% in Peru to 86% in Uruguay, and feeling unsafe in the
 * neighbourhood is highest in Ecuador (63%) and Peru (60%) and lowest in El
 * Salvador (9%). The same report gives the change in support for democracy
 * since 2023; the two files reproduce it — Colombia +12, Guatemala +10,
 * Nicaragua and Paraguay +9, Honduras +7, Mexico, Peru and Ecuador within a
 * point. The guards below hold the 2026 figures.
 *
 * Cuba is left out: its first-ever sample is an online panel that LAPOP calls
 * not nationally representative and reports only in a separate spotlight.
 * Canada and the United States are also web panels, but LAPOP compares them
 * with the rest, so they stay; items not asked there are simply absent.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';

const RAW = join('data', 'raw', 'lapop');
// Waves that spanned two calendar years are labelled with both.
const PERIOD = { 2016: '2016–2017', 2018: '2018–2019' };
const LATEST = '2025–2026';
const EXCLUDE = new Set(['CUB']);
const PARSED = new Date().toISOString().slice(0, 10);
const META = {
  source: 'AmericasBarometer (LAPOP Lab)',
  license: 'LAPOP Lab, Vanderbilt University — published as country aggregates; the survey data are not redistributed',
  url: 'https://www.vanderbilt.edu/cgd/americasbarometer/',
  vintage: 'AmericasBarometer Grand Merge 2004–2023 (free, v1.0) and 2025/26 merged file (v1.0)',
};
const WEIGHT = 'Weighted by wt, the within-country weight. Share of substantive answers; don\'t know, refused and not asked are left out of the base. A country needs 300 answers to be shown.';

const SERIES = [
  { col: 'support_democracy', slug: 'lapop-support-democracy', topic: 'governance', title: 'Democracy Is the Best Form of Government (AmericasBarometer)',
    valueLabel: 'Agree democracy is better than any other form of government (5–7 on a 1–7 scale, %)',
    summary: 'Share who agree that democracy may have problems but is better than any other form of government.', codes: '5–7 on the 1–7 agreement scale (ING4)' },
  { col: 'satisfied_democracy', slug: 'lapop-satisfaction-democracy', topic: 'governance', title: 'Satisfaction with Democracy (AmericasBarometer)',
    valueLabel: 'Very satisfied or satisfied with how democracy works (%)',
    summary: 'Share very satisfied or satisfied with the way democracy works in their country.', codes: 'answers 1–2 on the 1–4 scale (PN4)' },
  { col: 'trust_elections', slug: 'lapop-trust-elections', topic: 'governance', title: 'Trust in Elections (AmericasBarometer)',
    valueLabel: 'Trust elections (5–7 on a 1–7 scale, %)',
    summary: 'Share who trust elections in their country.', codes: '5–7 on the 1–7 trust scale (B47A)' },
  { col: 'trust_police', slug: 'lapop-trust-police', topic: 'safety', title: 'Trust in the Police (AmericasBarometer)',
    valueLabel: 'Trust the national police (5–7 on a 1–7 scale, %)',
    summary: 'Share who trust the national police.', codes: '5–7 on the 1–7 trust scale (B18)' },
  { col: 'trust_congress', slug: 'lapop-trust-congress', topic: 'governance', title: 'Trust in Congress (AmericasBarometer)',
    valueLabel: 'Trust the national legislature (5–7 on a 1–7 scale, %)',
    summary: 'Share who trust the national legislature.', codes: '5–7 on the 1–7 trust scale (B13)' },
  { col: 'trust_people', slug: 'lapop-interpersonal-trust', topic: 'attitudes', title: 'People in the Neighbourhood Are Trustworthy (AmericasBarometer)',
    valueLabel: 'Say people in their community are very or somewhat trustworthy (%)',
    summary: 'Share who say people in their community are very or somewhat trustworthy.', codes: 'answers 1–2 on the 1–4 scale (IT1)' },
  { col: 'feel_unsafe', slug: 'lapop-feel-unsafe', topic: 'safety', title: 'Feel Unsafe in the Neighbourhood (AmericasBarometer)',
    valueLabel: 'Feel somewhat or very unsafe in their neighbourhood (%)',
    summary: 'Share who feel somewhat or very unsafe in their neighbourhood from the threat of assault or robbery.', codes: 'answers 3–4 on the 1–4 scale (AOJ11)',
    check: { ECU: [61, 65], PER: [58, 62], SLV: [7, 11] } },
  { col: 'police_bribe', slug: 'lapop-police-bribe', topic: 'governance', title: 'Asked for a Bribe by the Police (AmericasBarometer)',
    valueLabel: 'A police officer asked them for a bribe in the past 12 months (%)',
    summary: 'Share who say a police officer asked them for a bribe in the past twelve months.', codes: 'answer yes (EXC2)' },
  { col: 'politicians_corrupt', slug: 'lapop-politicians-corrupt', topic: 'governance', title: 'Most Politicians Are Corrupt (AmericasBarometer)',
    valueLabel: 'Think more than half or all politicians are involved in corruption (%)',
    summary: 'Share who think more than half, or all, of the country\'s politicians are involved in corruption.', codes: 'answers 4–5 on the 1–5 scale (EXC7NEW)' },
  { col: 'remittances', slug: 'lapop-remittances', topic: 'economy', title: 'Households Receiving Remittances (AmericasBarometer)',
    valueLabel: 'Household receives money from abroad (%)',
    summary: 'Share who say they or someone in their household receives remittances — money sent from abroad.', codes: 'answer yes (Q10A)' },
  { col: 'home_broadband', slug: 'lapop-home-broadband', topic: 'connectivity', title: 'Broadband Internet at Home (AmericasBarometer)',
    valueLabel: 'Have a broadband internet service at home (%)',
    summary: 'Share with a broadband internet service at home; internet only by phone does not count.', codes: 'answer yes (R18N)' },
];
SERIES[0].check = { PER: [48, 52], URY: [84, 88] };

async function main() {
  const geo = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) geo.set(a3, { name: r.name, region: REGION_4[r.world_4region] || 'Americas' });
  }
  const rows = [];
  for (const r of parseCsvObjects(await readFile(join(RAW, 'lapop_2004_2023_by_country.csv'), 'utf8')))
    rows.push({ ...r, period: PERIOD[r.wave] ?? r.wave });
  for (const r of parseCsvObjects(await readFile(join(RAW, 'lapop_2026_by_country.csv'), 'utf8')))
    rows.push({ ...r, period: LATEST });
  const kept = rows.filter((r) => !EXCLUDE.has(r.iso3));
  let written = 0;
  for (const s of SERIES) {
    const data = [];
    for (const r of kept) {
      if (r[s.col] === '') continue;
      const g = geo.get(r.iso3);
      if (!g) { console.warn(`  – ${s.slug}: no geography for ${r.iso3}; skipped`); continue; }
      data.push({ entity: g.name, group: g.region, period: r.period, value: round(Number(r[s.col]), 1), iso: r.iso3, year: r.year });
    }
    // A first write has nothing for writeDataset to compare against; these
    // fail on a wrong answer code or a reversed scale.
    const latest = data.filter((d) => d.period === LATEST);
    if (latest.length < 15) throw new Error(`${s.slug}: only ${latest.length} countries in ${LATEST}`);
    if (data.some((d) => !(d.value >= 0 && d.value <= 100))) throw new Error(`${s.slug}: share outside 0–100`);
    for (const [iso, [lo, hi]] of Object.entries(s.check || {})) {
      const d = latest.find((x) => x.iso === iso);
      if (!d || d.value < lo || d.value > hi) throw new Error(`${s.slug}: ${iso} = ${d?.value} outside LAPOP's published ${lo}–${hi}`);
    }
    await writeDataset('surveys', s.slug, {
      ...META, kind: 'surveys', title: s.title, unit: '%', changeMode: 'pp', valueLabel: s.valueLabel, topic: s.topic,
      summary: `${s.summary} AmericasBarometer, 2004–2026.`,
      method: `${WEIGHT} Counted as yes: ${s.codes}.`, parsedAt: PARSED,
    }, data);
    written++;
  }
  console.log(`✓ AmericasBarometer: ${written} datasets, ${new Set(kept.map((r) => r.iso3)).size} countries, ${kept.length} country-waves`);
}
main().catch((e) => { console.error('✗ parse_lapop failed:', e.message); process.exit(1); });
