/**
 * V-Dem media-freedom indicators that the tidy V-Dem extract (parse_tidy.mjs)
 * does not carry, read straight from the V-Dem Country-Year Full+Others v16
 * CSV. V-Dem is CC BY-SA 4.0 ("free to use, adapt, and share the data,
 * including for commercial purposes", https://www.v-dem.net/data/the-v-dem-dataset/).
 *
 * Replaces the RSF World Press Freedom Index, whose terms forbid reuse
 * (see the 'rsf' entry in src/data/licences.ts). The broader V-Dem index
 * v2x_freexp_altinf is already published by parse_tidy.mjs.
 *
 *   node scripts/parse_vdem_media.mjs
 * Source is local (406 MB, not in the repo); output JSON is committed.
 */
import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { enRegion, pickPeriodsN, writeDataset, round } from './lib/datasets.mjs';

const VDEM = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey', 'V-Dem_Varieties_of_Democracy');
const FULL = join(VDEM, 'full', 'V-Dem-CY-Full+Others-v16.csv');
// Region labels come from the tidy extract so these series group countries
// exactly like the other v-dem-* datasets.
const TIDY = join(VDEM, 'vdem_full_tidy.csv');
const today = new Date().toISOString().slice(0, 10);

const INDICATORS = {
  v2mecenefm: {
    title: 'Government Media Censorship Effort (V-Dem)',
    valueLabel: 'Media censorship effort (higher = less censorship)',
    unit: 'estimate (higher = less censorship)',
    dp: 3,
    summary: 'Does the government directly or indirectly attempt to censor the print or broadcast media? V-Dem expert-coded measurement-model estimate, roughly −3 to +3.5: below −1 means attempts to censor are routine; above +1.9 means the government rarely attempts to censor major media and officials who try are usually punished.',
  },
};

/** Split one CSV line into fields, stopping after `upTo` fields. V-Dem quotes
 *  text fields; numbers are bare. Handles "" escapes inside quotes. */
function splitCsv(line, upTo) {
  const out = [];
  let field = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(field); field = ''; if (out.length >= upTo) return out; }
    else field += c;
  }
  out.push(field);
  return out;
}

async function regions() {
  const m = new Map();
  for (const r of parseCsvObjects(await readFile(TIDY, 'utf8'))) {
    const iso = (r.iso3 || '').toUpperCase();
    if (iso && !m.has(iso)) m.set(iso, { region: enRegion(r.region), country: r.country });
  }
  return m;
}

async function main() {
  console.log('V-Dem media indicators (Full+Others v16) →');
  let reg;
  try { reg = await regions(); } catch { console.log('– V-Dem tidy extract missing, skipped'); return; }

  try { await access(FULL); } catch { console.log('– V-Dem Full+Others CSV missing, skipped'); return; }
  const lines = createInterface({ input: createReadStream(FULL), crlfDelay: Infinity });
  let head = null, need = 0, idx = {};
  const byCode = Object.fromEntries(Object.keys(INDICATORS).map((c) => [c, []]));
  const counts = Object.fromEntries(Object.keys(INDICATORS).map((c) => [c, new Map()]));
  for await (const line of lines) {
    if (!head) {
      head = splitCsv(line, Infinity);
      for (const k of ['country_name', 'country_text_id', 'year', ...Object.keys(INDICATORS)]) {
        idx[k] = head.indexOf(k);
        if (idx[k] < 0) throw new Error(`column ${k} not in ${FULL}`);
      }
      need = Math.max(...Object.values(idx)) + 1;
      continue;
    }
    const f = splitCsv(line, need);
    const iso = f[idx.country_text_id], year = f[idx.year];
    for (const code of Object.keys(INDICATORS)) {
      const raw = f[idx[code]];
      if (raw === '' || raw === 'NA' || raw == null) continue;
      const v = Number(raw);
      if (Number.isNaN(v)) continue;
      byCode[code].push({ iso, country: f[idx.country_name], year, v });
      counts[code].set(year, (counts[code].get(year) ?? 0) + 1);
    }
  }

  for (const [code, cfg] of Object.entries(INDICATORS)) {
    const keep = pickPeriodsN(counts[code], 8);
    const data = byCode[code]
      .filter((r) => keep.includes(r.year))
      .map((r) => ({
        entity: reg.get(r.iso)?.country || r.country,
        group: reg.get(r.iso)?.region || 'Other',
        period: r.year,
        value: round(r.v, cfg.dp),
        iso: r.iso,
      }));
    await writeDataset('survey', `v-dem-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, {
      title: cfg.title,
      summary: `${cfg.summary} ${keep[0]}–${keep.at(-1)}.`,
      unit: cfg.unit,
      valueLabel: cfg.valueLabel,
      changeMode: 'pp',
      topic: 'media',
      source: 'V-Dem Institute — Varieties of Democracy',
      license: 'CC BY-SA 4.0',
      url: 'https://www.v-dem.net/data/the-v-dem-dataset/',
      parsedAt: today,
    }, data);
  }
}

main().catch((err) => {
  console.error('✗ parse_vdem_media failed:', err.message);
  process.exit(1);
});
