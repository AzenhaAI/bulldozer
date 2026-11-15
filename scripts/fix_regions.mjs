/**
 * One-off patch of committed datasets whose parsers read the owner's local
 * Gapminder / tidy exports and so cannot be rerun here (review, 15 Nov 2026).
 * The same rules now live in the parsers (parse_surveys, parse_tidy, parse_wvs,
 * parse_risk, parse_worldbank, lib/datasets.mjs writeDataset), so a rerun on the
 * Mac keeps them. Idempotent: running it twice changes nothing the second time.
 *
 *   node scripts/fix_regions.mjs
 *
 * 1. Regions by ISO-3, in the taxonomy each file already uses:
 *    - WHR and the tidy World Bank-style sets (v-dem-*, wb-sp-dyn-tfrt-in) filed
 *      15 countries under "Advanced / other" because the tidy export's region
 *      lookup missed their spelling (Russian Federation, Viet Nam, DR Congo...).
 *      They get their World Bank region (api.worldbank.org/v2/country).
 *    - hofstede-*, wvs-secular, wvs-emancipative, wrp-resilience use
 *      Gapminder's four regions; the Americas were "Other" from a run before
 *      REGION_4 knew Gapminder's plural "americas". Kosovo (and Caribbean
 *      Netherlands) were "Other" in every four-region file, being absent from
 *      Gapminder's registry.
 * 2. Names: "Swaziland" (WHR 2018-20) -> "Eswatini"; entity "XKX" -> "Kosovo";
 *    WVS "NIR" -> "Northern Ireland".
 * 3. Sub-national units are kept as data but taken out of country rankings:
 *    iso is set to '' (countryIndex.ts and the maps skip rows without an ISO;
 *    the dataset pages still list them) and `sub: true` records why.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { REGION_4 } from './lib/datasets.mjs';
import { SUBNATIONAL_ISO, SUBNATIONAL_NAME, WB_REGION_FIX } from './lib/regions.mjs';

const DATA = new URL('../src/data/', import.meta.url);
const json = async (u) => JSON.parse(await readFile(u, 'utf8'));

// Gapminder four-region lookup from the bundled snapshot (no iCloud access).
const G4 = new Map();
for (const r of await json(new URL('./lib/gapminder_geo.json', import.meta.url))) {
  G4.set(r.iso3166_1_alpha3.toUpperCase(), REGION_4[r.world_4region] || 'Other');
}
G4.set('XKX', 'Europe'); // not in the Gapminder snapshot (now added in gapminderRows)
G4.set('BES', 'Americas'); // Caribbean Netherlands, likewise
G4.set('NIR', 'Europe'); // WVS: Northern Ireland

const RENAME = { Swaziland: 'Eswatini', XKX: 'Kosovo', NIR: 'Northern Ireland' };

// Never touched here (owner's rule): Eurobarometer, EVS, ISSP, GESIS sets.
const FORBIDDEN = /^(eb-|evs-|issp-)|gesis/i;

const surveys = (await readdir(new URL('surveys/', DATA))).map((f) => `surveys/${f}`);
const macro = (await readdir(new URL('macro/', DATA))).map((f) => `macro/${f}`);
const slugOf = (p) => p.split('/')[1].replace(/\.json$/, '');
const pick = (list, re) => list.filter((p) => re.test(slugOf(p)) && !FORBIDDEN.test(slugOf(p)));

const WB7_FILES = pick(surveys, /^(whr-|v-dem-|wb-sp-dyn-tfrt-in$)/);
// Every file on Gapminder's four regions (groups within Africa/Americas/Asia/
// Europe/Other): hofstede-*, wvs-*, wrp-*, wgm-*, the wb-* API sets, mlab-*...
const G4_LABELS = new Set(['Africa', 'Americas', 'Asia', 'Europe', 'Other']);
const G4_FILES = [];
for (const path of [...surveys, ...macro]) {
  if (FORBIDDEN.test(slugOf(path))) continue;
  const groups = new Set((await json(new URL(path, DATA))).data.map((r) => r.group));
  if (groups.has('Other') && [...groups].every((g) => G4_LABELS.has(g))) G4_FILES.push(path);
}
const SUB_FILES = pick(surveys, /^(whr-|v-dem-|wvs-|wb-sp-dyn-tfrt-in$)/);

let touched = 0;
for (const path of [...new Set([...WB7_FILES, ...G4_FILES, ...SUB_FILES])]) {
  const url = new URL(path, DATA);
  const before = await readFile(url, 'utf8');
  const ds = JSON.parse(before);
  const counts = { region: 0, name: 0, sub: 0 };
  for (const r of ds.data) {
    const code = r.iso || '';
    if (RENAME[r.entity] && (r.entity !== 'XKX' || code === 'XKX') && (r.entity !== 'NIR' || code === 'NIR')) {
      r.entity = RENAME[r.entity]; counts.name++;
    }
    if (r.entity === 'Eswatini' && !r.iso) r.iso = 'SWZ';
    if (WB7_FILES.includes(path) && r.group === 'Advanced / other') {
      const g = WB_REGION_FIX[code] || WB_REGION_FIX[r.entity];
      if (g) { r.group = g; counts.region++; }
    }
    if (G4_FILES.includes(path) && r.group === 'Other' && G4.has(code)) { r.group = G4.get(code); counts.region++; }
    if (SUB_FILES.includes(path) && (SUBNATIONAL_ISO.has(code) || SUBNATIONAL_NAME.has(r.entity)) && !r.sub) {
      r.iso = ''; r.sub = true; counts.sub++;
    }
  }
  const after = JSON.stringify(ds, null, 2) + '\n';
  if (after === before) continue;
  await writeFile(url, after);
  touched++;
  console.log(`  ✓ ${path}: ${counts.region} regions, ${counts.name} names, ${counts.sub} sub-national rows`);
}
console.log(`fix_regions: ${touched} files patched`);
