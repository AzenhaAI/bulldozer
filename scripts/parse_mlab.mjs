/**
 * M-Lab NDT speed tests → typical download and upload speed by country and
 * calendar year, 2020–2023.
 *
 *   node scripts/parse_mlab.mjs
 *
 * Reads data/raw/mlab/mlab_country_year.csv, written by
 * scripts/tools/mlab_aggregate.mjs from M-Lab's statistics API
 * (https://statistics.measurementlab.net/, CC0). That API stopped publishing
 * in March 2024, so the yearly extract is committed and this parser only
 * re-reads it; re-run the tool if M-Lab resumes the series.
 *
 * The value is the geometric mean ("log average") of the year's tests, using
 * one randomly chosen test per IP address per day — M-Lab's own sampling and
 * recommended summary for these skewed, multi-modal distributions. A
 * country-year needs at least MIN_TESTS sampled tests.
 *
 * Checked against the extract's other column, the median of the daily
 * medians: the two rank countries alike (Spearman 0.99 in 2020 and 2023), and
 * the geometric mean runs lower — by 18% at the median, 1–30% across most
 * country-years — as it should for right-skewed speeds.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { ROOT, writeDataset, round } from './lib/datasets.mjs';
import { countryLookup } from './lib/geo.mjs';

const PARSED = new Date().toISOString().slice(0, 10);
const MIN_TESTS = 1000;
const CSV = join(ROOT, 'data', 'raw', 'mlab', 'mlab_country_year.csv');

const COMMON = {
  unit: 'Mbps',
  changeMode: 'pct',
  topic: 'connectivity',
  source: 'M-Lab (Measurement Lab) NDT data set',
  license: 'CC0 1.0 (public domain dedication)',
  url: 'https://statistics.measurementlab.net/',
  vintage: 'Calendar years 2020–2023 (M-Lab\'s statistics API stopped in March 2024; 2023 lacks 21 days, mostly 29 Jan–15 Feb)',
};
const CAVEATS = 'Tests are run by people who choose to (M-Lab powers the speed test in Google Search), over whatever link and device they use — home Wi-Fi, mobile data, office networks — so this is the speed people experience, not the speed of the plans on sale. NDT measures a single connection to the nearest M-Lab server, which can be in another country; figures run well below multi-connection tests such as Speedtest and should not be compared with them. One randomly chosen test per IP address per day; a country-year needs at least 1,000 tests.';

const geo = await countryLookup();
const text = await readFile(CSV, 'utf8');
const series = { dl: [], ul: [] };
for (const r of parseCsvObjects(text)) {
  const iso = geo.iso3(r.iso2);
  if (!iso) continue;
  const base = { ...geo.describe(iso), period: String(r.year), iso };
  if (Number(r.dl_tests) >= MIN_TESTS && Number(r.dl_geomean_mbps) > 0) series.dl.push({ ...base, value: round(Number(r.dl_geomean_mbps), 2) });
  if (Number(r.ul_tests) >= MIN_TESTS && Number(r.ul_geomean_mbps) > 0) series.ul.push({ ...base, value: round(Number(r.ul_geomean_mbps), 2) });
}
for (const s of Object.values(series)) s.sort((a, b) => a.entity.localeCompare(b.entity) || a.period.localeCompare(b.period));

await writeDataset('macro', 'mlab-download-speed', {
  ...COMMON,
  title: 'Internet Download Speed (M-Lab)',
  valueLabel: 'Typical download speed in M-Lab speed tests (geometric mean, Mbps)',
  summary: `Typical download speed measured by M-Lab\'s open NDT speed test, in megabits per second: the geometric mean of the year\'s tests in the country. ${CAVEATS}`,
  method: 'Geometric mean over the calendar year of NDT download tests (one random test per IP per day), pooled exactly from M-Lab\'s daily per-country log averages weighted by test counts.',
  parsedAt: PARSED,
}, series.dl);

await writeDataset('macro', 'mlab-upload-speed', {
  ...COMMON,
  title: 'Internet Upload Speed (M-Lab)',
  valueLabel: 'Typical upload speed in M-Lab speed tests (geometric mean, Mbps)',
  summary: `Typical upload speed measured by M-Lab\'s open NDT speed test, in megabits per second: the geometric mean of the year\'s tests in the country. Upload matters for video calls, cloud backup and sending files, and lags download wherever cable and DSL dominate. ${CAVEATS}`,
  method: 'Geometric mean over the calendar year of NDT upload tests (one random test per IP per day), pooled exactly from M-Lab\'s daily per-country log averages weighted by test counts.',
  parsedAt: PARSED,
}, series.ul);
