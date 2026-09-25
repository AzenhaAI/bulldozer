/**
 * IEA international assessments → country mean scores: TIMSS 2023 (grades 4
 * and 8, mathematics and science), PIRLS 2021 (reading), ICCS 2022 (civic
 * knowledge) and ICILS 2023 (computer and information literacy,
 * computational thinking).
 *
 *   node scripts/parse_iea.mjs
 *
 * Reads data/raw/iea/<study>.csv, written once per release by
 * scripts/tools/iea_aggregate.py from IEA's International Databases (60 MB to
 * 1.1 GB each, not committed). Checked against the published tables before
 * this shipped: PIRLS 2021 matches all 42 countries it was compared on to the
 * point; TIMSS 2023 grade 8 mathematics matches the top five (Singapore 605,
 * Chinese Taipei 602, Korea 596, Japan 595, Hong Kong 575); ICCS 2022 Chinese
 * Taipei 583, Sweden 565, Poland 554; ICILS 2023 Korea 540, Czechia 525.
 *
 * Two kinds of IEA annotation are treated differently. A country marked as
 * not satisfying a guideline stays in IEA's ranking, with a dagger, and stays
 * here. A country IEA puts below the line — sample participation not met, or
 * achievement not reliably estimated — is left out here too, listed in
 * EXCLUDE with IEA's reason; ranking it beside the others would claim what
 * IEA declined to. Benchmarking entities (Abu Dhabi, Moscow City, Quebec,
 * England…) have codes that are not countries and fall away at the geography
 * lookup.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';

const PARSED = new Date().toISOString().slice(0, 10);
const LICENSE = 'IEA International Database — free for research and publication with citation';

const STUDIES = [
  { file: 'timss2023_g8', period: '2023', source: 'TIMSS 2023 (IEA)', url: 'https://timss2023.org/results/',
    exclude: { NZL: 'did not satisfy minimum school participation rates', CIV: 'achievement could not be reliably estimated' },
    series: [
      { col: 'math', slug: 'timss-math-grade8', title: 'TIMSS Mathematics, Grade 8', label: 'Mean mathematics score, grade 8' },
      { col: 'science', slug: 'timss-science-grade8', title: 'TIMSS Science, Grade 8', label: 'Mean science score, grade 8' },
    ] },
  { file: 'timss2023_g4', period: '2023', source: 'TIMSS 2023 (IEA)', url: 'https://timss2023.org/results/',
    exclude: { COT: 'in the database but not reported in IEA\'s results' },
    series: [
      { col: 'math', slug: 'timss-math-grade4', title: 'TIMSS Mathematics, Grade 4', label: 'Mean mathematics score, grade 4' },
      { col: 'science', slug: 'timss-science-grade4', title: 'TIMSS Science, Grade 4', label: 'Mean science score, grade 4' },
    ] },
  { file: 'pirls2021', period: '2021', source: 'PIRLS 2021 (IEA)', url: 'https://pirls2021.org/results',
    exclude: {},
    series: [{ col: 'reading', slug: 'pirls-reading', title: 'PIRLS Reading, Grade 4', label: 'Mean reading score, grade 4' }] },
  { file: 'iccs2022', period: '2022', source: 'ICCS 2022 (IEA)', url: 'https://www.iea.nl/studies/iea/iccs/2022',
    exclude: { BRA: 'sample participation requirements not met', DNK: 'sample participation requirements not met' },
    series: [{ col: 'civic', slug: 'iccs-civic-knowledge', title: 'ICCS Civic Knowledge, Grade 8', label: 'Mean civic knowledge score, grade 8' }] },
  { file: 'icils2023', period: '2023', source: 'ICILS 2023 (IEA)', url: 'https://www.iea.nl/studies/iea/icils/2023',
    exclude: { USA: 'sample participation requirements not met' },
    series: [
      { col: 'cil', slug: 'icils-computer-literacy', title: 'ICILS Computer and Information Literacy, Grade 8', label: 'Mean computer and information literacy score, grade 8' },
      { col: 'ct', slug: 'icils-computational-thinking', title: 'ICILS Computational Thinking, Grade 8', label: 'Mean computational thinking score, grade 8' },
    ] },
];

// IEA's own country codes where they differ from ISO 3166, and the one
// country the geography table lacks (Kosovo, as the rest of the site names it).
const IEA_TO_ISO = { ROM: 'ROU', COT: 'CIV' };
const EXTRA_GEO = { XKX: { name: 'Kosovo', region: 'Europe' } };

const SUMMARY = {
  'timss-math-grade8': 'Average mathematics score of eighth-grade students.',
  'timss-science-grade8': 'Average science score of eighth-grade students.',
  'timss-math-grade4': 'Average mathematics score of fourth-grade students.',
  'timss-science-grade4': 'Average science score of fourth-grade students.',
  'pirls-reading': 'Average reading comprehension score of fourth-grade students; some countries tested at the start of grade 5 after pandemic delays, as IEA annotates.',
  'iccs-civic-knowledge': 'Average civic knowledge and understanding score of eighth-grade students — how democracy, institutions and citizenship work.',
  'icils-computer-literacy': 'Average score of eighth-grade students in using computers to find, judge and create information.',
  'icils-computational-thinking': 'Average score of eighth-grade students in framing problems and designing solutions a computer can run; not every country took this option.',
};

async function main() {
  const geo = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) geo.set(a3, { name: r.name, region: REGION_4[r.world_4region] || 'Other' });
  }
  for (const st of STUDIES) {
    const rows = [...parseCsvObjects(await readFile(join('data', 'raw', 'iea', `${st.file}.csv`), 'utf8'))];
    const left = Object.entries(st.exclude).map(([c, why]) => `${c} (${why})`).join('; ');
    for (const s of st.series) {
      const data = [];
      const skipped = [];
      for (const r of rows) {
        const v = Number(r[s.col]);
        // Blank or NaN: the country did not take this part (ICILS computational
        // thinking is optional), not a score of zero.
        if (r[s.col] === '' || !Number.isFinite(v) || st.exclude[r.code]) continue;
        const iso = IEA_TO_ISO[r.code] || r.code;
        const g = geo.get(iso) || EXTRA_GEO[iso];
        if (!g) { skipped.push(r.code); continue; }
        data.push({ entity: g.name, group: g.region, period: st.period, value: round(v, 1), iso });
      }
      // Scores sit on a 500-centred scale; anything outside 250–700 means a
      // wrong column or a broken aggregate, not a result.
      if (data.length < 15 || data.some((d) => d.value < 250 || d.value > 700)) throw new Error(`${s.slug}: implausible output`);
      await writeDataset('macro', s.slug, {
        title: s.title, valueLabel: s.label, unit: 'IEA score', changeMode: 'pp', topic: 'education',
        summary: `${SUMMARY[s.slug]} ${st.source}.`,
        source: st.source, license: LICENSE, url: st.url, vintage: `${st.period} cycle`,
        method: `Weighted mean of the five plausible values, as IEA estimates it.${left ? ` Left out, as in IEA's own ranking: ${left}.` : ''} Benchmarking participants are not countries and are not shown.`,
        parsedAt: PARSED,
      }, data);
      if (skipped.length) console.log(`    ${s.slug}: not countries, skipped — ${skipped.join(' ')}`);
    }
  }
  console.log('✓ IEA assessments written');
}
main();
