/**
 * AmericasBarometer 2025/26 (LAPOP Lab) → country-level attitudes and
 * experiences across the Americas, weighted %.
 *
 *   node scripts/parse_lapop.mjs
 *
 * Reads data/raw/lapop/lapop_2026_by_country.csv, written once per wave by
 * scripts/tools/lapop_aggregate.py, which documents every answer code used.
 * The merged .dta is obtained as a Free User under LAPOP's Datasets Usage
 * Agreement (no redistribution of the data), so only these aggregates are kept.
 *
 * Checked against LAPOP's own 2026 report, The Pulse of Democracy: support for
 * democracy runs from 50% in Peru to 86% in Uruguay, and feeling unsafe in the
 * neighbourhood is highest in Ecuador (63%) and Peru (60%) and lowest in El
 * Salvador (9%). The guards below hold those figures.
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

const CSV = join('data', 'raw', 'lapop', 'lapop_2026_by_country.csv');
const EXCLUDE = new Set(['CUB']);
const PARSED = new Date().toISOString().slice(0, 10);
const META = {
  source: 'AmericasBarometer (LAPOP Lab)',
  license: 'LAPOP Lab, Vanderbilt University — published as country aggregates; the survey data are not redistributed',
  url: 'https://www.vanderbilt.edu/cgd/americasbarometer/',
  vintage: 'AmericasBarometer 2025/26, merged file v1.0',
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
  { col: 'home_broadband', slug: 'lapop-home-internet', topic: 'connectivity', title: 'Internet at Home (AmericasBarometer)',
    valueLabel: 'Have an internet connection at home (%)',
    summary: 'Share with an internet connection at home.', codes: 'answer yes (R18N)' },
];
SERIES[0].check = { PER: [48, 52], URY: [84, 88] };

async function main() {
  const geo = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) geo.set(a3, { name: r.name, region: REGION_4[r.world_4region] || 'Americas' });
  }
  const rows = [...parseCsvObjects(await readFile(CSV, 'utf8'))].filter((r) => !EXCLUDE.has(r.iso3));
  let written = 0;
  for (const s of SERIES) {
    const data = [];
    for (const r of rows) {
      if (r[s.col] === '') continue;
      const g = geo.get(r.iso3);
      if (!g) { console.warn(`  – ${s.slug}: no geography for ${r.iso3}; skipped`); continue; }
      data.push({ entity: g.name, group: g.region, period: '2025–2026', value: round(Number(r[s.col]), 1), iso: r.iso3, year: r.year });
    }
    // A first write has nothing for writeDataset to compare against; these
    // fail on a wrong answer code or a reversed scale.
    if (data.length < 15) throw new Error(`${s.slug}: only ${data.length} countries`);
    if (data.some((d) => !(d.value >= 0 && d.value <= 100))) throw new Error(`${s.slug}: share outside 0–100`);
    for (const [iso, [lo, hi]] of Object.entries(s.check || {})) {
      const d = data.find((x) => x.iso === iso);
      if (!d || d.value < lo || d.value > hi) throw new Error(`${s.slug}: ${iso} = ${d?.value} outside LAPOP's published ${lo}–${hi}`);
    }
    await writeDataset('surveys', s.slug, {
      ...META, kind: 'surveys', title: s.title, unit: '%', changeMode: 'pp', valueLabel: s.valueLabel, topic: s.topic,
      summary: `${s.summary} AmericasBarometer 2025/26, fieldwork 2025–2026.`,
      method: `${WEIGHT} Counted as yes: ${s.codes}.`, parsedAt: PARSED,
    }, data);
    written++;
  }
  console.log(`✓ AmericasBarometer: ${written} datasets, ${rows.length} countries`);
}
main().catch((e) => { console.error('✗ parse_lapop failed:', e.message); process.exit(1); });
