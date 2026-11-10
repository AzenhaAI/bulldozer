/**
 * Bank of Russia (cbr.ru) → Russia-only monthly macro series.
 *
 * Single country, like the RLMS trends (parse_rlms_trends.mjs): every row is
 * Russia, periods are months ("2026-09"). Rosstat's own site does not answer
 * from outside Russia and fedstat.ru refuses foreign requests, so these come
 * from the central bank's open endpoints, which do:
 *
 *   cbr-key-rate                 DailyInfo web service (SOAP KeyRateXML), daily → rate in force at month end
 *   cbr-inflation                "Inflation and key rate" table (hd_base/infl): CPI, % y/y (Rosstat's CPI, as the bank republishes it)
 *   cbr-inflation-expectations   monthly household survey workbook (inFOM for the Bank of Russia): median expected inflation, next 12 months
 *   cbr-usd-rub                  data service (dataservice/data, publication 33, dataset 128): average official rate in the month
 *   cbr-m2-growth                monetary aggregates workbook (monetary_agg.xlsx): M2, % change on a year earlier
 *
 * Cross-checks before writing: the key-rate column of the inflation table must
 * equal the month-end rate from the web service for every month both carry.
 *
 * Russian labels are matched through \u escapes (repo policy: ASCII-only sources).
 *
 *   node scripts/parse_cbr.mjs
 */
import { writeDataset, round } from './lib/datasets.mjs';
import { xlsxRows, xlsxSheetNames } from './lib/xlsx.mjs';

const CBR = 'https://www.cbr.ru';
const parsedAt = new Date().toISOString().slice(0, 10);
const thisMonth = parsedAt.slice(0, 7);
const COMMON = {
  source: 'Bank of Russia',
  // Bank of Russia User Agreement (https://www.cbr.ru/eng/user_agreement/), read 2026-11-10:
  // "The link to the Website is mandatory when quoting any materials from the Website".
  license: 'Bank of Russia website User Agreement — quoting requires a link to cbr.ru (https://www.cbr.ru/eng/user_agreement/)',
  parsedAt,
};
const RU = (period, value) => ({ entity: 'Russia', group: 'Europe', period, value, iso: 'RUS' });

const MONTHS_RU = ['\u042f\u043d\u0432\u0430\u0440\u044c', '\u0424\u0435\u0432\u0440\u0430\u043b\u044c', '\u041c\u0430\u0440\u0442',
  '\u0410\u043f\u0440\u0435\u043b\u044c', '\u041c\u0430\u0439', '\u0418\u044e\u043d\u044c', '\u0418\u044e\u043b\u044c',
  '\u0410\u0432\u0433\u0443\u0441\u0442', '\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c', '\u041e\u043a\u0442\u044f\u0431\u0440\u044c',
  '\u041d\u043e\u044f\u0431\u0440\u044c', '\u0414\u0435\u043a\u0430\u0431\u0440\u044c'];
const pad = (n) => String(n).padStart(2, '0');
const excelMonth = (serial) => new Date(Date.UTC(1899, 11, 30) + serial * 864e5).toISOString().slice(0, 7);
const num = (s) => Number(String(s).trim().replace(/\s/g, '').replace(',', '.'));

