/**
 * Company user metrics — quarterly DAU, MAU, paying users, customers and
 * bookings of listed internet companies, read from their own earnings releases
 * filed with the SEC (EDGAR). Nobody publishes these as an open time series;
 * here every value links to the filing it was read from.
 *
 * User metrics are not in XBRL (companyfacts has no such tags), so the parser
 * reads the text of the earnings-release exhibits (EX-99.x) attached to each
 * 8-K (6-K for foreign filers such as Spotify) and pulls each figure with a
 * company-specific pattern.
 *
 *   node scripts/parse_company_metrics.mjs            # fetch new filings, rebuild datasets
 *   node scripts/parse_company_metrics.mjs --offline  # rebuild datasets from the committed CSV only
 *   node scripts/parse_company_metrics.mjs --refetch  # re-read every filing (EDGAR_CACHE helps)
 *   node scripts/parse_company_metrics.mjs --audit    # also print the matched text of every value
 *
 * The committed CSVs in data/raw/company-metrics/ are the source of record:
 *   observations.csv  one row per company x metric x quarter, with the filing
 *                     URL and the sentence or table row the value came from;
 *   filings.csv       every filing examined, so a weekly run fetches only new
 *                     ones and the site build never depends on EDGAR.
 *
 * Rules: one value per quarter, the one in that quarter's own earnings release
 * (later restatements are not applied); quarters are calendar quarters (every
 * company here has a December fiscal year end); values are stored in millions.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { ROOT, writeDataset, round } from './lib/datasets.mjs';
import { listFilings, filingDocs, fetchDoc, htmlToText } from './lib/edgar.mjs';

const RAW = join(ROOT, 'data', 'raw', 'company-metrics');
const OBS_CSV = join(RAW, 'observations.csv');
const FIL_CSV = join(RAW, 'filings.csv');
const RAW_URL = 'https://github.com/AzenhaAI/bulldozer/blob/main/data/raw/company-metrics/observations.csv';
const PARSED = new Date().toISOString().slice(0, 10);
const SINCE = '2019-01-01';
const FIRST_Q = '2019-Q1'; // the series start here; a January 2019 release of Q4 2018 is left out
const args = new Set(process.argv.slice(2));

// ── Extraction helpers ──────────────────────────────────────────────────────

const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)`;
const toNum = (s) => Number(String(s).replace(/,/g, ''));
const SCALE = { billion: 1000, b: 1000, million: 1, m: 1, thousand: 0.001 };

/** A sentence pattern: `re` must capture the number as group 1 and may
 *  capture the unit word (million/billion/M/B) as group 2; `unit` is the
 *  default when the pattern carries none (a table "in millions"). */
const say = (re, unit = 'million') => ({ kind: 'say', re, unit });
/** A two-column table row "a b p%" whose column order changed between releases:
 *  groups 1 and 2 are the two quarters, group 3 the year-over-year change; the
 *  current quarter is the one that grew by p% from the other. */
const pair = (re, unit = 'million') => ({ kind: 'pair', re, unit });
/** A table row: the label, then `pick` = which of the numbers that follow
 *  it is the quarter's own value (0-based; -1 = last of `count`). */
const row = (re, pick, count, unit = 'million') => ({ kind: 'row', re, pick, count, unit });

function tryPattern(p, text) {
  if (p.kind === 'say' || p.kind === 'pair') {
    // Prose wraps across lines and table cells: match on one flat line.
    const flat = text.replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ');
    const m = flat.match(p.re);
    if (!m) return null;
    const snippet = snippetAt(flat, m.index, m[0].length);
    if (p.kind === 'pair') {
      const [a, b] = [toNum(m[1]), toNum(m[2])];
      const g = (m[3].includes('(') ? -1 : 1) * Number(m[3].replace(/[()%\s]/g, '')) / 100;
      const cur = Math.abs(b / a - 1 - g) <= Math.abs(a / b - 1 - g) ? b : a;
      return { value: cur * SCALE[p.unit], snippet };
    }
    const u = (m[2] || p.unit).toLowerCase();
    return { value: toNum(m[1]) * SCALE[u], snippet };
  }
  // A label can also appear in prose before the table: try each occurrence.
  const all = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g');
  for (const m of text.matchAll(all)) {
    const r = rowAt(p, text, m);
    if (r) return r;
  }
  return null;
}

