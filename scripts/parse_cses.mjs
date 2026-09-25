/**
 * CSES — Comparative Study of Electoral Systems → country-level attitudes to
 * democracy, from post-election surveys.
 *
 *   node scripts/parse_cses.mjs
 *
 * Reads data/raw/cses/cses_imd_by_study.csv: one row per election study,
 * aggregated from the 655 MB Integrated Module Dataset by
 * scripts/tools/cses_imd_aggregate.mjs, which documents every answer code
 * used. The source is too large to commit or to hold in a Node string; the
 * aggregate is small and is all this parser, and the scheduled run, ever read.
 *
 * CSES runs after national elections, so fieldwork years differ by country.
 * Each country contributes its most recent study from 2011–2021 (Modules 4–5),
 * and the election year travels with the row. Older studies are left out
 * rather than ranked beside recent ones: a 1998 Ukraine next to a 2021 Germany
 * is two different questions.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';

const RAW = join('data', 'raw', 'cses', 'cses_imd_by_study.csv');
const PERIOD = '2011–2021';
const FROM = 2011;
const MIN_N = 300;                     // substantive answers needed to report a study
const PARSED = new Date().toISOString().slice(0, 10);

const META = {
  source: 'CSES — Comparative Study of Electoral Systems',
  license: 'Free for research and publication with citation',
  url: 'https://cses.org/data-download/cses-integrated-module-dataset-imd/',
  vintage: 'Integrated Module Dataset, 2024-02-27 release; latest election study per country, 2011–2021',
  kind: 'survey',
};

const SERIES = [
  { slug: 'cses-satisfaction-democracy', col: 'sat', title: 'Satisfaction with Democracy', unit: '%', changeMode: 'pp',
    valueLabel: 'Very or fairly satisfied with how democracy works (%)',
    summary: 'Share of voters very or fairly satisfied with the way democracy works in their country, asked after a national election. CSES, latest study per country 2011–2021.',
    method: 'Weighted by the CSES demographic weight. Share of answers 1–2 among substantive answers (1, 2, 4, 5 and, where offered, 6 "neither"); refused, don\'t know and missing excluded.' },
  { slug: 'cses-left-right', col: 'lr', title: 'Left–Right Self-placement', unit: 'score 0–10', changeMode: 'pp',
    valueLabel: 'Mean self-placement, 0 = left, 10 = right',
    summary: 'Where voters place themselves on a 0–10 scale from left to right, averaged. CSES, latest study per country 2011–2021.',
    method: 'Weighted mean on 0–10 by the CSES demographic weight; "haven\'t heard of left–right", refused, don\'t know and missing excluded.' },
  { slug: 'cses-efficacy-power', col: 'power', title: 'Who Is in Power Makes a Difference', unit: '%', changeMode: 'pp',
    valueLabel: 'Say it makes a difference who is in power (4–5 on a 1–5 scale, %)',
    summary: 'Share of voters who say it makes a real difference who is in power. CSES, latest study per country 2011–2021.',
    method: 'Weighted by the CSES demographic weight. Share answering 4 or 5 on the 1–5 scale; refused, don\'t know and missing excluded.' },
  { slug: 'cses-efficacy-vote', col: 'vote', title: 'Voting Makes a Difference', unit: '%', changeMode: 'pp',
    valueLabel: 'Say who people vote for makes a difference (4–5 on a 1–5 scale, %)',
    summary: 'Share of voters who say who people vote for can make a real difference. CSES, latest study per country 2011–2021.',
    method: 'Weighted by the CSES demographic weight. Share answering 4 or 5 on the 1–5 scale; refused, don\'t know and missing excluded.' },
];

async function main() {
  const geo = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) geo.set(a3, { name: r.name, region: REGION_4[r.world_4region] || 'Other' });
  }
  const studies = [...parseCsvObjects(await readFile(RAW, 'utf8'))];

  for (const s of SERIES) {
    const best = new Map();
    for (const r of studies) {
      const y = Number(r.year), v = r[`${s.col}_${s.col === 'lr' ? 'mean' : 'share'}`], n = Number(r[`${s.col}_n`]);
      if (y < FROM || v === '' || !(n >= MIN_N)) continue;
      const cur = best.get(r.iso3);
      if (!cur || y > Number(cur.year)) best.set(r.iso3, r);
    }
    const data = [];
    for (const [iso, r] of best) {
      const g = geo.get(iso);
      if (!g) { console.warn(`  – ${s.slug}: no geography for ${iso} (${r.name}); skipped`); continue; }
      const v = Number(r[`${s.col}_${s.col === 'lr' ? 'mean' : 'share'}`]);
      data.push({ entity: g.name, group: g.region, period: PERIOD, value: round(v, s.col === 'lr' ? 2 : 1), iso, year: r.year });
    }

    // writeDataset guards against a shrinking or broken refresh, but a first
    // write has nothing to compare against. These are checks a wrong answer
    // code or a reversed scale would fail.
    if (data.length < 40) throw new Error(`${s.slug}: only ${data.length} countries`);
    if (s.col === 'sat') {
      const dk = data.find((d) => d.iso === 'DNK'), bg = data.find((d) => d.iso === 'BGR');
      if (!dk || !bg || !(dk.value > 70 && bg.value < 40)) throw new Error(`${s.slug}: Denmark/Bulgaria outside expected range — check the answer codes`);
    }
    if (s.col === 'lr' && data.some((d) => d.value < 0 || d.value > 10)) throw new Error(`${s.slug}: mean outside 0–10`);

    await writeDataset('surveys', s.slug, {
      ...META, title: s.title, unit: s.unit, changeMode: s.changeMode, valueLabel: s.valueLabel,
      summary: s.summary, method: s.method, topic: s.col === 'sat' ? 'governance' : 'attitudes', parsedAt: PARSED,
    }, data);
  }
  console.log(`✓ CSES: ${SERIES.length} datasets written`);
}
main();
