/**
 * ISSP 2019–2023 and Standard Eurobarometer (autumn 2025, spring 2026) →
 * country series, from aggregates computed by hand.
 *
 *   node scripts/parse_gesis_aggregates.mjs
 *
 * GESIS's terms of use forbid processing their data with AI tools, so the
 * survey files are never read here or by any AI tool. The owner runs
 * scripts/tools/gesis_aggregate.py, written from the files' variable lists,
 * and it leaves only country shares in data/raw/issp/ and
 * data/raw/eurobarometer/. This parser reads those.
 *
 * Checks: Eurobarometer matches the Commission's Malta national report for
 * autumn 2025 (life satisfaction 92% vs 91.9, trust in the EU 57% vs 57.6).
 * ISSP publishes no country tables to compare with; the guards below only
 * catch an inverted scale.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';

const PARSED = new Date().toISOString().slice(0, 10);
const GESIS = 'GESIS terms of use (04.02.2026). Aggregates computed by the data user; the survey data are not redistributed.';

const ISSP_META = {
  source: 'ISSP (International Social Survey Programme)',
  license: GESIS,
  url: 'https://www.gesis.org/en/issp/home',
  vintage: 'ISSP Research Group, modules 2019 (ZA7600 v3.0.0), 2020 (ZA7650 v2.0.0), 2021 (ZA8000 v2.0.0), 2022 (ZA10000 v2.0.0), 2023 (ZA10010 v1.0.0); GESIS, Cologne',
};
const EB_META = {
  source: 'Eurobarometer (European Commission)',
  license: GESIS,
  url: 'https://europa.eu/eurobarometer/',
  vintage: 'Standard Eurobarometer 104.1 (ZA9130 v1.0.0, autumn 2025) and 105.2 (ZA9144 v1.0.0, spring 2026); GESIS, Cologne',
};
const ISSP_BASE = 'Weighted (WEIGHT 2019–2020, WEIGHT_COM 2021–2023). No answer, can\'t choose and not applicable are left out of the base; a country needs 300 answers.';
const EB_BASE = 'Weighted by w1. As in the Commission\'s own reports, "don\'t know" is part of the base; the Turkish Cypriot community sample is left out. A country needs 300 answers.';

const I = (col, year, slug, topic, title, valueLabel, summary, check) => ({ kind: 'issp', col, year, slug, topic, title, valueLabel, summary, check });
const E = (col, slug, topic, title, valueLabel, summary, check) => ({ kind: 'eb', col, slug, topic, title, valueLabel, summary, check });
const SERIES = [
  I('income_gaps_too_large', '2019', 'issp-income-gaps-too-large', 'economy', 'Income Differences Too Large (ISSP)', 'Agree income differences in their country are too large (%)', 'Share who agree or strongly agree that differences in income in their country are too large. ISSP 2019, Social Inequality.'),
  I('govt_should_reduce_gaps', '2019', 'issp-government-reduce-income-gaps', 'governance', 'Government Should Reduce Income Gaps (ISSP)', 'Agree it is the government\'s job to reduce income differences (%)', 'Share who agree it is the government\'s responsibility to reduce differences between high and low incomes. ISSP 2019, Social Inequality.'),
  I('rich_poor_conflict_strong', '2019', 'issp-rich-poor-conflict', 'attitudes', 'Strong Conflict Between Rich and Poor (ISSP)', 'See strong or very strong conflicts between rich and poor (%)', 'Share who see strong or very strong conflicts between poor and rich people in their country. ISSP 2019, Social Inequality.', { DK: [5, 25] }),
  I('env_concerned', '2020', 'issp-environment-concern', 'environment', 'Concerned About the Environment (ISSP)', 'Concerned about environmental issues (4–5 on a 1–5 scale, %)', 'Share concerned about environmental issues (4 or 5 on a scale from 1, not at all, to 5, very). ISSP 2020, Environment.'),
  I('climate_mostly_human', '2020', 'issp-climate-mostly-human', 'environment', 'Climate Change Mostly Caused by People (ISSP)', 'Say the climate has been changing mostly due to human activity (%)', 'Share who say the world\'s climate has been changing mostly due to human activity (rather than natural processes, both equally, or not changing). ISSP 2020, Environment.'),
  I('pay_higher_prices_env', '2020', 'issp-pay-more-for-environment', 'environment', 'Willing to Pay More to Protect the Environment (ISSP)', 'Very or fairly willing to pay much higher prices to protect the environment (%)', 'Share very or fairly willing to pay much higher prices in order to protect the environment. ISSP 2020, Environment.'),
  I('warming_dangerous', '2020', 'issp-warming-dangerous', 'environment', 'Rising Temperatures Seen as Dangerous (ISSP)', 'Call a rise in the world\'s temperature extremely or very dangerous (%)', 'Share who say a rise in the world\'s temperature caused by climate change is extremely or very dangerous for the environment. ISSP 2020, Environment.'),
  I('health_system_confidence', '2021', 'issp-health-system-confidence', 'health', 'Confidence in the Health System (ISSP)', 'Complete or a great deal of confidence in the health care system (%)', 'Share with complete or a great deal of confidence in their country\'s health care system. ISSP 2021, Health and Health Care.', { NO: [70, 95] }),
  I('doctors_trusted', '2021', 'issp-doctors-trusted', 'health', 'Doctors Can Be Trusted (ISSP)', 'Agree that doctors can be trusted (%)', 'Share who agree or strongly agree that, all things considered, doctors in their country can be trusted. ISSP 2021, Health and Health Care.'),
  I('vaccines_more_harm', '2021', 'issp-vaccines-more-harm', 'health', 'Vaccines Seen as Doing More Harm Than Good (ISSP)', 'Agree vaccinations do more harm than good (%)', 'Share who agree or strongly agree that, overall, vaccinations do more harm than good. ISSP 2021, Health and Health Care.', { NO: [0, 10] }),
  I('health_system_satisfied', '2021', 'issp-health-system-satisfaction', 'health', 'Satisfaction with the Health System (ISSP)', 'Completely, very or fairly satisfied with the health care system (%)', 'Share completely, very or fairly satisfied with the health care system in their country. ISSP 2021, Health and Health Care.'),
  I('men_earn_women_home', '2022', 'issp-men-earn-women-home', 'attitudes', '"Men Earn, Women Keep House" (ISSP)', 'Agree a man\'s job is to earn money and a woman\'s to look after the home (%)', 'Share who agree or strongly agree that a man\'s job is to earn money and a woman\'s job is to look after the home and family. ISSP 2022, Family and Changing Gender Roles.', { SE: [0, 15] }),
  I('cohabitation_ok', '2022', 'issp-cohabitation-ok', 'attitudes', 'Living Together Unmarried Is All Right (ISSP)', 'Agree it is all right for a couple to live together without intending to marry (%)', 'Share who agree it is all right for a couple to live together without intending to get married. ISSP 2022, Family and Changing Gender Roles.'),
  I('same_sex_couple_parents', '2022', 'issp-same-sex-parents', 'attitudes', 'Same-Sex Couples Can Raise a Child as Well (ISSP)', 'Agree a female same-sex couple can bring up a child as well as a man and a woman (%)', 'Share who agree that a female same-sex couple can bring up a child as well as a male-female couple. ISSP 2022, Family and Changing Gender Roles.'),
  I('country_better_than_most', '2023', 'issp-country-better-than-most', 'attitudes', 'Country Better Than Most Others (ISSP)', 'Agree their country is better than most other countries (%)', 'Share who agree that, generally speaking, their country is a better country than most other countries. ISSP 2023, National Identity.'),
  I('immigrants_raise_crime', '2023', 'issp-immigrants-raise-crime', 'attitudes', 'Immigrants Increase Crime (ISSP)', 'Agree immigrants increase crime rates (%)', 'Share who agree or strongly agree that immigrants increase crime rates. ISSP 2023, National Identity.'),
  I('immigrants_good_economy', '2023', 'issp-immigrants-good-for-economy', 'economy', 'Immigrants Good for the Economy (ISSP)', 'Agree immigrants are generally good for the economy (%)', 'Share who agree or strongly agree that immigrants are generally good for their country\'s economy. ISSP 2023, National Identity.'),
  I('reduce_immigration', '2023', 'issp-reduce-immigration', 'attitudes', 'Immigration Should Be Reduced (ISSP)', 'Say the number of immigrants should be reduced (%)', 'Share who say the number of immigrants to their country should be reduced a little or a lot. ISSP 2023, National Identity.'),
  E('country_right_direction', 'eb-country-right-direction', 'governance', 'Country Going in the Right Direction (Eurobarometer)', 'Say things in their country are going in the right direction (%)', 'Share who say things in their country are going in the right direction.'),
  E('trust_eu', 'eb-trust-eu', 'governance', 'Trust in the European Union (Eurobarometer)', 'Tend to trust the European Union (%)', 'Share who tend to trust the European Union.', { MT: [56, 59] }),
  E('trust_national_govt', 'eb-trust-government', 'governance', 'Trust in the National Government (Eurobarometer)', 'Tend to trust the national government (%)', 'Share who tend to trust their national government.'),
  E('trust_police', 'eb-trust-police', 'safety', 'Trust in the Police (Eurobarometer)', 'Tend to trust the police (%)', 'Share who tend to trust the police.'),
  E('trust_media', 'eb-trust-media', 'media', 'Trust in the Media (Eurobarometer)', 'Tend to trust the media (%)', 'Share who tend to trust the media; asked in spring 2026.'),
  E('trust_scientists', 'eb-trust-scientists', 'education', 'Trust in Scientists (Eurobarometer)', 'Tend to trust scientists (%)', 'Share who tend to trust scientists; asked in spring 2026.'),
];
const EB_WAVES = [['2025-autumn', '2025 autumn'], ['2026-spring', '2026 spring']];

async function main() {
  const geo = new Map();
  for (const r of await gapminderRows()) {
    const a2 = (r.iso3166_1_alpha2 || '').toUpperCase(), a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a2 && a3) geo.set(a2, { iso: a3, name: r.name, region: REGION_4[r.world_4region] || 'Other' });
  }
  geo.set('GB', geo.get('GB') ?? geo.get('UK'));
  const read = async (p) => [...parseCsvObjects(await readFile(p, 'utf8'))];
  for (const s of SERIES) {
    const rows = [];
    if (s.kind === 'issp') {
      for (const r of await read(join('data', 'raw', 'issp', `issp_${s.year}_by_country.csv`))) rows.push({ ...r, period: s.year });
    } else {
      for (const [file, label] of EB_WAVES)
        for (const r of await read(join('data', 'raw', 'eurobarometer', `eb_${file}_by_country.csv`))) if (s.col in r) rows.push({ ...r, period: label });
    }
    const data = [];
    for (const r of rows) {
      if (!r[s.col]) continue;
      const g = geo.get(r.iso2);
      if (!g) { console.warn(`  – ${s.slug}: no geography for ${r.iso2}; skipped`); continue; }
      data.push({ entity: g.name, group: g.region, period: r.period, value: round(Number(r[s.col]), 1), iso: g.iso });
    }
    if (data.length < 15) throw new Error(`${s.slug}: only ${data.length} rows`);
    for (const [iso2, [lo, hi]] of Object.entries(s.check || {})) {
      const iso = geo.get(iso2)?.iso;
      const latest = [...new Set(data.map((d) => d.period))].sort().at(-1);
      const d = data.find((x) => x.iso === iso && x.period === (s.kind === 'eb' && iso2 === 'MT' ? '2025 autumn' : latest));
      if (!d || d.value < lo || d.value > hi) throw new Error(`${s.slug}: ${iso2} = ${d?.value}, expected ${lo}–${hi}`);
    }
    const meta = s.kind === 'issp' ? ISSP_META : EB_META;
    await writeDataset('surveys', s.slug, {
      ...meta, kind: 'surveys', title: s.title, unit: '%', changeMode: 'pp', valueLabel: s.valueLabel, topic: s.topic,
      summary: s.kind === 'eb' ? `${s.summary} Standard Eurobarometer, autumn 2025 and spring 2026.` : s.summary,
      method: s.kind === 'issp' ? ISSP_BASE : EB_BASE, parsedAt: PARSED,
    }, data);
  }
  console.log(`✓ GESIS aggregates: ${SERIES.length} datasets`);
}
main().catch((e) => { console.error('✗ parse_gesis_aggregates failed:', e.message); process.exit(1); });
