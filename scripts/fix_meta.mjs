/**
 * One-off metadata patch for datasets whose parsers read the owner's local
 * Gapminder files and cannot be rerun here (review, 15 Nov 2026). The parsers
 * carry the same change (parse_surveys.mjs projectedFrom, parse_gapminder_long.mjs
 * data-driven span), so a rerun keeps it. Idempotent.
 *
 *   node scripts/fix_meta.mjs
 *
 * - gapminder-median-age, gapminder-density: UN WPP 2024 underneath, estimates
 *   to 2023 and medium-variant projections from 2024 (our 2019–2026 values
 *   match WPP 2024 as published by OWID: Japan median age 2023 49.0, 2024
 *   projected 49.4). projectedFrom makes charts dash 2024+ and keeps those
 *   years out of rankings.
 * - gapminder-population: the summary said 1800–2020; the data ends in 2013.
 */
import { readFile, writeFile } from 'node:fs/promises';

const DATA = new URL('../src/data/', import.meta.url);

async function patch(path, fn) {
  const url = new URL(path, DATA);
  const before = await readFile(url, 'utf8');
  const ds = JSON.parse(before);
  fn(ds);
  const after = JSON.stringify(ds, null, 2) + '\n';
  if (after !== before) { await writeFile(url, after); console.log(`  ✓ ${path}`); }
}

const span = (ds) => {
  const y = ds.data.map((o) => Number(o.period));
  return `${Math.min(...y)}–${Math.max(...y)}`;
};

for (const slug of ['gapminder-median-age', 'gapminder-density']) {
  await patch(`surveys/${slug}.json`, (ds) => {
    // Keep key order stable: projectedFrom right after the source fields.
    const { kind, ...rest } = ds.meta;
    ds.meta = { ...rest, projectedFrom: '2024', ...(kind ? { kind } : {}) };
  });
}

await patch('macro/gapminder-population.json', (ds) => {
  ds.meta.summary = ds.meta.summary.replace(/\d{4}–\d{4}/, span(ds));
});
