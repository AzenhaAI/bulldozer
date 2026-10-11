/**
 * EU "Quality of life in European cities" — city livability, 2023 wave.
 *   node scripts/parse_eu_cities.mjs
 * Open Eurostat perception survey (urb_percep), no key. City-level, so it does
 * NOT go through the country dataset registry — it writes a standalone
 * src/data/cities.json consumed by the /cities page.
 *
 * Six positive livability dimensions (top-2-box: strongly/very + somewhat/
 * fairly) plus an "Overall livability" composite = the mean percentile rank of
 * each city across the six. Europe-only; the only openly-licensed city ranking.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const DATA = join(SCRIPTS, '..', 'src', 'data');

// City centroids [lon, lat] keyed by cleaned city name — placed on the Europe map.
const COORDS = JSON.parse(await readFile(join(SCRIPTS, 'eu_city_coords.json'), 'utf8'));
const API = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/urb_percep';
const YEAR = '2023';

const CC_NAME = {
  BE: 'Belgium', BG: 'Bulgaria', CZ: 'Czechia', DK: 'Denmark', DE: 'Germany', EE: 'Estonia',
  IE: 'Ireland', EL: 'Greece', ES: 'Spain', FR: 'France', HR: 'Croatia', IT: 'Italy',
  CY: 'Cyprus', LV: 'Latvia', LT: 'Lithuania', LU: 'Luxembourg', HU: 'Hungary', MT: 'Malta',
  NL: 'Netherlands', AT: 'Austria', PL: 'Poland', PT: 'Portugal', RO: 'Romania', SI: 'Slovenia',
  SK: 'Slovakia', FI: 'Finland', SE: 'Sweden', IS: 'Iceland', NO: 'Norway', CH: 'Switzerland',
  UK: 'United Kingdom', ME: 'Montenegro', MK: 'North Macedonia', AL: 'Albania', RS: 'Serbia',
  TR: 'Türkiye', BA: 'Bosnia and Herzegovina', MD: 'Moldova', XK: 'Kosovo',
};

// each metric = top-2-box sum of [strongly/very, somewhat/fairly] agree codes
const METRICS = [
  { key: 'city-satisfaction', label: 'Satisfied to live in the city',
    summary: 'Agree they are satisfied to live in their city.', codes: ['PS3360V', 'PS3361V'] },
  { key: 'life-satisfaction', label: 'Satisfaction with own life',
    summary: 'Satisfied with the life they lead (very + fairly).', codes: ['PS3350V', 'PS3351V'] },
  { key: 'safety-night', label: 'Feel safe at night',
    summary: 'Agree they feel safe walking alone at night in their city.', codes: ['PS3514V', 'PS3515V'] },
  { key: 'jobs', label: 'Easy to find a good job',
    summary: 'Agree it is easy to find a good job in the city.', codes: ['PS2012V', 'PS2013V'] },
  { key: 'housing', label: 'Affordable housing',
    summary: 'Agree it is easy to find good housing at a reasonable price.', codes: ['PS2032V', 'PS2033V'] },
  { key: 'trust', label: 'People can be trusted',
    summary: 'Agree most people in the city can be trusted.', codes: ['PS3092V', 'PS3093V'] },
];

const cleanName = (s) => s.replace(/\s*\((greater|core) city\)/i, '').trim();

async function fetchCube(codes) {
  const q = codes.map((c) => `indic_ur=${c}`).join('&');
  const res = await fetch(`${API}?format=JSON&lang=EN&time=${YEAR}&${q}`);
  if (!res.ok) throw new Error(`Eurostat ${res.status}`);
  return res.json();
}

/** Flatten a filtered JSON-stat cube into { cityCode: { indic: value, _name } }. */
function byCity(d) {
  const ids = d.id, size = d.size;
  const stride = ids.map((_, i) => size.slice(i + 1).reduce((a, b) => a * b, 1));
  const iInd = ids.indexOf('indic_ur'), iCity = ids.indexOf('cities');
  const indInv = Object.fromEntries(Object.entries(d.dimension.indic_ur.category.index).map(([k, v]) => [v, k]));
  const cityInv = Object.fromEntries(Object.entries(d.dimension.cities.category.index).map(([k, v]) => [v, k]));
  const labels = d.dimension.cities.category.label;
  const out = {};
  for (const [flat, val] of Object.entries(d.value)) {
    const f = Number(flat);
    const code = cityInv[Math.floor(f / stride[iCity]) % size[iCity]];
    const ind = indInv[Math.floor(f / stride[iInd]) % size[iInd]];
    (out[code] ??= { _name: labels[code] })[ind] = val;
  }
  return out;
}

