/**
 * RSF (Reporters Without Borders) — World Press Freedom Index.
 *   node scripts/parse_rsf.mjs
 *
 * RETIRED 2026-10-12: no longer run (not in run_parsers.mjs) and writes
 * nothing. RSF's General Conditions of Use forbid reuse: "Any withdrawal or any
 * re-use by means of permanent or temporary transfer of all or part of the
 * content of any data on this site, by any means or in any form, is strictly
 * forbidden." (https://rsf.org/en/gcu). The last published file is kept in
 * data/retired/rsf-press-freedom.json; media freedom now comes from V-Dem
 * (v-dem-v2x-freexp-altinf via parse_tidy.mjs, v-dem-v2mecenefm via
 * parse_vdem_media.mjs). The code below is kept for reference.
 *
 * Official per-year CSVs from rsf.org. Semicolon-separated with decimal
 * commas, no quoting; the score column is named `Score` or `Score <year>`
 * depending on the edition. RSF's methodology changed in 2022, so we start
 * there to keep scores comparable.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset, round } from './lib/datasets.mjs';

const GAP = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey', 'Gapminder', 'ddf--entities--geo--country.csv');
const YEARS = ['2022', '2023', '2024', '2025', '2026'];

async function iso3Region() {
  const m = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (a3) m.set(a3, REGION_4[r.world_4region] || 'Other');
  }
  return m;
}

async function main() {
  console.log('– RSF World Press Freedom Index: retired, nothing written (see the header).');
  return;
  // eslint-disable-next-line no-unreachable
  console.log('RSF World Press Freedom Index →');
  const region = await iso3Region();
  const data = [];
  for (const year of YEARS) {
    const res = await fetch(`https://rsf.org/sites/default/files/import_classement/${year}.csv`);
    if (!res.ok) { console.warn(`– ${year}: fetch failed (${res.status})`); continue; }
    // Encoding varies by edition — recent files are Windows-1252, older ones
    // UTF-8. Decoding the wrong one mangles accents (Côte d'Ivoire, Türkiye),
    // so try strict UTF-8 first and fall back to Windows-1252.
    const buf = await res.arrayBuffer();
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch { text = new TextDecoder('windows-1252').decode(buf); }
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    const header = lines[0].split(';');
    const iScore = header.findIndex((h) => /^Score( \d{4})?$/.test(h.trim()));
    const iIso = header.findIndex((h) => h.trim() === 'ISO');
    const iName = header.findIndex((h) => h.trim() === 'Country_EN');
    if (iScore < 0 || iIso < 0 || iName < 0) { console.warn(`– ${year}: unexpected header`); continue; }
    let n = 0;
    for (const line of lines.slice(1)) {
      const f = line.split(';');
      const iso = (f[iIso] || '').trim().toUpperCase();
      if (!region.has(iso)) continue;
      const v = Number((f[iScore] || '').replace(',', '.'));
      if (Number.isNaN(v)) continue;
      data.push({ entity: f[iName].trim(), group: region.get(iso), period: year, value: round(v, 1), iso });
      n++;
    }
    console.log(`  ${year}: ${n} countries`);
  }
  if (data.length < 400) throw new Error(`only ${data.length} rows`);
  await writeDataset('macro', 'rsf-press-freedom', {
    title: 'Press Freedom Index', unit: 'score 0–100 (100 = most free)', valueLabel: 'Press freedom score',
    changeMode: 'pp', topic: 'media',
    summary: 'Media freedom scored across political, economic, legal, social and safety contexts in 180 countries. Current RSF methodology (2022+).',
    source: 'RSF World Press Freedom Index', license: 'Open data (RSF)',
    url: 'https://rsf.org/en/index', parsedAt: new Date().toISOString().slice(0, 10),
  }, data);
}
main().catch((e) => { console.error('✗ parse_rsf failed:', e.message); process.exit(1); });
