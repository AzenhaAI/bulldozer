/**
 * Corruption Perceptions Index: add TI's newer editions to the OWID-based series.
 *   node scripts/merge_cpi_latest.mjs   (run after parse_cpi.mjs and parse_qog_originals.mjs)
 *
 * OWID's grapher mirror lags TI by months: on 15 Nov 2026 it still ended at
 * CPI 2024, while TI published CPI 2025 on 10 Feb 2026 and our QoG-originals
 * series (qog-ti-cpi, TI's own figures) already carries it. A country page then
 * showed two answers to one question (Brazil: 34 for 2024, 35 for 2025). The
 * owner's rule is "with two sources, take the freshest", so the years TI has
 * and OWID lacks are copied in, keeping each country's region from the series.
 */
import { readFile, writeFile } from 'node:fs/promises';

const MAIN = new URL('../src/data/macro/cpi-corruption-perceptions.json', import.meta.url);
const TI = new URL('../src/data/surveys/qog-ti-cpi.json', import.meta.url);

const main = JSON.parse(await readFile(MAIN, 'utf8'));
const ti = JSON.parse(await readFile(TI, 'utf8'));
const have = new Set(main.data.map((o) => o.period));
const havePair = new Set(main.data.map((o) => `${o.iso}|${o.period}`));
const groupOf = new Map(main.data.filter((o) => o.iso).map((o) => [o.iso, o.group]));
// QoG uses World Bank regions; this series uses continents. A country new to
// the series (Kosovo, first in CPI 2025 here) takes the continent, not a
// one-country "Europe & Central Asia" group (QA, 15 Nov 2026).
const CONTINENT = {
  'Europe & Central Asia': 'Europe', 'East Asia & Pacific': 'Asia', 'South Asia': 'Asia',
  'Middle East & North Africa': 'Asia', 'Sub-Saharan Africa': 'Africa',
  'Latin America & Caribbean': 'Americas', 'North America': 'Americas',
};
// Newer editions, and country-years OWID's mirror lacks (Kosovo before 2025).
const add = ti.data.filter((o) => o.iso && /^[A-Z]{3}$/.test(o.iso) && !havePair.has(`${o.iso}|${o.period}`));
for (const o of main.data) if (CONTINENT[o.group]) o.group = groupOf.get(o.iso) && !CONTINENT[groupOf.get(o.iso)] ? groupOf.get(o.iso) : CONTINENT[o.group];
if (!add.length) { await writeFile(MAIN, JSON.stringify(main, null, 2) + '\n'); console.log('CPI: nothing newer in qog-ti-cpi'); process.exit(0); }
for (const o of add) {
  main.data.push({ entity: o.entity, group: groupOf.get(o.iso) ?? CONTINENT[o.group] ?? o.group, period: o.period, value: Math.round(o.value), iso: o.iso });
}
const periods = [...new Set(main.data.map((o) => o.period))].sort().slice(-8);
main.data = main.data.filter((o) => periods.includes(o.period));
const newYears = [...new Set(add.filter((o) => !have.has(o.period)).map((o) => o.period))].sort();
main.meta.source = 'Transparency International CPI';
const latestTi = [...new Set(ti.data.map((o) => o.period))].sort().at(-1);
main.meta.summary = main.meta.summary.replace(/\s*Latest edition[^.]*\.$/, '') + ` Latest edition from TI directly (CPI ${latestTi}); earlier years via Our World in Data.`;
await writeFile(MAIN, JSON.stringify(main, null, 2) + '\n');
console.log(`CPI: added ${add.length} rows for ${newYears.join(', ')}`);
