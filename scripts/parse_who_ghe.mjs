/**
 * WHO Global Health Estimates 2021 → share of all deaths by major cause, per
 * country. Parsed from WHO's own summary workbook (deaths in thousands, both
 * sexes, all ages), not from any site built on top of it.
 *
 * These are estimates, not registered deaths. WHO grades each country's
 * death-registration data 1–4 in the workbook and the grade is carried through
 * per row, so a reader can tell a share computed from a complete register
 * from one modelled where no register exists.
 *
 *   node scripts/parse_who_ghe.mjs
 *
 * Input: data/raw/who-ghe/ghe2021_deaths_bycountry_2021.csv — the 'All ages /
 * Persons' block of WHO's workbook, extracted once by
 * scripts/tools/ghe_xlsx_to_csv.py and committed next to the workbook. The
 * pipeline is Node; the runner has no openpyxl, and a parser that shells out to
 * Python is a parser that fails on the schedule and nowhere else.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';

const RAW = join('data', 'raw', 'who-ghe', 'ghe2021_deaths_bycountry_2021.csv');
const YEAR = '2021';
const PARSED = new Date().toISOString().slice(0, 10);

// GHE codes for the groups worth ranking on. Level-I groups partition all
// deaths; the rest are the largest level-II groups within NCDs and injuries.
const CAUSES = {
  10:   { slug: 'communicable',   title: 'Deaths from Communicable Diseases', what: 'communicable, maternal, perinatal and nutritional conditions' },
  600:  { slug: 'ncd',            title: 'Deaths from Noncommunicable Diseases', what: 'noncommunicable diseases' },
  1510: { slug: 'injuries',       title: 'Deaths from Injuries', what: 'injuries, unintentional and intentional' },
  1100: { slug: 'cardiovascular', title: 'Deaths from Cardiovascular Disease', what: 'cardiovascular diseases' },
  610:  { slug: 'cancer',         title: 'Deaths from Cancer', what: 'malignant neoplasms' },
  1170: { slug: 'respiratory',    title: 'Deaths from Respiratory Disease', what: 'chronic respiratory diseases' },
  800:  { slug: 'diabetes',       title: 'Deaths from Diabetes', what: 'diabetes mellitus' },
  940:  { slug: 'neurological',   title: 'Deaths from Neurological Conditions', what: 'neurological conditions, dementia included' },
  1610: { slug: 'self-harm',      title: 'Deaths from Self-harm', what: 'self-harm' },
  1620: { slug: 'violence',       title: 'Deaths from Interpersonal Violence', what: 'interpersonal violence' },
  // Sits outside groups I–III in the 2021 tables and is large enough to matter:
  // Kazakhstan's three groups sum to 92% and this is the other 8.
  1700: { slug: 'pandemic-other', title: 'Other Pandemic-related Deaths', what: 'other COVID-19 pandemic-related outcomes, beyond COVID-19 itself' },
};

/** The CSV is wide — one column per country. Returns the country list with
 *  its grade, and a map of GHE code → array of values in country order. */
async function readSheet() {
  const rows = [...parseCsvObjects(await readFile(RAW, 'utf8'))];
  const isos = Object.keys(rows[0]).filter((k) => k !== 'code' && k !== 'cause');
  const gradeRow = rows.find((r) => r.code === 'grade');
  const countries = isos.map((iso) => ({ iso, grade: Number(gradeRow?.[iso]) || null }));
  const byCode = new Map();
  for (const r of rows) {
    if (r.code === 'grade') continue;
    byCode.set(Number(r.code), isos.map((iso) => (r[iso] === '' ? null : Number(r[iso]))));
  }
  return { countries, byCode };
}

async function main() {
  const geo = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) geo.set(a3, { name: r.name, region: REGION_4[r.world_4region] || 'Other' });
  }

  const sheet = await readSheet();
  const byCode = sheet.byCode;
  const all = byCode.get(0);
  if (!all) throw new Error('All Causes row (GHE code 0) not found');

  const WHO = {
    source: 'WHO Global Health Estimates 2021', license: 'CC BY-NC-SA 3.0 IGO',
    url: 'https://www.who.int/data/gho/data/themes/mortality-and-global-health-estimates/ghe-leading-causes-of-death',
    vintage: '2021 estimates, published June 2024',
    method: 'WHO estimate. Share of all deaths, both sexes, all ages. WHO grades each country\'s death-registration data from 1 (complete) to 4 (none, fully modelled); the grade is stored per country as "grade".',
  };

  let written = 0;
  for (const [code, c] of Object.entries(CAUSES)) {
    const vals = byCode.get(Number(code));
    if (!vals) { console.warn(`– ${c.slug}: GHE code ${code} not in workbook; skipped.`); continue; }
    const data = [];
    sheet.countries.forEach((ctry, i) => {
      const g = geo.get(ctry.iso);
      const total = all[i], v = vals[i];
      if (!g || !(total > 0) || typeof v !== 'number') return;
      data.push({ entity: g.name, group: g.region, period: YEAR, value: round(100 * v / total, 1), iso: ctry.iso, grade: ctry.grade });
    });
    await writeDataset('macro', `who-ghe-${c.slug}`, {
      title: c.title, valueLabel: `Share of all deaths from ${c.what}`, unit: '%', changeMode: 'pp', topic: 'health',
      summary: `Share of all deaths in ${YEAR} attributed to ${c.what}, both sexes, all ages. WHO Global Health Estimates — modelled where death registration is incomplete; each country carries WHO's data grade.`,
      ...WHO, parsedAt: PARSED,
    }, data);
    written++;
  }
  console.log(`✓ WHO GHE: ${written} datasets written`);
}
main();
