/**
 * RLMS-HSE (Russia Longitudinal Monitoring Survey) → Russia time-series Study
 * datasets. Single country, but a long annual trend (digital, fintech, income).
 * Python pre-step (rlms_agg.py) reads the merged .sav, weights by inwgt and
 * writes rlms_trends.csv: year,income,internet,bank_card.
 *   python3 scratchpad/rlms_agg.py RLMS_..._rus.sav scratchpad/rlms_trends.csv
 *   node scripts/parse_rlms_trends.mjs
 */
import { readFile } from 'node:fs/promises';
import { parseCsvObjects } from './lib/csv.mjs';
import { writeDataset } from './lib/datasets.mjs';

const CSV = process.env.RLMS_CSV ||
  '/private/tmp/claude-501/-Users-kirillshpara/025d8691-cfe3-48e0-a982-db40cbef8a62/scratchpad/rlms_trends.csv';
const COMMON = {
  source: 'RLMS-HSE (HSE University / UNC)',
  // Required acknowledgement, word for word from https://www.hse.ru/en/rlms/reference
  // ("Please use the following text in all publications resulting from use of the RLMS HSE data").
  license: 'RLMS-HSE terms — public aggregates. Source: "Russia Longitudinal Monitoring survey, RLMS HSE", conducted by National Research University "Higher School of Economics" and OOO “Demoscope” together with the Institute of Sociology of the Federal Center of Theoretical and Applied Sociology of the Russian Academy of Sciences. (RLMS HSE web site: https://www.hse.ru/rlms)',
  url: 'https://www.hse.ru/en/rlms/', parsedAt: new Date().toISOString().slice(0, 10),
};
const RU = (period, value) => ({ entity: 'Russia', group: 'Europe', period: String(period), value, iso: 'RUS' });

async function main() {
  let text;
  try { text = await readFile(CSV, 'utf8'); } catch { console.warn('– RLMS trends CSV missing (run Python pre-step); skipped.'); return; }
  const rows = [...parseCsvObjects(text)];

  const series = (col, minYear = 0) => rows
    .filter((r) => r[col] !== undefined && r[col] !== '' && Number(r.year) >= minYear)
    .map((r) => RU(r.year, Number(r[col])))
    .filter((o) => Number.isFinite(o.value));

  await writeDataset('survey', 'rlms-internet', {
    title: 'Internet Use (Russia)', valueLabel: 'Adults who used the internet in the last 12 months', unit: '%', changeMode: 'pp', topic: 'connectivity',
    summary: 'Share of Russian adults who used the internet in the past 12 months — annual trend. RLMS-HSE longitudinal survey.', ...COMMON,
  }, series('internet', 2012)); // 2011 base differs; start the clean run at 2012

  await writeDataset('survey', 'rlms-bank-card', {
    title: 'Bank Card Ownership (Russia)', valueLabel: 'Adults who hold a bank card', unit: '%', changeMode: 'pp', topic: 'economy',
    summary: 'Share of Russian adults who hold a plastic bank card — annual trend (asked through 2019). RLMS-HSE longitudinal survey.', ...COMMON,
  }, series('bank_card'));

  await writeDataset('survey', 'rlms-smoking', {
    title: 'Smoking (Russia)', valueLabel: 'Adults who currently smoke', unit: '%', changeMode: 'pp', topic: 'health',
    summary: 'Share of Russian adults who currently smoke — annual trend. RLMS-HSE longitudinal survey.', ...COMMON,
  }, series('smoking'));

  await writeDataset('survey', 'rlms-alcohol', {
    title: 'Alcohol Use (Russia)', valueLabel: 'Adults who drank alcohol in the last 30 days', unit: '%', changeMode: 'pp', topic: 'health',
    summary: 'Share of Russian adults who consumed alcohol in the past 30 days — annual trend. RLMS-HSE longitudinal survey.', ...COMMON,
  }, series('alcohol'));

  await writeDataset('survey', 'rlms-life-satisfaction', {
    title: 'Life Satisfaction (Russia)', valueLabel: 'Adults satisfied with their life', unit: '%', changeMode: 'pp', topic: 'wellbeing',
    summary: 'Share of Russian adults who are fully or rather satisfied with their life — annual trend. RLMS-HSE longitudinal survey.', ...COMMON,
  }, series('life_sat'));

  await writeDataset('survey', 'rlms-higher-education', {
    title: 'Higher Education (Russia)', valueLabel: 'Adults with completed higher education', unit: '%', changeMode: 'pp', topic: 'education',
    summary: 'Share of Russian adults who have completed higher education — annual trend. RLMS-HSE longitudinal survey.', ...COMMON,
  }, series('higher_ed'));

  await writeDataset('survey', 'rlms-married', {
    title: 'Married (Russia)', valueLabel: 'Adults in a registered marriage', unit: '%', changeMode: 'pp', topic: 'demographics',
    summary: 'Share of Russian adults in a registered marriage — annual trend. RLMS-HSE longitudinal survey.', ...COMMON,
  }, series('married'));

  await writeDataset('survey', 'rlms-income', {
    title: 'Median Monthly Income (Russia)', valueLabel: 'Median personal income, last 30 days (₽)', unit: '₽/month', changeMode: 'pct', topic: 'economy',
    summary: 'Weighted median of personal income over the last 30 days, in rubles — annual trend. RLMS-HSE longitudinal survey.', ...COMMON,
  }, series('income'));

  console.log('✓ RLMS: 8 Russia trend datasets written');
}
main();
