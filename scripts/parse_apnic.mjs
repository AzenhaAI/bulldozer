/**
 * APNIC Labs IPv6 measurement → share of users able to use IPv6, by country
 * and calendar year.
 *
 *   node scripts/parse_apnic.mjs
 *
 * Source: https://data1.labs.apnic.net/v6stats/v6economy/<CC>.json, the
 * per-economy daily time series behind https://stats.labs.apnic.net/ipv6
 * ("(C) APNIC Pty/Ltd. re-use with attribution permitted",
 * https://data1.labs.apnic.net/ipv6-data-format.html). APNIC places small
 * test scripts in online ads; a browser that can fetch an IPv6-only object is
 * "IPv6 capable". Each day's raw record gives the tests seen and the tests
 * that were IPv6-capable for that economy.
 *
 * Yearly value = all of the year's capable tests / all tests seen, i.e. the
 * pooled share over the calendar year (not the average of daily shares, which
 * would let thin days count as much as busy ones). Only complete years are
 * kept: the current year appears once it has ended. A country-year needs at
 * least MIN_DAYS days of data and MIN_SEEN tests, so a handful of ad
 * impressions in a tiny territory cannot pass for a national figure.
 */
import { writeDataset, round } from './lib/datasets.mjs';
import { countryLookup, fetchText, pool } from './lib/geo.mjs';

const PARSED = new Date().toISOString().slice(0, 10);
const FIRST_YEAR = 2014; // APNIC's per-economy series start in late 2013
const LAST_YEAR = new Date().getUTCFullYear() - 1;
const MIN_DAYS = 300;
const MIN_SEEN = 20000;

const geo = await countryLookup();
const rows = [];
let missing = 0, thin = 0;
await pool(geo.iso2s, 6, async (cc) => {
  const txt = await fetchText(`https://data1.labs.apnic.net/v6stats/v6economy/${cc}.json`);
  if (!txt) { missing++; return; }
  const j = JSON.parse(txt);
  if (!Array.isArray(j.data)) throw new Error(`APNIC ${cc}: no data array`);
  const years = new Map(); // year -> [days, seen, capable]
  for (const d of j.data) {
    const y = Number(String(d.date).slice(0, 4));
    const raw = d.raw;
    if (y < FIRST_YEAR || y > LAST_YEAR || !raw || !(raw.seen > 0)) continue;
    const a = years.get(y) ?? [0, 0, 0];
    a[0]++; a[1] += raw.seen; a[2] += raw.capable;
    years.set(y, a);
  }
  const iso = geo.iso3(cc);
  for (const [y, [days, seen, capable]] of years) {
    if (days < MIN_DAYS || seen < MIN_SEEN) { thin++; continue; }
    rows.push({ ...geo.describe(iso), period: String(y), value: round((capable / seen) * 100, 1), iso });
  }
});
console.log(`APNIC: ${rows.length} country-years (${missing} economies without a file, ${thin} thin country-years left out)`);
rows.sort((a, b) => a.entity.localeCompare(b.entity) || a.period.localeCompare(b.period));

await writeDataset('macro', 'apnic-ipv6-capable', {
  title: 'IPv6 Capability',
  valueLabel: 'Share of measured users whose connection can use IPv6',
  unit: '%',
  changeMode: 'pp',
  topic: 'connectivity',
  summary: 'Share of internet users whose connection and device can reach a site over IPv6, the successor to the exhausted IPv4 address space. APNIC Labs measures it with small test scripts served in online ads (millions of tests a day worldwide): a test counts as IPv6-capable when the browser fetches an IPv6-only object. Calendar-year share of all tests in the country; a year needs at least 300 days of data and 20,000 tests. Users reached through ads are not a random sample, and a mobile operator switching IPv6 on can move a country by tens of points in a year. APNIC\'s own country page weights each network by its estimated users; this pooled share does not, which for most large countries differs by under two points but by more where few ads are served (Russia since 2022, small islands).',
  method: 'Yearly value = IPv6-capable tests / all tests seen, pooled over the calendar year from APNIC\'s daily per-economy series (unweighted within the country). Complete years only; country-years with under 300 days or 20,000 tests are left out.',
  source: 'APNIC Labs IPv6 measurement',
  license: 'APNIC Labs data: re-use with attribution permitted',
  url: 'https://stats.labs.apnic.net/ipv6',
  parsedAt: PARSED,
}, rows);
