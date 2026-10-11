/**
 * Generic parser for the harmonised tidy CSV sources (World Bank WDI, QoG,
 * Maddison, Penn World Table, OECD, BIS, V-Dem). They share the schema
 *   [source,] iso3, country, region, indicator_code, indicator, [unit,] year, value
 * Russian labels in the sources are replaced with curated English titles here.
 *
 *   node scripts/parse_tidy.mjs
 * Sources are local/curated; output JSON is committed.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvObjects } from './lib/csv.mjs';
import { enRegion, pickPeriodsN, writeDataset, round } from './lib/datasets.mjs';

const H = homedir();
const TD = join(H, 'Documents', 'tableau_data');
const SURV = join(H, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BK', 'Opros', 'Inter_survey');
const today = new Date().toISOString().slice(0, 10);

// helper builders
const pct = (title, unit, dp = 1) => ({ title, unit, mode: 'pct', dp });
const pp = (title, unit, dp = 1) => ({ title, unit, mode: 'pp', dp });
const idx = (title, dp = 3) => ({ title, unit: 'index 0–1', mode: 'pp', dp });

const SOURCES = [
  {
    // World Bank kept only for indicators not covered by IMF (macro) or
    // Gapminder (development) — avoids duplicating the same concept.
    tag: 'WB', kind: 'survey', file: join(TD, 'macro', 'wdi_tidy.csv'),
    source: 'World Bank — World Development Indicators', license: 'CC BY 4.0',
    url: 'https://databank.worldbank.org/source/world-development-indicators',
    indicators: {
      'SP.DYN.TFRT.IN': pp('Fertility Rate', 'births/woman', 2),
      'EN.GHG.CO2.PC.CE.AR5': pct('CO₂ per Capita', 't', 2),
    },
  },
  {
    // QoG's terms forbid redistribution, so its series now come from their
    // original producers (scripts/parse_qog_originals.mjs: World Bank WGI/WDI,
    // Transparency International). The QoG copy of RSF's index is retired with
    // RSF (data/retired/). Only Freedom House status is still read here: its
    // producer's terms need approval for commercial use too, so moving it would
    // not help — left for the owner to decide (see src/data/licences.ts).
    tag: 'QoG', kind: 'survey', file: join(SURV, 'QoG_Quality_of_Government', 'qog_ts_tidy.csv'),
    source: 'Quality of Government Institute (University of Gothenburg)', license: 'Open — academic use',
    url: 'https://www.gu.se/en/quality-government/qog-data',
    indicators: {
      fh_status: pp('Freedom House Status', '1=free…3=not', 2),
    },
  },
  {
    tag: 'V-Dem', kind: 'survey', file: join(SURV, 'V-Dem_Varieties_of_Democracy', 'vdem_full_tidy.csv'),
    source: 'V-Dem Institute — Varieties of Democracy', license: 'CC BY-SA 4.0',
    url: 'https://www.v-dem.net/data/the-v-dem-dataset/',
    indicators: {
      v2x_polyarchy: idx('Electoral Democracy'), v2x_libdem: idx('Liberal Democracy'),
      v2x_partipdem: idx('Participatory Democracy'), v2x_delibdem: idx('Deliberative Democracy'),
      v2x_egaldem: idx('Egalitarian Democracy'), v2x_civlib: idx('Civil Liberties'),
      v2x_rule: idx('Rule of Law'), v2x_corr: idx('Political Corruption'),
      v2x_freexp_altinf: idx('Freedom of Expression'), v2xel_frefair: idx('Clean Elections'),
      v2x_jucon: idx('Judicial Constraints on Executive'), v2x_gender: idx('Gender Equality'),
    },
  },
  {
    tag: 'PWT', kind: 'macro', file: join(TD, 'productivity', 'pwt_productivity_tidy.csv'),
    source: 'Penn World Table 10.01', license: 'CC BY 4.0',
    url: 'https://www.rug.nl/ggdc/productivity/pwt/',
    indicators: { PWT_GDP_PER_HOUR: pct('Labour Productivity (GDP per hour)', '2017 intl$/hr', 1) },
  },
  {
    tag: 'OECD', kind: 'macro', file: join(TD, 'taxes', 'oecd_taxwedge_tidy.csv'),
    source: 'OECD Taxing Wages', license: 'OECD terms — public data',
    url: 'https://www.oecd.org/en/data/datasets/taxing-wages.html',
    indicators: { OECD_TAXWEDGE: pp('Tax Wedge (single, avg wage)', '% of labour cost', 1) },
  },
  {
    tag: 'BIS', kind: 'macro', file: join(TD, 'credit_debt', 'bis_credit_tidy.csv'),
    source: 'Bank for International Settlements — Credit statistics', license: 'BIS terms — public data',
    url: 'https://www.bis.org/statistics/totcredit.htm',
    indicators: {
      BIS_CREDIT_PNFS: pp('Credit to Private Non-financial Sector', '% of GDP', 1),
      BIS_CREDIT_HH: pp('Credit to Households', '% of GDP', 1),
      BIS_CREDIT_GOV: pp('Credit to Government', '% of GDP', 1),
    },
  },
];

async function parseSource(src) {
  let text;
  try {
    text = await readFile(src.file, 'utf8');
  } catch {
    console.log(`– ${src.tag}: source missing, skipped`);
    return 0;
  }
  // code → country → { region, iso, byYear }, plus per-code year coverage
  const byCode = new Map(Object.keys(src.indicators).map((c) => [c, new Map()]));
  const yearCounts = new Map(Object.keys(src.indicators).map((c) => [c, new Map()]));
  for (const row of parseCsvObjects(text)) {
    const cfg = src.indicators[row.indicator_code];
    if (!cfg) continue;
    const v = Number(row.value);
    if (!row.country || row.value === '' || Number.isNaN(v)) continue;
    const map = byCode.get(row.indicator_code);
    let rec = map.get(row.country);
    if (!rec) map.set(row.country, (rec = { region: enRegion(row.region), iso: (row.iso3 || '').toUpperCase(), byYear: {} }));
    rec.byYear[row.year] = v;
    const yc = yearCounts.get(row.indicator_code);
    yc.set(row.year, (yc.get(row.year) ?? 0) + 1);
  }

  let written = 0;
  for (const [code, cfg] of Object.entries(src.indicators)) {
    const keep = pickPeriodsN(yearCounts.get(code), 8);
    if (keep.length < 2) {
      console.log(`  – ${cfg.title} (${src.tag}): not enough years, skipped`);
      continue;
    }
    const data = [];
    for (const [country, rec] of byCode.get(code)) {
      for (const period of keep) {
        let v = rec.byYear[period];
        if (v == null) continue;
        if (cfg.scale) v *= cfg.scale;
        data.push({ entity: country, group: rec.region, period, value: round(v, cfg.dp), iso: rec.iso });
      }
    }
    if (!data.length) continue;
    const slug = `${src.tag.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    await writeDataset(src.kind, slug, {
      title: `${cfg.title} (${src.tag})`,
      summary: `${cfg.title}. ${src.source}, ${keep[0]}–${keep.at(-1)}.`,
      unit: cfg.unit,
      valueLabel: cfg.title,
      changeMode: cfg.mode,
      source: src.source,
      license: src.license,
      url: src.url,
      parsedAt: today,
    }, data);
    written++;
  }
  return written;
}

async function main() {
  console.log('Tidy sources → WDI, QoG, V-Dem, Maddison, PWT, OECD, BIS');
  let total = 0;
  for (const src of SOURCES) total += await parseSource(src);
  console.log(`✓ ${total} datasets written.`);
}

main().catch((err) => {
  console.error('✗ parse_tidy failed:', err.message);
  process.exit(1);
});