function rowAt(p, text, m) {
  // Numbers after the label: skip currency signs, cell bars and percent
  // columns' signs; stop at the first word (the next row's label).
  const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 600);
  const nums = [];
  const tok = /(?:[\s|$*]|\(\d\))*(\(?-?\d[\d,]*(?:\.\d+)?\)?)(?=[\s|%MB]|$)/y;
  let t;
  let pos = 0;
  const want = p.count === 'all' ? Infinity : p.count;
  while (nums.length < want) {
    tok.lastIndex = pos;
    t = tok.exec(tail);
    if (!t) break;
    // A figure followed by "%" is a growth column: the row's values end here.
    if (/^\s*\|?\s*%/.test(tail.slice(tok.lastIndex))) break;
    nums.push(t[1]);
    pos = tok.lastIndex;
    // A trailing unit letter (155.0M) belongs to the number.
    if (/^[MB]/.test(tail.slice(pos))) pos += 1;
  }
  if (!nums.length || (want !== Infinity && nums.length < want)) return null;
  const raw = nums[p.pick < 0 ? nums.length + p.pick : p.pick];
  if (/[()-]/.test(raw)) return null;
  const label = m[0].replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return { value: toNum(raw) * SCALE[p.unit], snippet: `${label} | ${nums.join(' | ')}` };
}

/** The matched words plus the rest of their sentence (a release's own words
 *  are the receipt: "DAP was 3.64 billion on average for September 2026"). */
function snippetAt(text, i, len) {
  const rest = text.slice(i + len, i + len + 90);
  const stop = rest.search(/\.\s|\n|;|\|/);
  // A long match keeps its end, where the figure is.
  const from = Math.max(i, i + len - 200);
  const lead = from > i ? '... ' : '';
  return lead + text.slice(from, i + len + (stop < 0 ? 0 : stop)).replace(/\s*\|\s*/g, ' | ').replace(/\s+/g, ' ').trim();
}

const QN = { first: 1, second: 2, third: 3, fourth: 4 };
const MONTH_Q = { march: 1, june: 2, september: 3, december: 4 };

/** The calendar quarter a release reports on, from its own words: "quarter
 *  ended September 30, 2026", "Third Quarter 2026", "Q3 2026", "3rd quarter".
 *  Only a quarter that ended 1-80 days before the filing qualifies (results
 *  come out 3-10 weeks after quarter end), which rules out the prior-year and
 *  prior-quarter comparisons; of those, the first mention wins. Null when the
 *  release names none (a monthly metrics update, a CFO change). */
