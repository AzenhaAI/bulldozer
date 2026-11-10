/**
 * World Bank WDI → digital-infrastructure series the site lacked: fixed
 * broadband subscriptions (ITU) and secure internet servers (Netcraft). Full
 * annual series from 2010, real ISO-3 countries only.
 *
 *   node scripts/parse_wb_digital.mjs
 *
 * Both series carry "License Type: CC BY-4.0" in the WDI metadata
 * (api.worldbank.org/v2/sources/2/series/<code>/metadata). ITU's own
 * DataHub and the ITU series in Data360 are CC BY-NC-SA 3.0 IGO; the WDI
 * copies are what we may republish, so this reads WDI, not ITU.
 *
 * Kept apart from parse_worldbank.mjs so the weekly run refreshes these
 * without re-pulling that script's other datasets.
 */
import { writeDataset, round } from './lib/datasets.mjs';
import { countryLookup, fetchText } from './lib/geo.mjs';

const PARSED = new Date().toISOString().slice(0, 10);
const FROM = 2010;
const TO = new Date().getUTCFullYear() - 1;
const WB = { source: 'World Bank Open Data (World Development Indicators)', license: 'CC BY 4.0', topic: 'connectivity' };

async function series(code, geo, dp) {
  const txt = await fetchText(`https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=20000&date=${FROM}:${TO}`);
  let j;
  try { j = JSON.parse(txt.replace(/^﻿/, '')); } catch { throw new Error(`WB ${code}: not JSON (${txt.slice(0, 60)})`); }
  if (!Array.isArray(j) || !j[1]?.length) throw new Error(`WB ${code}: empty`);
  const data = [];
  for (const r of j[1]) {
    const iso = geo.iso3(r.countryiso3code);
    if (r.value == null || !iso) continue;
    data.push({ ...geo.describe(iso), period: String(r.date), value: round(r.value, dp), iso });
  }
  return data.sort((a, b) => a.entity.localeCompare(b.entity) || a.period.localeCompare(b.period));
}

const geo = await countryLookup();
const DATASETS = [
  ['wb-fixed-broadband', 'IT.NET.BBND.P2', 2, {
    title: 'Fixed Broadband Subscriptions',
    valueLabel: 'Fixed broadband subscriptions per 100 people',
    unit: 'per 100',
    changeMode: 'pct',
    summary: 'Fixed (wired or fixed-wireless) internet subscriptions of at least 256 kbit/s per 100 people: DSL, cable, fibre, satellite and fixed wireless, homes and businesses together; mobile data is not included. A subscription usually serves a whole household, so 40 per 100 can mean nearly every home is connected. Reported by national regulators and operators to the ITU; the most recent years are missing for many countries until ITU fills them in.',
    url: 'https://data.worldbank.org/indicator/IT.NET.BBND.P2',
  }],
  ['wb-secure-servers', 'IT.NET.SECR.P6', 2, {
    title: 'Secure Internet Servers',
    valueLabel: 'Secure internet servers per million people',
    unit: 'per million',
    changeMode: 'pct',
    summary: 'Distinct publicly trusted TLS/SSL certificates (the "https" padlock) found by Netcraft\'s Secure Server Survey, counted by the country where the server is hosted, per million people. It measures where the web is hosted, not where its owners or users are: hosting hubs and small territories with large data centres or registrars (the British Virgin Islands, Belize, Cyprus, the Netherlands, Singapore) reach figures far above their size, and a country whose sites are hosted abroad looks emptier than it is. Counts multiplied between 2016 and 2019 (about fourfold in the median country, more than tenfold in the United States), largely as free automated certificates (Let\'s Encrypt, launched in 2016) spread, so the jump in those years reflects a change in how the web is secured more than in the countries themselves.',
    url: 'https://data.worldbank.org/indicator/IT.NET.SECR.P6',
  }],
];
for (const [slug, code, dp, meta] of DATASETS) {
  let data;
  try { data = await series(code, geo, dp); } catch (e) { console.error(`  ✗ ${slug}: ${e.message}`); process.exitCode = 1; continue; }
  await writeDataset('macro', slug, { ...meta, ...WB, parsedAt: PARSED }, data);
}
