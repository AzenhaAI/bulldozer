/**
 * Pew Research Center Global Attitudes, Spring 2025 → country-level views,
 * weighted %, 24 countries.
 *
 *   node scripts/parse_pew.mjs
 *
 * Reads data/raw/pew/pew_ga2025_by_country.csv, written by
 * scripts/tools/pew_aggregate.py, which documents every answer code. The
 * survey file is downloaded from pewresearch.org with an account; only these
 * country aggregates are kept, credited to Pew.
 *
 * Pew's convention, not ours elsewhere: "don't know" and refused stay in the
 * base, as in Pew's own tables. With that, every one of the 18 series matched
 * Pew's published topline to the point in every country (checked 2026-10-11,
 * 16 questions × up to 24 countries, zero differences). The guards below hold
 * a few of those published figures. The United States is not in the public
 * international file (Pew releases it separately) and so is absent here.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';

const CSV = join('data', 'raw', 'pew', 'pew_ga2025_by_country.csv');
const PARSED = new Date().toISOString().slice(0, 10);
const META = {
  source: 'Pew Research Center (Global Attitudes Survey)',
  // Pew's dataset terms (section 13) require this disclaimer word for word.
  license: 'Pew Research Center terms of use (survey dataset terms). Pew Research Center bears no responsibility for the analyses or interpretations of the data presented here. The opinions expressed herein, including any implications for policy, are those of the author and not of Pew Research Center.',
  url: 'https://www.pewresearch.org/global/',
  vintage: 'Spring 2025 Global Attitudes Survey, public international file (24 countries)',
};
const BASE = 'Weighted by Pew\'s weight. As in Pew\'s published tables, "don\'t know" and refused are part of the base; only people not asked are left out. Matches Pew\'s topline to the point.';

const S = (col, slug, topic, title, valueLabel, summary, codes, check) => ({ col, slug, topic, title, valueLabel, summary, codes, check });
const SERIES = [
  S('economy_good', 'pew-economy-good', 'economy', 'Economy Seen as Good (Pew)', 'Call the national economy very or somewhat good (%)',
    'Share who describe the current economic situation in their country as very or somewhat good.', 'very or somewhat good (Q1)', { IND: [75, 77], KOR: [9, 11] }),
  S('democracy_satisfied', 'pew-democracy-satisfaction', 'governance', 'Satisfaction with Democracy (Pew)', 'Very or somewhat satisfied with how democracy is working (%)',
    'Share very or somewhat satisfied with the way democracy is working in their country.', 'very or somewhat satisfied (Q2A)', { SWE: [74, 76], GRC: [18, 20] }),
  S('fav_us', 'pew-favorable-us', 'attitudes', 'Favourable View of the United States (Pew)', 'Very or somewhat favourable opinion of the US (%)',
    'Share with a very or somewhat favourable opinion of the United States.', 'very or somewhat favourable (Q3a)', { ISR: [82, 84], SWE: [18, 20] }),
  S('fav_china', 'pew-favorable-china', 'attitudes', 'Favourable View of China (Pew)', 'Very or somewhat favourable opinion of China (%)',
    'Share with a very or somewhat favourable opinion of China.', 'very or somewhat favourable (Q3b)'),
  S('fav_eu', 'pew-favorable-eu', 'attitudes', 'Favourable View of the EU (Pew)', 'Very or somewhat favourable opinion of the European Union (%)',
    'Share with a very or somewhat favourable opinion of the European Union.', 'very or somewhat favourable (Q3c)'),
  S('fav_un', 'pew-favorable-un', 'attitudes', 'Favourable View of the UN (Pew)', 'Very or somewhat favourable opinion of the United Nations (%)',
    'Share with a very or somewhat favourable opinion of the United Nations.', 'very or somewhat favourable (Q3d)'),
  S('fav_nato', 'pew-favorable-nato', 'attitudes', 'Favourable View of NATO (Pew)', 'Very or somewhat favourable opinion of NATO (%)',
    'Share with a very or somewhat favourable opinion of NATO; asked in member countries and a few others.', 'very or somewhat favourable (Q3e)'),
  S('fav_russia', 'pew-favorable-russia', 'attitudes', 'Favourable View of Russia (Pew)', 'Very or somewhat favourable opinion of Russia (%)',
    'Share with a very or somewhat favourable opinion of Russia.', 'very or somewhat favourable (Q3f)'),
  S('conf_trump', 'pew-confidence-trump', 'attitudes', 'Confidence in Donald Trump (Pew)', 'A lot of or some confidence in Trump on world affairs (%)',
    'Share with a lot of or some confidence in US President Donald Trump to do the right thing regarding world affairs.', 'a lot or some (Q7a; Australia Q7aAUS)', { AUS: [21, 23], MEX: [7, 9] }),
  S('conf_xi', 'pew-confidence-xi', 'attitudes', 'Confidence in Xi Jinping (Pew)', 'A lot of or some confidence in Xi on world affairs (%)',
    'Share with a lot of or some confidence in Chinese President Xi Jinping to do the right thing regarding world affairs.', 'a lot or some (Q7b; Australia Q7bAUS)'),
  S('conf_putin', 'pew-confidence-putin', 'attitudes', 'Confidence in Vladimir Putin (Pew)', 'A lot of or some confidence in Putin on world affairs (%)',
    'Share with a lot of or some confidence in Russian President Vladimir Putin to do the right thing regarding world affairs.', 'a lot or some (Q7c; Australia Q7cAUS)'),
  S('god_needed_moral', 'pew-god-necessary-for-morality', 'attitudes', 'Belief in God Needed to Be Moral (Pew)', 'Say it is necessary to believe in God to be moral (%)',
    'Share who say it is necessary to believe in God in order to be moral and have good values.', '"necessary" (Q18)'),
  S('homosexuality_unacceptable', 'pew-homosexuality-morally-unacceptable', 'attitudes', 'Homosexuality Seen as Morally Unacceptable (Pew)', 'Call homosexuality morally unacceptable (%)',
    'Share who say homosexuality is morally unacceptable (other answers: acceptable, not a moral issue, depends).', '"morally unacceptable" (Q17b)'),
  S('climate_major_threat', 'pew-climate-change-major-threat', 'environment', 'Climate Change a Major Threat (Pew)', 'Call global climate change a major threat to their country (%)',
    'Share who say global climate change is a major threat to their country.', '"major threat" (Q24a)'),
  S('misinfo_major_threat', 'pew-misinformation-major-threat', 'media', 'Online Misinformation a Major Threat (Pew)', 'Call false information online a major threat to their country (%)',
    'Share who say the spread of false information online is a major threat to their country.', '"major threat" (Q24d)'),
  S('ai_more_concerned', 'pew-ai-more-concerned', 'connectivity', 'More Concerned Than Excited About AI (Pew)', 'More concerned than excited about AI in daily life (%)',
    'Share who say the increased use of artificial intelligence in daily life makes them more concerned than excited.', '"more concerned than excited" (Q31)'),
  S('china_leading_economy', 'pew-china-leading-economy', 'economy', 'China Seen as the Leading Economic Power (Pew)', 'Name China as the world\'s leading economic power (%)',
    'Share who name China as the world\'s leading economic power (other options: the US, Japan, the EU).', '"China" (Q12)'),
  S('us_leading_economy', 'pew-us-leading-economy', 'economy', 'US Seen as the Leading Economic Power (Pew)', 'Name the US as the world\'s leading economic power (%)',
    'Share who name the United States as the world\'s leading economic power (other options: China, Japan, the EU).', '"The United States" (Q12)'),
];

async function main() {
  const geo = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) geo.set(a3, { name: r.name, region: REGION_4[r.world_4region] || 'Other' });
  }
  const rows = [...parseCsvObjects(await readFile(CSV, 'utf8'))];
  for (const s of SERIES) {
    const data = [];
    for (const r of rows) {
      if (r[s.col] === '') continue;
      const g = geo.get(r.iso3);
      if (!g) throw new Error(`${s.slug}: no geography for ${r.iso3}`);
      data.push({ entity: g.name, group: g.region, period: '2025', value: round(Number(r[s.col]), 1), iso: r.iso3 });
    }
    if (data.length < 10) throw new Error(`${s.slug}: only ${data.length} countries`);
    if (data.some((d) => !(d.value >= 0 && d.value <= 100))) throw new Error(`${s.slug}: share outside 0–100`);
    for (const [iso, [lo, hi]] of Object.entries(s.check || {})) {
      const d = data.find((x) => x.iso === iso);
      if (!d || d.value < lo || d.value > hi) throw new Error(`${s.slug}: ${iso} = ${d?.value}, Pew published ${lo}–${hi}`);
    }
    await writeDataset('surveys', s.slug, {
      ...META, kind: 'surveys', title: s.title, unit: '%', changeMode: 'pp', valueLabel: s.valueLabel, topic: s.topic,
      summary: `${s.summary} Pew Research Center, Spring 2025.`,
      method: `${BASE} Counted: ${s.codes}.`, parsedAt: PARSED,
    }, data);
  }
  console.log(`✓ Pew Global Attitudes: ${SERIES.length} datasets, ${rows.length} countries`);
}
main().catch((e) => { console.error('✗ parse_pew failed:', e.message); process.exit(1); });
