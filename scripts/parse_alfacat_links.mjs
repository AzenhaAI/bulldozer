/**
 * Links to AlfaCat, the sister site for end-of-day market data
 * (azenha.ai/alfacat): for each country, its main stock index, its largest
 * listed companies and its currency pair against the dollar.
 *
 *   node scripts/parse_alfacat_links.mjs
 *
 * Reads AlfaCat's published universe (azenha.ai/alfacat/data/universe.json)
 * and writes src/data/alfacat.json, used by the weekly economy table and the
 * country profiles. AlfaCat links back to BullDozer from its ticker pages.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './lib/datasets.mjs';

const URL_UNIVERSE = 'https://azenha.ai/alfacat/data/universe.json';
const OUT = join(ROOT, 'src', 'data', 'alfacat.json');

// Exchange suffix of a listing → country.
const SUFFIX = {
  '.T': 'JPN', '.KS': 'KOR', '.L': 'GBR', '.HK': 'HKG', '.TO': 'CAN', '.AX': 'AUS', '.NS': 'IND', '.DE': 'DEU',
  '.MI': 'ITA', '.PA': 'FRA', '.MC': 'ESP', '.SI': 'SGP', '.ST': 'SWE', '.AS': 'NLD', '.SW': 'CHE', '.BR': 'BEL',
};
// The country's benchmark on AlfaCat (the S&P 500 through its ETF).
const INDEX = { USA: 'SPY', GBR: 'FTSE100', HKG: 'HSI', JPN: 'N225', DEU: 'DAX', EA: 'STOXX50', CHN: 'SHCOMP' };
// Currency pairs on AlfaCat; `inverse` when it is quoted as dollars per unit.
const FX = {
  EUR: ['EURUSD', true], JPY: ['USDJPY'], GBP: ['GBPUSD', true], AUD: ['AUDUSD', true], CAD: ['USDCAD'], CHF: ['USDCHF'],
  CNY: ['USDCNY'], HKD: ['USDHKD'], INR: ['USDINR'], SEK: ['USDSEK'], RUB: ['USDRUB'],
};

function countryOf(x) {
  if (x.class === 'moex') return 'RUS';
  if (x.class === 'us-stock') return 'USA';
  if (!/-stock$/.test(x.class)) return null;
  const m = x.symbol.match(/\.[A-Z]+$/);
  return m ? SUFFIX[m[0]] ?? null : null;
}

async function main() {
  let universe;
  try {
    const res = await fetch(URL_UNIVERSE, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(String(res.status));
    universe = await res.json();
  } catch (e) {
    // Keep the last file: links can wait a week.
    console.warn(`  – AlfaCat universe unavailable (${e.message}); keeping ${OUT}`);
    return;
  }
  const live = universe.filter((x) => !x.retired);
  const bySym = new Map(live.map((x) => [x.symbol, x]));
  const byIso = {};
  const at = (iso) => (byIso[iso] ??= {});
  for (const [iso, sym] of Object.entries(INDEX)) {
    const x = bySym.get(sym);
    if (x) at(iso).index = { symbol: x.symbol, name: x.name, chgYTD: x.chgYTD ?? null, asof: x.asof ?? null };
  }
  const groups = new Map();
  for (const x of live) {
    const iso = countryOf(x);
    if (!iso) continue;
    (groups.get(iso) ?? groups.set(iso, []).get(iso)).push(x);
  }
  for (const [iso, xs] of groups) {
    // Market value is published for US listings only; elsewhere no "largest".
    const sized = xs.filter((x) => x.mcap > 0);
    if (sized.length >= 5) at(iso).top = sized.sort((a, b) => b.mcap - a.mcap).slice(0, 5).map((x) => ({ symbol: x.symbol, name: x.name, chgYTD: x.chgYTD ?? null }));
    at(iso).listings = xs.length;
    // The screener shows one country: its region, with the region's other exchanges switched off.
    const region = xs[0].region, mine = new Set(xs.map((x) => x.exch));
    const others = [...new Set(live.filter((x) => x.region === region && /-stock$|^moex$/.test(x.class)).map((x) => x.exch))].filter((e) => !mine.has(e));
    at(iso).screener = `screener/?region=${region}${others.length ? '&off=' + encodeURIComponent(others.join(',')) : ''}`;
  }
  const fx = {};
  for (const [cur, [sym, inverse]] of Object.entries(FX)) if (bySym.has(sym)) fx[cur] = { symbol: sym, inverse: !!inverse };
  const asof = live.map((x) => x.asof).filter(Boolean).sort().at(-1) ?? null;
  const out = { asof, source: 'https://azenha.ai/alfacat/', byIso, fx };
  const prev = await readFile(OUT, 'utf8').catch(() => '');
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`✓ AlfaCat links: ${Object.keys(byIso).length} countries, ${Object.keys(fx).length} currency pairs${prev ? '' : ' (new file)'}`);
}

main().catch((e) => { console.error('✗ parse_alfacat_links failed:', e.message); process.exit(1); });