/** 0–100 percentile rank of each value within its metric (ties share the mean rank). */
function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return new Map(values.map((v) => {
    const below = sorted.filter((x) => x < v).length;
    const equal = sorted.filter((x) => x === v).length;
    return [v, n > 1 ? ((below + (equal - 1) / 2) / (n - 1)) * 100 : 100];
  }));
}

async function main() {
  console.log('EU Quality of life in European cities →');
  const allCodes = METRICS.flatMap((m) => m.codes);
  const cube = byCity(await fetchCube(allCodes));

  const metrics = [];
  const scores = {}; // cityCode → [percentile per metric]
  for (const m of METRICS) {
    const data = [];
    for (const [code, rec] of Object.entries(cube)) {
      const [a, b] = m.codes.map((c) => rec[c]);
      if (a == null || b == null) continue;
      const cc = code.slice(0, 2);
      data.push({ code, city: cleanName(rec._name), country: CC_NAME[cc] ?? cc, cc, value: Math.round((a + b) * 10) / 10 });
    }
    const pct = percentiles(data.map((d) => d.value));
    for (const d of data) (scores[d.code] ??= []).push(pct.get(d.value));
    data.sort((x, y) => y.value - x.value);
    metrics.push({ key: m.key, label: m.label, summary: m.summary, unit: '%', data: data.map(({ code, ...r }) => r) });
    console.log(`  ${m.key}: ${data.length} cities`);
  }

  // composite: mean percentile across all six dimensions (cities present in all)
  const overall = [];
  for (const [code, rec] of Object.entries(cube)) {
    const s = scores[code];
    if (!s || s.length < METRICS.length) continue;
    const cc = code.slice(0, 2);
    overall.push({ city: cleanName(rec._name), country: CC_NAME[cc] ?? cc, cc, value: Math.round(s.reduce((a, b) => a + b, 0) / s.length * 10) / 10 });
  }
  overall.sort((a, b) => b.value - a.value);
  metrics.unshift({ key: 'overall', label: 'Overall livability', unit: 'score',
    summary: 'BullDozer composite — mean percentile rank across the six dimensions below (higher = better).', data: overall });
  console.log(`  overall: ${overall.length} cities (top: ${overall[0]?.city} ${overall[0]?.value})`);

  // attach [lon, lat] to every row so the /cities Europe map can place dots
  const missing = new Set();
  for (const m of metrics) {
    for (const d of m.data) {
      const c = COORDS[d.city];
      if (c) { d.lon = c[0]; d.lat = c[1]; } else missing.add(d.city);
    }
  }
  if (missing.size) console.warn(`  ⚠ no coords for ${missing.size}: ${[...missing].join(', ')}`);
  else console.log('  coords: all cities located');

  const out = {
    title: 'Best cities to live in Europe',
    source: 'Eurostat — Perception survey on quality of life in European cities',
    // Eurostat copyright notice: modified data must say so, with "a disclaimer regarding the
    // non-responsibility of Eurostat" (https://ec.europa.eu/eurostat/web/main/help/copyright-notice).
    license: 'CC BY 4.0 (Eurostat reuse policy). Ranking computed by BullDozer from Eurostat data; Eurostat has no responsibility for it.',
    url: 'https://ec.europa.eu/eurostat/web/cities/data/database',
    year: YEAR, parsedAt: new Date().toISOString().slice(0, 10), metrics,
  };
  await writeFile(join(DATA, 'cities.json'), JSON.stringify(out));
  console.log('✓ src/data/cities.json');
}
main().catch((e) => { console.error('✗ parse_eu_cities failed:', e.message); process.exit(1); });