async function get(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

/** Daily key rate → the rate in force on the last published day of each complete month. */
async function keyRate() {
  const body = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><KeyRateXML xmlns="http://web.cbr.ru/"><fromDate>2013-09-01</fromDate><ToDate>${parsedAt}</ToDate></KeyRateXML></soap12:Body></soap12:Envelope>`;
  const xml = await (await get(`${CBR}/DailyInfoWebServ/DailyInfo.asmx`, {
    method: 'POST', headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' }, body,
  })).text();
  const days = [...xml.matchAll(/<DT>(\d{4}-\d{2}-\d{2})T[^<]*<\/DT><Rate>([\d.]+)<\/Rate>/g)].map((m) => [m[1], Number(m[2])]);
  if (days.length < 1000) throw new Error(`key rate: only ${days.length} days returned`);
  const eom = new Map();
  for (const [d, r] of days.sort((a, b) => a[0].localeCompare(b[0]))) eom.set(d.slice(0, 7), r);
  eom.delete(thisMonth); // a month still running has no month-end rate yet
  return eom;
}

/** "Inflation and key rate" table: MM.YYYY | key rate | CPI % y/y | target. */
async function inflationTable() {
  const html = await (await get(`${CBR}/hd_base/infl/?UniDbQuery.Posted=True&UniDbQuery.From=01.09.2013&UniDbQuery.To=${parsedAt.split('-').reverse().join('.')}`)).text();
  const rows = [...html.matchAll(/<tr>\s*<td>(\d\d)\.(\d{4})<\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g)]
    .map((m) => ({ period: `${m[2]}-${m[1]}`, key: num(m[3]), cpi: num(m[4]) }));
  if (rows.length < 100) throw new Error(`inflation table: only ${rows.length} rows`);
  return rows;
}

/** Newest monthly household-survey workbook → median expected inflation, next 12 months. */
async function expectations() {
  const page = await (await get(`${CBR}/analytics/dkp/inflationary_expectations/`)).text();
  const links = [...page.matchAll(/href="(\/Collection\/Collection\/File\/\d+\/Infl_exp_(\d\d)-(\d\d)\.xlsx)"/g)]
    .sort((a, b) => (a[2] + a[3]).localeCompare(b[2] + b[3]));
  if (!links.length) throw new Error('expectations: no workbook link on the page');
  const href = links.at(-1)[1];
  const buf = Buffer.from(await (await get(CBR + href)).arrayBuffer());
  const sheet = xlsxSheetNames(buf).find((n) => n.trim() === '\u0414\u0430\u043d\u043d\u044b\u0435 \u0437\u0430 \u0432\u0441\u0435 \u0433\u043e\u0434\u044b'); // "data for all years"
  if (!sheet) throw new Error('expectations: all-years sheet missing');
  const rows = xlsxRows(buf, sheet);
  const dates = rows.find((r) => r.length > 50 && r.slice(1).every((v) => v == null || typeof v === 'number'));
  // "Direct estimates of annual inflation: median values", then the "expected inflation" row under it.
  const h = rows.findIndex((r) => String(r[0] ?? '').startsWith('\u041f\u0440\u044f\u043c\u044b\u0435 \u043e\u0446\u0435\u043d\u043a\u0438 \u0433\u043e\u0434\u043e\u0432\u043e\u0439 \u0438\u043d\u0444\u043b\u044f\u0446\u0438\u0438'));
  const row = rows.slice(h + 1, h + 4).find((r) => String(r[0] ?? '').startsWith('\u043e\u0436\u0438\u0434\u0430\u0435\u043c\u0430\u044f \u0438\u043d\u0444\u043b\u044f\u0446\u0438\u044f'));
  if (!dates || h < 0 || !row) throw new Error('expectations: median row not found');
  const out = [];
  for (let j = 1; j < dates.length; j++) {
    if (typeof dates[j] !== 'number' || typeof row[j] !== 'number') continue;
    out.push(RU(excelMonth(dates[j]), round(row[j], 1)));
  }
  return { out, href };
}

/** Average official US dollar rate in each month (data service). */
async function usdRub() {
  const y2 = parsedAt.slice(0, 4);
  const d = await (await get(`${CBR}/dataservice/data?y1=2005&y2=${y2}&publicationId=33&datasetId=128`)).json();
  const usd = d.headerData.find((h) => h.elname === '\u0414\u043e\u043b\u043b\u0430\u0440\u0430 \u0421\u0428\u0410 \u043a \u0440\u0443\u0431\u043b\u044e'); // "US dollar to ruble"
  if (!usd) throw new Error('usd/rub: US dollar column missing');
  const out = [];
  for (const r of d.RawData) {
    if (r.element_id !== usd.id || r.periodicity !== 'month' || r.obs_val == null) continue;
    // dt is the month the average covers ("<month name> 2025"); `date` is the 1st of the next month.
    const m = String(r.dt).trim().match(/^(\S+)\s+(\d{4})$/);
    const mi = m ? MONTHS_RU.indexOf(m[1]) : -1;
    if (mi < 0) throw new Error(`usd/rub: unreadable period "${r.dt}"`);
    out.push(RU(`${m[2]}-${pad(mi + 1)}`, round(r.obs_val, 2)));
  }
  return out.sort((a, b) => a.period.localeCompare(b.period));
}

/** M2 (national definition), % change on a year earlier, as of the 1st of each month. */
async function m2Growth() {
  const buf = Buffer.from(await (await get(`${CBR}/vfs/statistics/credit_statistics/monetary_agg.xlsx`)).arrayBuffer());
  const sheet = xlsxSheetNames(buf).find((n) => n.trim() === '\u0413\u043e\u0434\u043e\u0432\u044b\u0435 \u0442\u0435\u043c\u043f\u044b \u043f\u0440\u0438\u0440\u043e\u0441\u0442\u0430'); // "annual growth rates"
  if (!sheet) throw new Error('M2: annual-growth sheet missing');
  const rows = xlsxRows(buf, sheet);
  const dates = rows[0];
  const row = rows.find((r) => String(r[0] ?? '').replace(/\*/g, '').trim() === '\u0414\u0435\u043d\u0435\u0436\u043d\u044b\u0439 \u0430\u0433\u0440\u0435\u0433\u0430\u0442 \u041c2');
  if (!row) throw new Error('M2: row missing');
  const out = [];
  for (let j = 1; j < dates.length; j++) {
    if (typeof dates[j] !== 'number' || typeof row[j] !== 'number') continue;
    out.push(RU(excelMonth(dates[j]), row[j]));
  }
  return out;
}

async function step(name, fn) {
  try { return await fn(); } catch (e) { console.error(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; return null; }
}

async function main() {
  const eom = await step('key rate', keyRate);
  const table = await step('inflation table', inflationTable);

  if (eom) {
    const off = (table ?? []).filter((r) => eom.has(r.period) && eom.get(r.period) !== r.key);
    if (off.length) {
      console.error(`  ✗ cbr-key-rate: month-end rate disagrees with the inflation table for ${off.map((r) => r.period).join(', ')} — not written`);
      process.exitCode = 1;
    } else await writeDataset('macro', 'cbr-key-rate', {
      title: 'Key Rate (Russia)', valueLabel: 'Bank of Russia key rate in force at month end', unit: '% per year', changeMode: 'pp', topic: 'economy',
      summary: 'The Bank of Russia’s key policy rate, as in force on the last day of each month, since it was introduced in September 2013.',
      url: `${CBR}/eng/hd_base/KeyRate/`, ...COMMON,
    }, [...eom].map(([p, v]) => RU(p, v)));
  }

  if (table) await writeDataset('macro', 'cbr-inflation', {
    title: 'Consumer Price Inflation (Russia)', valueLabel: 'Consumer prices, % change on the same month a year earlier', unit: '%', changeMode: 'pp', topic: 'economy',
    summary: 'Annual consumer price inflation in Russia, month by month. Rosstat’s consumer price index as published by the Bank of Russia in its inflation and key rate table.',
    url: `${CBR}/hd_base/infl/`, ...COMMON,
  }, table.map((r) => RU(r.period, r.cpi)).sort((a, b) => a.period.localeCompare(b.period)));

  const exp = await step('inflation expectations', expectations);
  if (exp) await writeDataset('macro', 'cbr-inflation-expectations', {
    title: 'Household Inflation Expectations (Russia)', valueLabel: 'Median inflation households expect over the next 12 months', unit: '%', changeMode: 'pp', topic: 'economy',
    summary: 'What Russian households expect prices to do over the next year: the median of respondents’ own numeric estimates, from the monthly survey that inFOM runs for the Bank of Russia.',
    url: `${CBR}/eng/analytics/dkp/inflation_expectations/`, ...COMMON,
  }, exp.out);

  const fx = await step('usd/rub', usdRub);
  if (fx) await writeDataset('macro', 'cbr-usd-rub', {
    title: 'Ruble per US Dollar (Russia)', valueLabel: 'Official ruble rate per US dollar, average for the month', unit: 'RUB per US$', changeMode: 'pct', topic: 'economy',
    summary: 'The Bank of Russia’s official exchange rate of the ruble against the US dollar, averaged over each month. A higher number means a weaker ruble.',
    url: `${CBR}/eng/statistics/macro_itm/external_sector/er/`, ...COMMON,
  }, fx);

  const m2 = await step('M2', m2Growth);
  if (m2) await writeDataset('macro', 'cbr-m2-growth', {
    title: 'Money Supply Growth, M2 (Russia)', valueLabel: 'Ruble money supply M2, % change on a year earlier', unit: '%', changeMode: 'pp', topic: 'economy',
    summary: 'Annual growth of Russia’s ruble money supply (M2, national definition: cash in circulation plus ruble deposits), as published by the Bank of Russia.',
    url: `${CBR}/eng/statistics/macro_itm/dkfs/`, ...COMMON,
  }, m2);
}
main();
