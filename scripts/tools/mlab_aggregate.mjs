/**
 * M-Lab statistics API → one row per country and calendar year, written to
 * data/raw/mlab/mlab_country_year.csv for scripts/parse_mlab.mjs.
 *
 *   node scripts/tools/mlab_aggregate.mjs            # 2020–2023
 *
 * Source: the public bucket behind https://statistics.measurementlab.net/
 * (M-Lab stats-pipeline, CC0). One file per country and year,
 * v0/<continent>/<country>/<year>/histogram_daily_stats.json, holding daily
 * statistics of NDT speed tests (one randomly chosen test per IP address per
 * day; 8 histogram rows per day repeat the same daily figures). The pipeline
 * stopped publishing in March 2024, so 2020–2023 are the complete years; the
 * files are ~2 MB each (≈2 GB in all), which is why the yearly figures are
 * committed and the weekly parser does not re-download them.
 *
 * Yearly figure = the geometric mean ("log average", M-Lab's recommended
 * summary) over all of the year's sampled tests. Each day carries
 * LOG_AVG = 10^mean(log10 x) over its n samples, so the year's value is
 * 10^(Σ n·log10(LOG_AVG) / Σ n) — exact, not an approximation. The median of
 * the daily medians is written beside it as a cross-check.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../lib/datasets.mjs';
import { fetchText as get, pool } from '../lib/geo.mjs';

const BASE = 'https://statistics.measurementlab.net';
const YEARS = [2020, 2021, 2022, 2023];
const CONTINENTS = ['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'];
const OUT = join(ROOT, 'data', 'raw', 'mlab', 'mlab_country_year.csv');

/** Country codes under one continent (GCS XML listing with a delimiter). */
async function countries(cont) {
  const xml = await get(`${BASE}/?prefix=v0/${cont}/&delimiter=/`);
  return [...xml.matchAll(/<Prefix>v0\/[A-Z]{2}\/([A-Z0-9]{2})\/<\/Prefix>/g)].map((m) => m[1]);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function summarise(rows) {
  const byDay = new Map();
  for (const r of rows) if (!byDay.has(r.date)) byDay.set(r.date, r); // 8 bucket rows repeat the day's stats
  const acc = { dl: [0, 0], ul: [0, 0], rtt: [0, 0] };
  const add = (k, n, v) => { if (n > 0 && v > 0) { acc[k][0] += n; acc[k][1] += n * Math.log10(v); } };
  const dlMeds = [];
  for (const d of byDay.values()) {
    add('dl', d.dl_samples_day, d.dl_LOG_AVG_rnd1);
    add('ul', d.ul_samples_day, d.ul_LOG_AVG_rnd1);
    add('rtt', d.dl_samples_day, d.dl_minRTT_LOG_AVG_rnd1);
    if (d.download_MED > 0) dlMeds.push(d.download_MED);
  }
  const gm = ([n, s]) => (n ? 10 ** (s / n) : '');
  return {
    days: byDay.size,
    dl_tests: acc.dl[0], dl_mbps: gm(acc.dl),
    ul_tests: acc.ul[0], ul_mbps: gm(acc.ul),
    rtt_ms: gm(acc.rtt),
    dl_daily_median_median: dlMeds.length ? median(dlMeds) : '',
  };
}

const jobs = [];
for (const cont of CONTINENTS) for (const cc of await countries(cont)) for (const y of YEARS) jobs.push({ cont, cc, y });
console.log(`M-Lab: ${jobs.length} country-year files`);
let done = 0;
const rows = (await pool(jobs, 8, async ({ cont, cc, y }) => {
  const txt = await get(`${BASE}/v0/${cont}/${cc}/${y}/histogram_daily_stats.json`);
  if (++done % 100 === 0) console.log(`  ${done}/${jobs.length}`);
  if (!txt) return null;
  return { iso2: cc, year: y, ...summarise(JSON.parse(txt)) };
})).filter(Boolean);

const f = (v, dp) => (v === '' ? '' : Number(v).toFixed(dp));
const lines = ['iso2,year,days,dl_tests,dl_geomean_mbps,ul_tests,ul_geomean_mbps,minrtt_geomean_ms,dl_median_of_daily_medians'];
for (const r of rows.sort((a, b) => a.iso2.localeCompare(b.iso2) || a.year - b.year)) {
  lines.push([r.iso2, r.year, r.days, r.dl_tests, f(r.dl_mbps, 3), r.ul_tests, f(r.ul_mbps, 3), f(r.rtt_ms, 3), f(r.dl_daily_median_median, 3)].join(','));
}
await mkdir(join(ROOT, 'data', 'raw', 'mlab'), { recursive: true });
await writeFile(OUT, lines.join('\n') + '\n');
console.log(`✓ ${rows.length} rows → ${OUT.replace(ROOT + '/', '')}`);
