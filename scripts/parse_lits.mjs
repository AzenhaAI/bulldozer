/**
 * EBRD Life in Transition Survey, waves I–IV (2006, 2010, 2016, 2023) —
 * country-level mean scores for a set of attitude questions.
 *
 *   node scripts/parse_lits.mjs
 *
 * Reads data/raw/lits/lits_by_country_wave.csv, written once per release by
 * scripts/tools/lits_aggregate.py from the EBRD's free Stata files. Its rule
 * reproduces the LiTS IV means first published here from the EBRD visualiser,
 * every country to two decimals; which waves asked each item is in the
 * aggregator's docstring and each dataset's summary. Wave IV ran in 2022–23
 * and keeps its earlier label, 2023.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';
import countryNames from '../src/data/country-names.json' with { type: 'json' };

const CSV = join('data', 'raw', 'lits', 'lits_by_country_wave.csv');

// Every spelling the four waves use, lower-cased.
const ISO = {
  albania: 'ALB', algeria: 'DZA', armenia: 'ARM', azerbaijan: 'AZE', belarus: 'BLR',
  bih: 'BIH', bosnia: 'BIH', 'bosnia and herz.': 'BIH', 'bosnia and herzegovina': 'BIH',
  bulgaria: 'BGR', croatia: 'HRV', cyprus: 'CYP', czech: 'CZE', 'czech rep.': 'CZE', czechia: 'CZE', czechrep: 'CZE',
  estonia: 'EST', 'fyr macedonia': 'MKD', fyrom: 'MKD', 'north macedonia': 'MKD', france: 'FRA', georgia: 'GEO',
  germany: 'DEU', greece: 'GRC', hungary: 'HUN', italy: 'ITA', jordan: 'JOR', kazakhstan: 'KAZ', kosovo: 'XKX',
  'kyrgyz rep.': 'KGZ', 'kyrgyz republic': 'KGZ', kyrgyzstan: 'KGZ', latvia: 'LVA', lebanon: 'LBN', lithuania: 'LTU',
  moldova: 'MDA', mongolia: 'MNG', montenegro: 'MNE', morocco: 'MAR', poland: 'POL', romania: 'ROU', russia: 'RUS',
  serbia: 'SRB', 'slovak rep.': 'SVK', 'slovak republic': 'SVK', slovakia: 'SVK', slovenia: 'SVN', sweden: 'SWE',
  tajikistan: 'TJK', tunisia: 'TUN', turkey: 'TUR', 'türkiye': 'TUR', uk: 'GBR', ukraine: 'UKR', uzbekistan: 'UZB',
  'west bank & gaza': 'PSE',
};

const QUESTIONS = [
  { col: 'trust', slug: 'lits-trust', title: 'Generalised Trust', unit: 'mean 1–5', valueLabel: 'Most people can be trusted',
    summary: 'Mean agreement that most people can be trusted (generalised social trust), 1 = complete distrust, 5 = complete trust. LiTS I–IV, 2006–2023.' },
  { col: 'risk_tolerance', slug: 'lits-risk-tolerance', title: 'Risk Tolerance', unit: 'mean 1–10', valueLabel: 'Willingness to take risks',
    summary: 'Self-rated willingness to take risks in general (1 = none, 10 = very much). LiTS II–IV, 2010–2023.' },
  { col: 'state_ownership', slug: 'lits-state-ownership', title: 'Preference for State Ownership', unit: 'mean 1–10', valueLabel: 'Private (1) ↔ state (10)',
    summary: 'Views on ownership of business and industry (1 = private should increase, 10 = government should increase). LiTS III–IV, 2016–2023.' },
  { col: 'self_health', slug: 'lits-self-health', title: 'Self-assessed Health', unit: 'mean 1–5', valueLabel: 'How would you assess your health',
    summary: 'Mean self-assessment of own health (1 = very good, 5 = very bad). LiTS I–IV, 2006–2023.' },
  { col: 'religion', slug: 'lits-religion', title: 'Importance of Religion', unit: 'mean 1–5', valueLabel: 'Importance of religion in life',
    summary: 'Mean rated importance of religion in one’s life. LiTS IV, 2023 (not asked on this scale before).' },
];

async function main() {
  const rows = [...parseCsvObjects(await readFile(CSV, 'utf8'))]; // committed: missing is a real failure
  const region = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) region.set(a3, REGION_4[r.world_4region] || 'Europe & Central Asia');
  }
  const unknown = new Set();
  for (const q of QUESTIONS) {
    const data = [];
    for (const r of rows) {
      if (r[q.col] === '' || r[q.col] === undefined) continue;
      const iso = ISO[r.country.toLowerCase()];
      if (!iso) { unknown.add(r.country); continue; }
      data.push({ entity: countryNames[iso]?.common || r.country, group: region.get(iso) || 'Europe & Central Asia',
        period: r.wave, value: round(Number(r[q.col]), 2), iso,
        ...(r[q.col + '_moe'] ? { moe: round(Number(r[q.col + '_moe']), 2) } : {}) }); // 95% margin, scripts/tools/moe.py
    }
    await writeDataset('survey', q.slug, {
      title: q.title, summary: q.summary, unit: q.unit, valueLabel: q.valueLabel, changeMode: 'pp',
      method: 'Weighted country mean of the answer scale; don’t know, difficult to say and refused left out.',
      source: 'EBRD — Life in Transition Survey', license: 'EBRD terms — public aggregates',
      url: 'https://www.ebrd.com/home/what-we-do/office-of-the-chief-economist/lits/life-in-transition-survey-data.html',
      parsedAt: new Date().toISOString().slice(0, 10),
    }, data);
  }
  if (unknown.size) console.warn(`  – LiTS: no ISO for ${[...unknown].join(', ')}`);
}

main().catch((err) => { console.error('✗ parse_lits failed:', err.message); process.exit(1); });