function releaseQuarter(text, filed) {
  const head = text.slice(0, 5000).replace(/\s+/g, ' ');
  const found = [];
  const scan = (re, q) => { for (const m of head.matchAll(re)) found.push({ at: m.index, q: q(m) }); };
  scan(/(?:three months|quarter) ended (March|June|September|December) 3[01],? (20\d\d)/gi, (m) => `${m[2]}-Q${MONTH_Q[m[1].toLowerCase()]}`);
  scan(/\b(first|second|third|fourth) quarter (?:and (?:full|fiscal)[- ]year |of |fiscal (?:year )?)?(20\d\d)\b/gi, (m) => `${m[2]}-Q${QN[m[1].toLowerCase()]}`);
  scan(/\bQ([1-4]) ?(?:'|FY)? ?(20\d\d)\b/g, (m) => `${m[2]}-Q${m[1]}`);
  scan(/\b([1-4]) ?(?:st|nd|rd|th) quarter (?:of )?(20\d\d)\b/gi, (m) => `${m[2]}-Q${m[1]}`);
  // A shareholder letter may name only "Q2": take the year from the filing date.
  if (!found.length) {
    const m = head.match(/\bQ([1-4])\b/);
    if (m) for (const y of [Number(filed.slice(0, 4)), Number(filed.slice(0, 4)) - 1]) found.push({ at: m.index, q: `${y}-Q${m[1]}` });
  }
  const ok = found.filter(({ q }) => {
    const [y, n] = [Number(q.slice(0, 4)), Number(q.slice(-1))];
    const end = new Date(Date.UTC(y, n * 3, 0));
    const days = (new Date(filed + 'T00:00:00Z') - end) / 86_400_000;
    return days > 0 && days <= 80;
  });
  return ok.length ? ok.sort((a, b) => a.at - b.at)[0].q : null;
}

// ── Companies and metrics ──────────────────────────────────────────────────
// Each metric: the dataset family it belongs to, the company's own name for
// it, and patterns tried in order on the release text. `from` drops quarters
// before a definition change; families are defined in FAMILIES below.

const DAU = 'company-daily-active-users';
const MAU = 'company-monthly-active-users';
const PAY = 'company-paying-users';
const ACC = 'company-active-accounts';
const BKG = 'company-bookings';
const G = String.raw`[\d.]+%`; // a growth rate in prose

const COMPANIES = [
  { name: 'Meta', cik: 1326801, form: '8-K', metrics: [
    { id: 'dap', family: DAU, label: 'Family daily active people (DAP), average for the last month of the quarter', patterns: [
      say(new RegExp(String.raw`DAP was ${NUM} (billion|million) on average for`, 'i')),
    ] },
  ] },
  { name: 'Snap', cik: 1564408, form: '8-K', metrics: [
    { id: 'dau', family: DAU, label: 'Daily active users (DAU), quarterly average', patterns: [
      row(/DAU \(in millions\)(?:\s*\(\d\))?/, -1, 'all'),
      say(new RegExp(String.raw`DAUs were ${NUM} million in Q[1-4] 20\d\d`)),
    ] },
    { id: 'mau', family: MAU, label: 'Monthly active users (MAU), quarterly average', patterns: [
      row(/MAU \(in millions\)(?:\s*\(\d\))?/, -1, 'all'),
    ] },
  ] },
  { name: 'Pinterest', cik: 1506293, form: '8-K', metrics: [
    { id: 'mau', family: MAU, label: 'Global monthly active users (MAU)', patterns: [
      say(new RegExp(String.raw`Global MAUs (?:at quarter-end )?were ${NUM} million`, 'i')),
      say(new RegExp(String.raw`(?:monthly active users|MAUs)\)? at quarter-end were ${NUM} million`, 'i')),
      say(new RegExp(String.raw`Monthly Active Users \("?MAUs"?\) (?:increased|decreased|grew|declined) ${G} year over year to ${NUM} million`, 'i')),
      say(new RegExp(String.raw`Monthly Active Users \("?MAUs"?\) were flat year over year at ${NUM} million`, 'i')),
      say(new RegExp(String.raw`Monthly Active Users \("?MAUs"?\) were flat quarter over quarter and (?:increased|decreased) ${G} year over year to ${NUM} million`, 'i')),
      say(new RegExp(String.raw`global Monthly Active Users \(MAUs\) (?:increased|decreased|grew|declined) ${G} year over year to ${NUM} million`, 'i')),
      say(new RegExp(String.raw`monthly active users reached an all-time high of ${NUM} million`, 'i')),
    ] },
  ] },
  { name: 'Reddit', cik: 1713445, form: '8-K', metrics: [
    { id: 'dauq', family: DAU, label: 'Daily active uniques (DAUq), quarterly average', patterns: [
      say(new RegExp(String.raw`Daily Active Uniques \("?DAUq"?\) (?:increased|decreased|grew) ${G} (?:year-over-year )?to ${NUM} million`, 'i')),
      row(/DAUq: Global/, 0, 2),
    ] },
  ] },
  { name: 'Duolingo', cik: 1562088, form: '8-K', metrics: [
    // From Q3 2023 the letter carries a key-metrics table: "(prior) (current) (YoY %)".
    { id: 'dau', family: DAU, label: 'Daily active users (DAU), quarterly average', patterns: [
      pair(new RegExp(String.raw`Daily active users \(DAUs\)(?: \(\d\))? ${NUM} ${NUM} (\(?\d+\)? ?%)`)),
      say(new RegExp(String.raw`Daily active users \(DAUs\) (?:were|grew ${G} (?:year-over-year )?to) ${NUM} million`, 'i')),
    ] },
    { id: 'mau', family: MAU, label: 'Monthly active users (MAU), average of the months in the quarter', patterns: [
      pair(new RegExp(String.raw`Monthly active users \(MAUs\)(?: \(\d\))? ${NUM} ${NUM} (\(?\d+\)? ?%)`)),
      say(new RegExp(String.raw`MAUs were [\d.]+ million and ${NUM} million (?:for the three months ended|the three months ended|as of)`)),
      say(new RegExp(String.raw`Monthly active users \(MAUs\) (?:were|grew ${G} (?:year-over-year )?to) ${NUM} million`, 'i')),
    ] },
    { id: 'paid', family: PAY, label: 'Paid subscribers at quarter end', patterns: [
      pair(new RegExp(String.raw`Paid subscribers \(period end\) ${NUM} ${NUM} (\(?\d+\)? ?%)`)),
      say(new RegExp(String.raw`Paid Subscribers totaled ${NUM} million`, 'i')),
    ] },
  ] },
  { name: 'Roblox', cik: 1315098, form: '8-K', metrics: [
    { id: 'dau', family: DAU, label: 'Daily active users (DAU), quarterly average', patterns: [
      say(new RegExp(String.raw`Average DAUs: ${NUM}(M)\b`)),
      say(new RegExp(String.raw`Daily Active Users \("?DAUs"?\) were ${NUM} million`, 'i')),
      say(new RegExp(String.raw`DAUs\)? grew ${G} (?:year-over-? ?year|quarter-over-quarter) to ?${NUM} million`, 'i')),
    ] },
  ] },
  { name: 'Spotify', cik: 1639920, form: '6-K', metrics: [
    { id: 'mau', family: MAU, label: 'Monthly active users (MAU) at quarter end', patterns: [
      say(new RegExp(String.raw`Total Monthly Active Users \("?MAUs"?\) [\d,.]+ [\d,.]+ ${NUM}\b`)),
      say(new RegExp(String.raw`Total MAUs (?:grew|increased|declined|decreased) ${G} Y/Y to ${NUM} million`, 'i')),
      say(new RegExp(String.raw`\bMAUs (?:grew|increased|declined|decreased) ${G} Y/Y to ${NUM} million`, 'i')),
      // The Q3 2022 letter's HTML lost its "fi"/"l"/"i" glyphs: "456 m on".
      say(new RegExp(String.raw`Tota MAUs grew ${G} Y/Y to ${NUM} m on`)),
    ] },
    { id: 'premium', family: PAY, label: 'Premium subscribers at quarter end', patterns: [
      say(new RegExp(String.raw`(?<=USERS \(M\)[\s\S]{0,120}?)Premium Subscribers [\d,.]+ [\d,.]+ ${NUM}\b`)),
      say(new RegExp(String.raw`Premium Subscribers (?:grew|increased|declined|decreased) (?:${G} Y/Y )?to ${NUM} million`, 'i')),
      say(new RegExp(String.raw`(?:We finished Q[1-4] with|We ended the year with|At the end of Q[1-4] ?'?\d* we had) ${NUM} million Premium Subscribers globally`, 'i')),
      say(new RegExp(String.raw`Prem um Subscr bers grew ${G} Y/Y to ${NUM} m on`)),
    ] },
  ] },
  { name: 'Uber', cik: 1543151, form: '8-K', metrics: [
    { id: 'mapc', family: MAU, label: 'Monthly active platform consumers (MAPCs), quarterly average', patterns: [
      row(/Monthly Active Platform Consumers \("MAPCs"\)/, 1, 2),
    ] },
    { id: 'trips', family: BKG, label: 'Trips (Mobility rides and Delivery orders)', patterns: [
      row(/\n\s*Trips\s*(?=\n?\s*\|)/, 1, 2),
    ] },
  ] },
  { name: 'Airbnb', cik: 1559720, form: '8-K', metrics: [
    { id: 'nights', family: BKG, label: 'Nights and experiences booked (from Q2 2025: nights and seats booked)', patterns: [
      // Key Business Metrics table: "Three Months Ended ... 2025 2026 Nights and
      // Seats Booked 143.1M 156.2M": the second figure is the quarter's own.
      say(new RegExp(String.raw`Months Ended [A-Za-z0-9 ]{0,60}?20\d\d 20\d\d (?:20\d\d 20\d\d )?Nights and (?:Experiences|Seats) Booked [\d.]+ ?M ${NUM} ?(M)`)),
      say(new RegExp(String.raw`(?:In|During) Q[1-4] 20\d\d, (?:Airbnb delivered|we had) ${NUM} million Nights and Experiences Booked`)),
      say(new RegExp(String.raw`Nights and Experiences Booked of ${NUM} million`)),
    ] },
  ] },
  { name: 'PayPal', cik: 1633917, form: '8-K', metrics: [
    { id: 'accounts', family: ACC, label: 'Active accounts (transacted in the past 12 months) at quarter end', patterns: [
      // Five-quarter table, current quarter first: "(In millions, except percentages) Active accounts (1) 439 438 ..."
      say(new RegExp(String.raw`\(In millions, except percentages\) Active accounts ?\(1\) ${NUM}\b`)),
      say(new RegExp(String.raw`Active accounts (?:increased|decreased|grew|declined) ${G}(?:, or by [\d.]+ million,)? to ${NUM} million`, 'i')),
      say(new RegExp(String.raw`\b${NUM} million total active accounts`, 'i')),
      say(new RegExp(String.raw`total active accounts to ${NUM} million`, 'i')),
      say(new RegExp(String.raw`ended the quarter with ${NUM} million active accounts`, 'i')),
      say(new RegExp(String.raw`\b${NUM} million active accounts`, 'i')),
      say(new RegExp(String.raw`active accounts of ${NUM} million`, 'i')),
    ] },
  ] },
  { name: 'Robinhood', cik: 1783879, form: '8-K', metrics: [
    { id: 'funded', family: ACC, label: 'Funded customers at quarter end (named Net Cumulative Funded Accounts before Q4 2023, same calculation)', patterns: [
      say(new RegExp(String.raw`(?:Net Cumulative Funded Accounts|Funded Customers)(?: \(previously[^)]*\))? (?:increased|decreased|grew|declined)[\s\S]{0,80}? to ${NUM} million`)),
      say(new RegExp(String.raw`Net Cumulative Funded Accounts were ${NUM} million`)),
    ] },
  ] },
  // Its Q1 2023 release was filed under items 7.01/8.01, not 2.02.
  { name: 'Match Group', cik: 891103, form: '8-K', items: /\b(?:2\.02|7\.01)\b/, metrics: [
    { id: 'payers', family: PAY, label: 'Payers, average of the monthly values in the quarter', from: '2021-Q2', patterns: [
      row(/Total Payers/, 0, 2, 'thousand'),
      // From Q4 2024 the total-company table comes first: "... Margin 38 % 42 % Payers 14,607 15,186 (4) %".
      say(new RegExp(String.raw`Margin \d+ ?% \d+ ?% (?:\d+ ?% \d+ ?% )?Payers ${NUM} [\d,]+ \(?\d+\)? ?%`), 'thousand'),
      say(new RegExp(String.raw`Match Group(?:'s)? Total Revenue was [\s\S]{0,200}? Payers (?:declined|increased|grew) ${G} to ${NUM} million`)),
    ] },
  ] },
  { name: 'DoorDash', cik: 1792789, form: '8-K', metrics: [
    { id: 'orders', family: BKG, label: 'Total orders', patterns: [
      say(new RegExp(String.raw`Total Orders (?:grew|increased|decreased) ${G} (?:year over year |Y/Y )?to ${NUM} (million|billion)`, 'i')),
      row(/Total Orders/, -1, 'all'),
    ] },
  ] },
  { name: 'Bumble', cik: 1830043, form: '8-K', metrics: [
    { id: 'payers', family: PAY, label: 'Total paying users, quarterly average', patterns: [
      row(/Total Paying Users\*?/i, 0, 2, 'thousand'),
    ] },
  ] },
  { name: 'Booking Holdings', cik: 1075531, form: '8-K', metrics: [
    { id: 'roomnights', family: BKG, label: 'Room nights booked', patterns: [
      say(new RegExp(String.raw`Room Nights ${NUM}(M) ${G}`)),
      // Through Q3 2024: a nine-quarter "Units Sold" table, the last column the quarter's own.
      say(new RegExp(String.raw`Units Sold (?:[1-4]Q\d\d ){8}[1-4]Q\d\d Room Nights (?:[\d,.]+ ){8}${NUM}`)),
      say(new RegExp(String.raw`Units Sold (?:[1-4]Q\d\d ){7}4Q\d\d FY 20\d\d FY 20\d\d Room Nights (?:[\d,.]+ ){7}${NUM}`)),
    ] },
  ] },
];

// ── Dataset families ────────────────────────────────────────────────────────

const SOURCE = { source: 'SEC EDGAR — company earnings releases (8-K / 6-K exhibits)', license: 'Public information on sec.gov (SEC website dissemination policy)', url: RAW_URL };
const METHOD = 'Each value is read from the company\'s own earnings release for that quarter (exhibit 99.x to its 8-K, or 6-K for Spotify) on SEC EDGAR, as first reported: later restatements are not applied. Periods are calendar quarters (every company here has a December year end). Values in millions; a release that rounds (Roblox from Q4 2025, Match Group Q3 2026) is kept as rounded. The filing URL and the exact words or table row of every value are in data/raw/company-metrics/observations.csv.';

/** "Meta 2019-Q4–2026-Q3, Snap 2019-Q1–2026-Q3": who is in a dataset and from when. */
function coverage(data) {
  const span = new Map();
  for (const o of data) {
    const s = span.get(o.entity) ?? { from: o.period, to: o.period };
    if (o.period < s.from) s.from = o.period;
    if (o.period > s.to) s.to = o.period;
    span.set(o.entity, s);
  }
  return [...span.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([e, s]) => `${e} ${s.from}–${s.to}`).join('; ');
}

/** Earliest and latest quarter in a dataset, for the period note. */
const range = (data) => { const p = data.map((o) => o.period).sort(); return `${p[0]} to ${p.at(-1)}`; };

const FAMILIES = {
  [DAU]: {
    meta: (data) => ({
      title: 'Daily Active Users of Internet Companies',
      valueLabel: 'Daily active users, as each company defines them (millions)',
      unit: 'million', changeMode: 'pct', topic: 'economy',
      summary: `Daily active users reported by listed internet companies in their quarterly earnings releases filed with the SEC, in millions. Each company counts its own way: Meta reports Family daily active people (DAP: people using Facebook, Instagram, Messenger or WhatsApp on a day, averaged over the last month of the quarter); Snap, Roblox and Duolingo average daily active users over the quarter; Reddit reports daily active uniques (DAUq, logged-in or not). Snap added web visits to its DAU in Q1 2024 and calls the effect immaterial; it has said that from Q1 2027 it will report monthly instead of daily users. Not included: Facebook-app DAU and MAU, which Meta stopped reporting after Q4 2023. Coverage: ${coverage(data)}.`,
      vintage: `Calendar quarters, ${range(data)}; each company from its first release in the period`,
      method: METHOD, ...SOURCE,
    }),
  },
  [MAU]: {
    meta: (data) => ({
      title: 'Monthly Active Users of Internet Companies',
      valueLabel: 'Monthly active users, as each company defines them (millions)',
      unit: 'million', changeMode: 'pct', topic: 'economy',
      summary: `Monthly active users reported by listed internet companies in their quarterly earnings releases filed with the SEC, in millions. Pinterest and Spotify report users at quarter end; Snap and Duolingo average the months of the quarter; Uber reports monthly active platform consumers (MAPCs: people who took a ride or received a delivery in a month, averaged over the quarter). Snap's MAU starts in Q2 2025, the first release whose table carries it. Not included: Meta's Family monthly active people and Facebook monthly active users, reported only until Q4 2023. Coverage: ${coverage(data)}.`,
      vintage: `Calendar quarters, ${range(data)}; each company from its first release in the period`,
      method: METHOD, ...SOURCE,
    }),
  },
  [PAY]: {
    meta: (data) => ({
      title: 'Paying Users of Internet Companies',
      valueLabel: 'Paying users or paid subscribers, as each company defines them (millions)',
      unit: 'million', changeMode: 'pct', topic: 'economy',
      summary: `Paying users reported by listed consumer-subscription companies in their quarterly earnings releases filed with the SEC, in millions. Spotify premium subscribers and Duolingo paid subscribers are counted at quarter end; Match Group payers (unique payers per brand in a month) and Bumble total paying users are averages over the quarter. Match Group starts in Q2 2021, when it replaced "average subscribers" with payers, a different measure. Not included: Netflix paid memberships, which Netflix stopped reporting from Q1 2025. Coverage: ${coverage(data)}.`,
      vintage: `Calendar quarters, ${range(data)}; each company from its first release in the period`,
      method: METHOD, ...SOURCE,
    }),
  },
  [ACC]: {
    meta: (data) => ({
      title: 'Active Accounts at PayPal and Robinhood',
      valueLabel: 'Active accounts or funded customers at quarter end (millions)',
      unit: 'million', changeMode: 'pct', topic: 'economy',
      summary: `Customer accounts reported by listed fintech companies in their quarterly earnings releases filed with the SEC, in millions, at quarter end. PayPal active accounts are accounts that made a transaction in the past 12 months; Robinhood funded customers are people with a funded account or a transaction in the past 45 days (called net cumulative funded accounts until Q4 2023, same calculation). Not included: Etsy active buyers, whose consolidated count changed with acquisitions and divestitures (Reverb, Depop, Elo7) and whose releases from 2026 no longer state the level. Coverage: ${coverage(data)}.`,
      vintage: `Calendar quarters, ${range(data)}; each company from its first release in the period`,
      method: METHOD, ...SOURCE,
    }),
  },
  [BKG]: {
    meta: (data) => ({
      title: 'Trips, Orders and Nights Booked',
      valueLabel: 'Units booked in the quarter: trips, orders or nights (millions)',
      unit: 'million', changeMode: 'pct', topic: 'economy',
      summary: `Transactions per quarter reported by listed travel and delivery platforms in their earnings releases filed with the SEC, in millions: Uber trips (rides and delivery orders), DoorDash total orders, Airbnb nights and experiences booked, and Booking Holdings room nights. The units differ, so compare each company with itself over time. DoorDash includes Wolt from Q2 2022 and Deliveroo from Q4 2025; Airbnb renamed its measure "nights and seats booked" in Q2 2025 when it added services, with the prior-year figures unchanged. Uber later revised a few 2020 trip counts slightly (Q3 2020: 1,150 million first reported, 1,184 million a year later); the first-reported figure is kept. Coverage: ${coverage(data)}.`,
      vintage: `Calendar quarters, ${range(data)}; each company from its first release in the period`,
      method: METHOD, ...SOURCE,
    }),
  },
};

// ── CSV I/O ────────────────────────────────────────────────────────────────

const OBS_COLS = ['company', 'metric', 'quarter', 'value_millions', 'as_reported', 'form', 'filed', 'accession', 'url'];
const FIL_COLS = ['company', 'form', 'filed', 'accession', 'quarter', 'status'];

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (cols, rows) => [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';

async function readCsv(path) {
  try { return [...parseCsvObjects(await readFile(path, 'utf8'))]; } catch { return []; }
}

// ── Fetch ──────────────────────────────────────────────────────────────────

async function readFiling(co, f) {
  const docs = await filingDocs(co.cik, f.accession);
  const exhibits = docs.filter((d) => /^EX-99/i.test(d.type) && /\.html?$/i.test(d.name));
  const texts = [];
  for (const d of exhibits) texts.push({ url: d.url, text: htmlToText(await fetchDoc(d.url)) });
  return texts;
}

/** Examine one filing: its quarter, and each metric's value if present. */
async function examine(co, f) {
  const texts = await readFiling(co, f);
  if (!texts.length) return { quarter: '', status: 'no EX-99 exhibit', obs: [] };
  const quarter = texts.map((t) => releaseQuarter(t.text, f.filed)).find(Boolean) ?? '';
  if (!quarter) return { quarter, status: 'not a quarterly results release', obs: [] };
  if (quarter < FIRST_Q) return { quarter, status: `before ${FIRST_Q}`, obs: [] };
  const obs = [];
  for (const met of co.metrics) {
    if (met.from && quarter < met.from) continue;
    if (met.until && quarter > met.until) continue;
    let hit = null;
    for (const t of texts) {
      for (const p of met.patterns) {
        const r = tryPattern(p, t.text);
        if (r) { hit = { ...r, url: t.url }; break; }
      }
      if (hit) break;
    }
    if (!hit) continue;
    obs.push({
      company: co.name, metric: met.id, quarter, value_millions: round(hit.value, 3), as_reported: hit.snippet,
      form: f.form, filed: f.filed, accession: f.accession, url: hit.url,
    });
  }
  return { quarter, status: obs.length ? `ok: ${obs.map((o) => o.metric).join(' ')}` : 'no metric matched', obs };
}

async function fetchNew(obsRows, filRows) {
  const seen = new Set(filRows.map((r) => r.accession));
  const refetch = args.has('--refetch');
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).toLowerCase();
  if (refetch) {
    // Re-read the chosen companies' filings from scratch.
    const keep = (r) => only && !r.company.toLowerCase().includes(only);
    const o = obsRows.filter(keep), f = filRows.filter(keep);
    obsRows.length = 0; obsRows.push(...o);
    filRows.length = 0; filRows.push(...f);
    seen.clear();
    for (const r of filRows) seen.add(r.accession);
  }
  let added = 0;
  for (const co of COMPANIES.filter((c) => !only || c.name.toLowerCase().includes(only))) {
    let filings;
    try { filings = await listFilings(co.cik, SINCE); } catch (e) { console.warn(`  – ${co.name}: ${e.message}; kept what we have.`); continue; }
    const todo = filings.filter((f) => f.form === co.form && (co.form !== '8-K' || (co.items ?? /\b2\.02\b/).test(f.items)) && !seen.has(f.accession));
    for (const f of todo.sort((a, b) => a.filed.localeCompare(b.filed))) {
      let res;
      try { res = await examine(co, f); } catch (e) { console.warn(`  – ${co.name} ${f.accession}: ${e.message}`); continue; }
      filRows.push({ company: co.name, form: f.form, filed: f.filed, accession: f.accession, quarter: res.quarter, status: res.status });
      obsRows.push(...res.obs);
      added += res.obs.length;
      if (args.has('--audit')) {
        console.log(`  ${co.name} ${f.filed} ${f.accession} ${res.quarter || '-'}: ${res.status}`);
        for (const o of res.obs) console.log(`    ${o.metric} ${o.quarter} = ${o.value_millions}  « ${o.as_reported} »`);
      }
    }
  }
  return added;
}

// ── Checks ─────────────────────────────────────────────────────────────────

const nextQ = (q) => { const y = Number(q.slice(0, 4)), n = Number(q.slice(-1)); return n === 4 ? `${y + 1}-Q1` : `${y}-Q${n + 1}`; };

/** One value per company x metric x quarter: where two releases speak for the
 *  same quarter (a preliminary release, then the full one), the later one wins. */
function dedupe(rows) {
  const best = new Map();
  for (const r of rows) {
    const k = `${r.company}|${r.metric}|${r.quarter}`;
    const cur = best.get(k);
    if (!cur || r.filed > cur.filed) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => a.company.localeCompare(b.company) || a.metric.localeCompare(b.metric) || a.quarter.localeCompare(b.quarter));
}

/** Gaps, implausible jumps and series that stop short of the company's latest
 *  release (a new layout the patterns miss, or a metric dropped), printed for a
 *  human to look at. */
function check(rows, filings) {
  const series = new Map();
  for (const r of rows) {
    const k = `${r.company} ${r.metric}`;
    (series.get(k) ?? series.set(k, []).get(k)).push(r);
  }
  let problems = 0;
  for (const [k, rs] of series) {
    for (let i = 1; i < rs.length; i++) {
      if (rs[i].quarter !== nextQ(rs[i - 1].quarter)) { console.warn(`  ! ${k}: gap ${rs[i - 1].quarter} → ${rs[i].quarter}`); problems++; }
      const ratio = Number(rs[i].value_millions) / Number(rs[i - 1].value_millions);
      if (ratio > 1.5 || ratio < 0.67) { console.warn(`  ! ${k}: jump ${rs[i - 1].quarter} ${rs[i - 1].value_millions} → ${rs[i].quarter} ${rs[i].value_millions}`); problems++; }
    }
  }
  const latest = new Map();
  for (const f of filings) if (f.quarter >= FIRST_Q && f.quarter > (latest.get(f.company)?.quarter ?? '')) latest.set(f.company, f);
  for (const [k, rs] of series) {
    const co = rs[0].company, f = latest.get(co), last = rs.at(-1).quarter;
    if (f && f.quarter > last) { console.warn(`  ! ${k}: no value for ${f.quarter} (filing ${f.accession}, ${f.status}); last value ${last}`); problems++; }
  }
  return problems;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(RAW, { recursive: true });
  let obsRows = await readCsv(OBS_CSV);
  const filRows = await readCsv(FIL_CSV);

  if (!args.has('--offline')) {
    try {
      const n = await fetchNew(obsRows, filRows);
      console.log(`  company metrics: ${n} new values from EDGAR`);
    } catch (e) {
      console.warn(`  – EDGAR unavailable (${e.message}); building from the committed CSV.`);
    }
  }

  obsRows = dedupe(obsRows);
  filRows.sort((a, b) => a.company.localeCompare(b.company) || a.filed.localeCompare(b.filed));
  check(obsRows, filRows);
  await writeFile(OBS_CSV, toCsv(OBS_COLS, obsRows));
  await writeFile(FIL_CSV, toCsv(FIL_COLS, filRows));

  const metricOf = new Map(COMPANIES.flatMap((c) => c.metrics.map((m) => [`${c.name}|${m.id}`, { co: c, m }])));
  for (const [slug, fam] of Object.entries(FAMILIES)) {
    const data = obsRows
      .filter((r) => metricOf.get(`${r.company}|${r.metric}`)?.m.family === slug)
      .map((r) => ({ entity: r.company, group: r.company, period: r.quarter, value: round(Number(r.value_millions), 3) }));
    if (!data.length) { console.warn(`  – ${slug}: no rows`); continue; }
    await writeDataset('macro', slug, { ...fam.meta(data), entityType: 'company', parsedAt: PARSED }, data);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
