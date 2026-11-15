/**
 * Country risk indices → datasets (all classified as 'survey'/indices):
 *  1) World Risk Poll — Resilience Index (weighted, from local microdata extract)
 *  2) WorldRiskIndex (IFHV / Bündnis Entwicklung Hilft) — disaster risk + exposure
 *  3) INFORM Risk Index (EC JRC / IASC) — humanitarian crisis risk
 *
 * WRI and INFORM are fetched live from HDX (reproducible). WRP needs the local
 * CSV extracted from world_risk_poll_2019-2024.zip (set WRP_CSV).
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, pickPeriodsN, writeDataset, round } from './lib/datasets.mjs';

// Common English names by ISO-3: WorldRiskIndex still spells Libya "Libyan Arab
// Jamahiriya" and that reached the rankings (review, 15 Nov 2026).
const NAMES = JSON.parse(await readFile(new URL('../src/data/country-names.json', import.meta.url), 'utf8'));

const H = homedir();
const WRP_CSV = process.env.WRP_CSV ||
  '/private/tmp/claude-501/-Users-kirillshpara/025d8691-cfe3-48e0-a982-db40cbef8a62/scratchpad/wrp/23_wrp.csv';
const GAP = join(H, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey', 'Gapminder', 'ddf--entities--geo--country.csv');

const HDX = 'https://data.humdata.org/dataset';
const WRI_URL = `${HDX}/1efb6ee7-051a-440f-a2cf-e652fecccf73/resource/3a2320fa-41b4-4dda-a847-3f397d865378/download/worldriskindex-trend.csv`;
const INFORM_URL = `${HDX}/f5ec2ee7-8a1b-49b4-864b-70bdb582a022/resource/b1d4a203-ef6e-44f7-9895-17c127aeaaee/download/inform_risk_index_trends.csv`;

const SRC = (source, url) => ({ source, license: 'CC BY 4.0', url, parsedAt: new Date().toISOString().slice(0, 10) });

async function iso3Region() {
  const m = new Map();
  try {
    for (const r of await gapminderRows()) {
      const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
      if (a3) m.set(a3, REGION_4[r.world_4region] || 'Other');
    }
  } catch {}
  return m;
}

/** Build a dataset from rows of {entity, iso, period, value}. */
async function emit(slug, meta, rows, region) {
  const yearCounts = new Map();
  for (const r of rows) yearCounts.set(r.period, (yearCounts.get(r.period) ?? 0) + 1);
  const periods = pickPeriodsN(yearCounts, 8);
  const data = rows
    .filter((r) => periods.includes(r.period))
    .map((r) => ({ entity: NAMES[r.iso]?.common || r.entity, group: region.get(r.iso) || 'Other', period: r.period, value: r.value, iso: r.iso }));
  await writeDataset('survey', slug, { ...meta, changeMode: 'pp' }, data);
}

async function wrp(region) {
  let text;
  try { text = await readFile(WRP_CSV, 'utf8'); } catch { console.warn('– World Risk Poll CSV missing; skipped.'); return; }
  const by = new Map();
  for (const r of parseCsvObjects(text)) {
    const v = parseFloat(r.resilience_index);
    if (Number.isNaN(v) || !r.COUNTRY_ISO3) continue;
    const iso = r.COUNTRY_ISO3.toUpperCase(), w = parseFloat(r.WGT) || 1;
    let rec = by.get(iso); if (!rec) by.set(iso, rec = { name: r.Country, w: 0, sw: 0 });
    rec.w += w; rec.sw += w * v;
  }
  const data = [...by.entries()].map(([iso, o]) => ({ entity: o.name, group: region.get(iso) || 'Other', period: '2023', value: round((o.sw / o.w) * 100, 1), iso }));
  await writeDataset('survey', 'wrp-resilience', {
    title: 'Resilience to Risk (WRP)',
    summary: 'World Risk Poll Resilience Index — how well people can anticipate, cope with and recover from risk and disaster (0–100). Weighted, 2023.',
    unit: 'index 0–100', valueLabel: 'Resilience index', changeMode: 'pp', ...SRC('World Risk Poll (Lloyd’s Register Foundation / Gallup)', 'https://wrp.lrfoundation.org.uk/'),
  }, data);
}

async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function wri(region) {
  let text;
  try { text = await fetchCsv(WRI_URL); } catch (e) { console.warn('– WorldRiskIndex fetch failed:', e.message); return; }
  const overall = [], exposure = [];
  for (const r of parseCsvObjects(text)) {
    const iso = (r['ISO3.Code'] || '').toUpperCase(), name = r['WRI.Country'], y = r.Year;
    if (!iso || !y) continue;
    const w = parseFloat(r.W), e = parseFloat(r.E);
    if (!Number.isNaN(w)) overall.push({ entity: name, iso, period: y, value: round(w, 2) });
    if (!Number.isNaN(e)) exposure.push({ entity: name, iso, period: y, value: round(e, 2) });
  }
  await emit('wri-risk', { title: 'World Risk Index', valueLabel: 'Disaster risk', unit: 'index 0–100',
    summary: 'Risk of a country suffering a disaster from extreme natural events and climate change (exposure × vulnerability).', ...SRC('WorldRiskIndex (IFHV / Bündnis Entwicklung Hilft)', 'https://weltrisikobericht.de/en/') }, overall, region);
  await emit('wri-exposure', { title: 'Disaster Exposure (WRI)', valueLabel: 'Exposure to natural hazards', unit: 'index 0–100',
    summary: 'Exposure of a population to earthquakes, storms, floods, droughts and sea-level rise.', ...SRC('WorldRiskIndex (IFHV / Bündnis Entwicklung Hilft)', 'https://weltrisikobericht.de/en/') }, exposure, region);
}

async function inform(region) {
  let text;
  try { text = await fetchCsv(INFORM_URL); } catch (e) { console.warn('– INFORM fetch failed:', e.message); return; }
  const rows = [];
  for (const r of parseCsvObjects(text)) {
    if (r.IndicatorId !== 'INFORM') continue;
    const iso = (r.Iso3 || '').toUpperCase(), v = parseFloat(r.IndicatorScore);
    if (!iso || Number.isNaN(v)) continue;
    rows.push({ entity: r.CountryName, iso, period: r.GNAYear, value: round(v, 1) });
  }
  await emit('inform-risk', { title: 'INFORM Risk Index', valueLabel: 'Humanitarian crisis risk', unit: 'index 0–10',
    summary: 'Risk of humanitarian crises and disasters that could overwhelm national response capacity (hazard, vulnerability, lack of coping capacity).', ...SRC('INFORM (EC JRC / IASC)', 'https://drmkc.jrc.ec.europa.eu/inform-index') }, rows, region);
}

async function main() {
  console.log('Risk indices →');
  const region = await iso3Region();
  await wrp(region);
  await wri(region);
  await inform(region);
}
main().catch((e) => { console.error('✗ parse_risk failed:', e.message); process.exit(1); });
