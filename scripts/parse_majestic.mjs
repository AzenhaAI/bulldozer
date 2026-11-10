/**
 * Majestic Million → how many of the world's million most-linked websites
 * sit on each country's own domain (.de, .jp, .br …). One snapshot a year.
 *
 *   node scripts/parse_majestic.mjs
 *
 * Source: https://majestic.com/reports/majestic-million, "Licensed under a
 * Creative Commons Attribution 3.0 Unported License"; the full list is the
 * daily CSV at downloads.majestic.com/majestic_million.csv (~80 MB, not
 * committed — it is re-read on every run). Majestic ranks sites by the number
 * of distinct IP subnets linking to them.
 *
 * Majestic publishes only the current list, so the period is the year of the
 * snapshot: each weekly run replaces this year's figures with the newest
 * list, and earlier years' rows are kept as they were last written.
 *
 * Country-code domains are not countries. Three rules keep the mapping honest:
 *   - .uk (and the unused .gb) is the United Kingdom; other ccTLDs map by
 *     their ISO 3166 alpha-2 code; .eu, .su and .ac are not countries here.
 *   - The ccTLDs Google Search treats as generic because they are marketed
 *     worldwide (GENERIC, from developers.google.com/search/docs/specialty/
 *     international/managing-multi-regional-sites, read 2026-11-10) are left
 *     out: .io, .ai, .co, .me, .tv and the rest say nothing about the country.
 *   - Internationalised country domains count for their country (IDN_CC,
 *     written in punycode).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, writeDataset } from './lib/datasets.mjs';
import { countryLookup, fetchText } from './lib/geo.mjs';

const PARSED = new Date().toISOString().slice(0, 10);
const YEAR = PARSED.slice(0, 4);
const SLUG = 'majestic-cctld-sites';
const GENERIC = new Set(['ad', 'ai', 'as', 'bz', 'cc', 'cd', 'co', 'dj', 'fm', 'io', 'la', 'me', 'ms', 'nu', 'sc', 'sr', 'su', 'tv', 'tk', 'ws']);
const IDN_CC = {
  'xn--p1ai': 'RUS', 'xn--j1amh': 'UKR', 'xn--90ais': 'BLR', 'xn--80ao21a': 'KAZ', 'xn--d1alf': 'MKD',
  'xn--90a3ac': 'SRB', 'xn--l1acc': 'MNG', 'xn--node': 'GEO', 'xn--y9a3aq': 'ARM', 'xn--qxam': 'GRC',
  'xn--fiqs8s': 'CHN', 'xn--fiqz9s': 'CHN', 'xn--j6w193g': 'HKG', 'xn--kprw13d': 'TWN', 'xn--kpry57d': 'TWN',
  'xn--3e0b707e': 'KOR', 'xn--o3cw4h': 'THA', 'xn--h2brj9c': 'IND', 'xn--wgbh1c': 'EGY',
  'xn--mgbaam7a8h': 'ARE', 'xn--mgberp4a5d4ar': 'SAU', 'xn--mgba3a4f16a': 'IRN',
};

const geo = await countryLookup();
const csv = await fetchText('https://downloads.majestic.com/majestic_million.csv');
if (!csv) throw new Error('Majestic Million: not found');
const lines = csv.split('\n');
const header = lines[0].trim().split(',');
const tldCol = header.indexOf('TLD');
if (tldCol < 0) throw new Error(`Majestic Million: no TLD column in ${lines[0].slice(0, 80)}`);

const counts = new Map();
let total = 0;
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  total++;
  const tld = line.split(',')[tldCol]?.trim().toLowerCase();
  if (!tld || GENERIC.has(tld)) continue;
  const iso = IDN_CC[tld] ?? (tld === 'uk' || tld === 'gb' ? 'GBR' : tld.length === 2 ? geo.iso3(tld) : null);
  if (iso) counts.set(iso, (counts.get(iso) ?? 0) + 1);
}
// A short or truncated download would shrink every country at once.
if (total < 990000) throw new Error(`Majestic Million: only ${total} rows`);

const data = [...counts].map(([iso, n]) => ({ ...geo.describe(iso), period: YEAR, value: n, iso }));
// Earlier years' snapshots stay; this year's are replaced by the newest list.
try {
  const prev = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'macro', `${SLUG}.json`), 'utf8')).data ?? [];
  data.push(...prev.filter((r) => r.period !== YEAR));
} catch { /* first run */ }
data.sort((a, b) => a.entity.localeCompare(b.entity) || a.period.localeCompare(b.period));
console.log(`Majestic Million: ${total} sites, ${[...counts.values()].reduce((a, b) => a + b, 0)} on ${counts.size} country domains`);

await writeDataset('macro', SLUG, {
  title: 'Top Websites on the Country Domain',
  valueLabel: 'Sites among the world\'s million most-linked on the country\'s domain (.de, .jp …)',
  unit: 'sites',
  changeMode: 'pct',
  topic: 'connectivity',
  summary: 'How many of the world\'s million most-linked websites (Majestic Million, ranked by the number of distinct networks linking to them) end in the country\'s own internet domain — .de for Germany, .uk for the United Kingdom, .br for Brazil, including domains in local scripts such as Russia\'s Cyrillic one. A rough gauge of a country\'s own web, with big blind spots: a domain is not a country, and many national sites use .com, .org or .net — above all in the United States, where most sites never use .us, so the US ranks far below its real weight. Domains marketed worldwide (.io, .ai, .co, .me, .tv and the others Google Search treats as generic) are left out, so those countries are missing. One snapshot per year, taken from the latest list.',
  method: 'Count of entries in the Majestic Million whose top-level domain is the country\'s ccTLD (.uk for the United Kingdom; internationalised ccTLDs included); the 20 ccTLDs Google Search treats as generic are excluded. Period = year of the snapshot.',
  vintage: 'Annual snapshot of the daily Majestic Million list (first taken November 2026)',
  source: 'Majestic Million',
  license: 'CC BY 3.0',
  url: 'https://majestic.com/reports/majestic-million',
  parsedAt: PARSED,
}, data);
