/**
 * Hofstede cultural dimensions → datasets (one per dimension), from the local
 * matrix CSV (Country, PDI, IDV, MAS, UAI, LTO). Single period.
 *   node scripts/parse_hofstede.mjs
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { gapminderRows, REGION_4, writeDataset } from './lib/datasets.mjs';

const H = homedir();
const CSV = process.env.HOFSTEDE_CSV ||
  join(H, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Hofstede_matrix', 'hofstede_dimensions_2010_archive.csv');
const GAP = join(H, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey', 'Gapminder', 'ddf--entities--geo--country.csv');
const PERIOD = '2010';

const DIMS = {
  PDI: { slug: 'hofstede-power-distance', title: 'Power Distance', summary: 'How much less powerful members accept that power is distributed unequally.' },
  IDV: { slug: 'hofstede-individualism', title: 'Individualism', summary: 'Preference for a loosely-knit social framework (individualism) over a tight one (collectivism).' },
  MAS: { slug: 'hofstede-masculinity', title: 'Masculinity', summary: 'Preference for achievement and competition (masculine) over cooperation and quality of life (feminine).' },
  UAI: { slug: 'hofstede-uncertainty-avoidance', title: 'Uncertainty Avoidance', summary: 'Discomfort with uncertainty and ambiguity.' },
  LTO: { slug: 'hofstede-long-term', title: 'Long-term Orientation', summary: 'Future-oriented pragmatism vs respect for tradition and the present.' },
};

const ALIAS = {
  'great britain': 'GBR', 'u.s.a.': 'USA', 'usa': 'USA', 'united states': 'USA', 'south korea': 'KOR',
  'czech republic': 'CZE', 'slovak republic': 'SVK', 'russia': 'RUS', 'iran': 'IRN', 'vietnam': 'VNM',
  'hong kong': 'HKG', 'trinidad and tobago': 'TTO', 'trinidad': 'TTO', 'el salvador': 'SLV', 'costa rica': 'CRI',
  'united kingdom': 'GBR', 'slovakia': 'SVK', 'surinam': 'SUR', 'suriname': 'SUR',
};

async function geoMaps() {
  const name2iso = new Map(); const iso2region = new Map();
  for (const r of await gapminderRows()) {
    const a3 = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (!a3) continue;
    if (r.name) name2iso.set(r.name.toLowerCase(), a3);
    iso2region.set(a3, REGION_4[r.world_4region] || 'Other');
  }
  for (const [k, v] of Object.entries(ALIAS)) name2iso.set(k, v);
  return { name2iso, iso2region };
}

async function main() {
  let text;
  try { text = await readFile(CSV, 'utf8'); } catch { console.warn('– Hofstede CSV missing; skipped.'); return; }
  const { name2iso, iso2region } = await geoMaps();
  const rows = [...parseCsvObjects(text)];
  let mapped = 0, skipped = [];
  const resolved = rows.map((r) => {
    const iso = name2iso.get((r.Country || '').toLowerCase());
    if (!iso) skipped.push(r.Country); else mapped++;
    return { ...r, iso };
  });

  for (const [code, cfg] of Object.entries(DIMS)) {
    const data = resolved.filter((r) => r.iso && r[code] !== '' && !Number.isNaN(Number(r[code])))
      .map((r) => ({ entity: r.Country, group: iso2region.get(r.iso) || 'Other', period: PERIOD, value: Math.round(Number(r[code])), iso: r.iso }));
    if (!data.length) continue;
    await writeDataset('survey', cfg.slug, {
      title: cfg.title, valueLabel: cfg.title, unit: 'index (mostly 0–100)', changeMode: 'pp', topic: 'attitudes',
      summary: `${cfg.summary} Hofstede’s cultural dimensions.`,
      source: 'Hofstede cultural dimensions (G. Hofstede)', license: 'Public — Hofstede model',
      url: 'https://geerthofstede.com/research-and-vsm/dimension-data-matrix/', parsedAt: new Date().toISOString().slice(0, 10),
    }, data);
  }
  console.log(`✓ Hofstede → ${mapped} countries mapped; skipped (regions/unmatched): ${skipped.slice(0, 8).join(', ')}`);
}
main().catch((e) => { console.error('✗ parse_hofstede failed:', e.message); process.exit(1); });
