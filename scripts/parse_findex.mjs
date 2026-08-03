/**
 * World Bank Global Findex — financial inclusion (account ownership, digital payments).
 *   node scripts/parse_findex.mjs
 * Open API, source 28 (Global Findex database). Survey waves: 2011, 2014,
 * 2017, 2021 (a few countries collected in 2022 — folded into the 2021 wave)
 * and 2024. Region aggregates come back with empty or non-country ISO codes,
 * so we keep only entities present in the Gapminder country registry.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';

const GAP = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey', 'Gapminder', 'ddf--entities--geo--country.csv');
const API = 'https://api.worldbank.org/v2/country/all/indicator';

const INDICATORS = [
  { id: 'account.t.d', slug: 'findex-account-ownership', title: 'Account Ownership',
    summary: 'Share of adults (15+) with an account at a bank, another financial institution, or a mobile-money provider.' },
  { id: 'g20.any', slug: 'findex-digital-payments', title: 'Digital Payments Usage',
    summary: 'Share of adults (15+) who made or received a digital payment in the past year.' },
];

async function iso3Region() {
  const m = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) m.set(a3, REGION_4[r.world_4region] || 'Other');
  }
  return m;
}

/** The WB API times out sporadically — retry a few times before giving up. */
// The Findex endpoint (source=28) is slow — a full per_page=20000 pull takes
// ~40s — and it 502s under load. Flat 3s retries all landed inside the same bad
// ten seconds and the parser gave up while the API was merely busy. This runs
// weekly, so waiting minutes costs nothing: back off exponentially with jitter,
// and don't retry a 4xx, which means the URL changed rather than the server hiccuped.
async function fetchJson(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      if (res.ok) return await res.json();
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`HTTP ${res.status} — endpoint changed?`);
      }
      console.warn(`  attempt ${i + 1}/${tries}: HTTP ${res.status}`);
    } catch (e) {
      if (/endpoint changed/.test(e.message)) throw e;
      console.warn(`  attempt ${i + 1}/${tries}: ${e.message}`);
    }
    if (i < tries - 1) {
      const wait = Math.min(2000 * 2 ** i, 60_000) * (0.75 + Math.random() * 0.5);
      console.warn(`  waiting ${Math.round(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`WB API unreachable after ${tries} attempts: ${url}`);
}

async function main() {
  console.log('World Bank Global Findex →');
  const region = await iso3Region();
  for (const cfg of INDICATORS) {
    const js = await fetchJson(`${API}/${cfg.id}?source=28&format=json&per_page=20000`);
    const data = [];
    for (const r of js[1] ?? []) {
      if (r.value == null) continue;
      // source 28 leaves countryiso3code empty; country.id carries the ISO3
      const iso = (r.country?.id || '').toUpperCase();
      if (!region.has(iso)) continue;
      const period = r.date === '2022' ? '2021' : r.date;
      data.push({ entity: r.country.value, group: region.get(iso), period, value: round(r.value, 1), iso });
    }
    if (data.length < 200) { console.warn(`– ${cfg.slug}: only ${data.length} rows, skipping`); continue; }
    await writeDataset('macro', cfg.slug, {
      title: cfg.title, summary: `${cfg.summary} Global Findex survey waves 2011–2024.`,
      unit: '%', valueLabel: `${cfg.title} (% adults)`, changeMode: 'pp', topic: 'economy',
      source: 'World Bank Global Findex', license: 'CC BY 4.0',
      url: 'https://www.worldbank.org/en/publication/globalfindex', parsedAt: new Date().toISOString().slice(0, 10),
    }, data);
  }
}
main().catch((e) => { console.error('✗ parse_findex failed:', e.message); process.exit(1); });
