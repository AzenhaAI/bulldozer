/**
 * Parse curated public survey aggregates into BullDozer datasets:
 *  - Gapminder ddf datapoints (country-level indicators)
 *  - World Happiness Report tidy export (Cantril ladder)
 *
 *   node scripts/parse_surveys.mjs
 *   GAPMINDER_DIR=/path WHR_CSV=/path node scripts/parse_surveys.mjs
 *
 * Sources are local/curated (iCloud BK/Opros, tableau_data); output committed.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCsvRows, parseCsvObjects } from './lib/csv.mjs';
import { enRegion, REGION_4, latestN, pickPeriodsN, writeDataset, round } from './lib/datasets.mjs';

const ICLOUD = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
const GAPMINDER_DIR = process.env.GAPMINDER_DIR || join(ICLOUD, 'BK', 'Opros', 'Inter_survey', 'Gapminder');
const WHR_CSV = process.env.WHR_CSV || join(homedir(), 'Documents', 'tableau_data', 'happiness', 'whr_tidy.csv');

const GAPMINDER_SRC = {
  source: 'Gapminder (open data, ddf)',
  license: 'CC BY 4.0',
  url: 'https://www.gapminder.org/data/',
  parsedAt: new Date().toISOString().slice(0, 10),
};

// gapminder-life-expectancy and gapminder-income are NOT here on purpose.
// parse_gapminder_long.mjs publishes both from the long open-numbers series
// (1800 onwards) into macro/. Parsing them here as well put two entries under
// one slug on every country page — Singapore's life expectancy showed as both
// #1 and #9 in the world, and Cyprus's as #5 (from a 2013 IHME vintage) beside
// #26 (2020), with no year on either. Same title, same page, different answer.
const GAPMINDER = [
  { file: 'ddf--datapoints--hdi_human_development_index--by--geo--time.csv',
    slug: 'gapminder-hdi', title: 'Human Development Index', unit: 'index 0–1', valueLabel: 'HDI', changeMode: 'pp', dp: 3,
    summary: 'Composite index of life expectancy, education and income (0–1).' },
  { file: 'ddf--datapoints--literacy_rate_adult_total_percent_of_people_ages_15_and_above--by--geo--time.csv',
    slug: 'gapminder-literacy', title: 'Adult Literacy', unit: '%', valueLabel: 'Adult literacy rate', changeMode: 'pp', dp: 1,
    summary: 'Share of people aged 15+ who can read and write.' },
  { file: 'ddf--datapoints--inequality_index_gini--by--geo--time.csv',
    slug: 'gapminder-gini', title: 'Income Inequality (Gini)', unit: 'index 0–100', valueLabel: 'Gini index', changeMode: 'pp', dp: 1,
    summary: 'Gini index of income inequality (0 = equal, 100 = unequal).' },
  { file: 'ddf--datapoints--internet_users--by--geo--time.csv',
    slug: 'gapminder-internet', title: 'Internet Users', unit: '%', valueLabel: 'Internet users', changeMode: 'pp', dp: 1,
    summary: 'Share of the population using the internet.' },
  { file: 'ddf--datapoints--energy_use_per_person--by--geo--time.csv',
    slug: 'gapminder-energy', title: 'Energy Use per Person', unit: 'kg oil eq', valueLabel: 'Energy use', changeMode: 'pct', dp: 0,
    summary: 'Energy use per person, kg of oil equivalent.' },
  { file: 'ddf--datapoints--gdp_per_capita_yearly_growth--by--geo--time.csv',
    slug: 'gapminder-gdp-growth', title: 'GDP per Capita Growth', unit: '% YoY', valueLabel: 'GDP/capita growth', changeMode: 'pp', dp: 1,
    summary: 'Annual growth of GDP per capita.' },
  { file: 'ddf--datapoints--median_age_years--by--geo--time.csv',
    slug: 'gapminder-median-age', title: 'Median Age', unit: 'years', valueLabel: 'Median age', changeMode: 'pp', dp: 1,
    summary: 'Median age of the population.' },
  { file: 'ddf--datapoints--murder_per_100000_people--by--geo--time.csv',
    slug: 'gapminder-homicide', title: 'Homicide Rate', unit: 'per 100k', valueLabel: 'Homicides', changeMode: 'pct', dp: 1,
    summary: 'Intentional homicides per 100,000 people.' },
  { file: 'ddf--datapoints--urban_population_percent_of_total--by--geo--time.csv',
    slug: 'gapminder-urban', title: 'Urban Population', unit: '%', valueLabel: 'Urban population', changeMode: 'pp', dp: 1,
    summary: 'Share of the population living in urban areas.' },
  { file: 'ddf--datapoints--population_density_per_square_km--by--geo--time.csv',
    slug: 'gapminder-density', title: 'Population Density', unit: 'per km²', valueLabel: 'Population density', changeMode: 'pct', dp: 1,
    summary: 'People per square kilometre of land area.' },
];

async function loadGeoMap() {
  const text = await readFile(join(GAPMINDER_DIR, 'ddf--entities--geo--country.csv'), 'utf8');
  const map = new Map();
  for (const row of parseCsvObjects(text)) {
    if (row['is--country'] !== 'TRUE') continue;
    map.set(row.country, {
      name: row.name || row.country,
      region: REGION_4[row.world_4region] || 'Other',
      iso: (row.iso3166_1_alpha3 || '').toUpperCase(),
    });
  }
  return map;
}

async function parseGapminder(geoMap) {
  for (const cfg of GAPMINDER) {
    let text;
    try {
      text = await readFile(join(GAPMINDER_DIR, cfg.file), 'utf8');
    } catch {
      console.log(`  – ${cfg.slug}: source missing, skipped`);
      continue;
    }
    const header = parseCsvRows(text.slice(0, text.indexOf('\n')))[0];
    const valueKey = header.find((h) => h !== 'geo' && h !== 'time');

    // geo → year → value, plus coverage count per year
    const byGeo = new Map();
    const yearCounts = new Map();
    for (const row of parseCsvObjects(text)) {
      if (!geoMap.has(row.geo)) continue;
      const v = Number(row[valueKey]);
      if (Number.isNaN(v)) continue;
      yearCounts.set(row.time, (yearCounts.get(row.time) ?? 0) + 1);
      let rec = byGeo.get(row.geo);
      if (!rec) byGeo.set(row.geo, (rec = {}));
      rec[row.time] = v;
    }
    // Cap at the current year — some Gapminder series carry projections to 2100.
    const keep = pickPeriodsN(yearCounts, 8, new Date().getFullYear());
    if (keep.length < 2) {
      console.log(`  – ${cfg.slug}: not enough years, skipped`);
      continue;
    }

    const data = [];
    for (const [geo, rec] of byGeo) {
      const g = geoMap.get(geo);
      for (const period of keep) {
        if (rec[period] == null) continue;
        data.push({ entity: g.name, group: g.region, period, value: round(rec[period], cfg.dp), iso: g.iso });
      }
    }
    await writeDataset('survey', cfg.slug, {
      title: cfg.title,
      summary: `${cfg.summary} Gapminder, ${keep[0]}–${keep.at(-1)}.`,
      unit: cfg.unit,
      valueLabel: cfg.valueLabel,
      changeMode: cfg.changeMode,
      ...GAPMINDER_SRC,
    }, data);
  }
}

// WHR country name → ISO alpha-3, via Gapminder names plus a few aliases.
function buildName2Iso(geoMap) {
  const m = new Map();
  for (const g of geoMap.values()) if (g.iso) m.set(g.name.toLowerCase(), g.iso);
  const alias = {
    'united states': 'USA', 'south korea': 'KOR', 'republic of korea': 'KOR', 'russia': 'RUS',
    'russian federation': 'RUS', 'czechia': 'CZE', 'turkiye': 'TUR', 'türkiye': 'TUR', 'turkey': 'TUR',
    'taiwan province of china': 'TWN', 'hong kong s.a.r. of china': 'HKG', 'hong kong sar of china': 'HKG',
    'congo (brazzaville)': 'COG', 'congo': 'COG', 'congo (kinshasa)': 'COD', 'dr congo': 'COD',
    'ivory coast': 'CIV', 'côte d’ivoire': 'CIV', "cote d'ivoire": 'CIV', 'state of palestine': 'PSE',
    'palestinian territories': 'PSE', 'eswatini': 'SWZ', 'laos': 'LAO', 'lao pdr': 'LAO',
    'vietnam': 'VNM', 'viet nam': 'VNM', 'united arab emirates': 'ARE', 'united kingdom': 'GBR',
    'slovakia': 'SVK', 'kyrgyzstan': 'KGZ', 'republic of moldova': 'MDA', 'moldova': 'MDA', 'kosovo': 'XKX',
  };
  for (const [k, v] of Object.entries(alias)) m.set(k, v);
  return m;
}

const WHR_INDICATORS = {
  Ladder: { slug: 'whr-happiness', title: 'Happiness (Cantril Ladder)', unit: 'score 0–10', valueLabel: 'Life evaluation',
    summary: 'Self-reported life evaluation on a 0–10 ladder.' },
  GDP: { slug: 'whr-driver-gdp', title: 'Happiness Driver: GDP', unit: 'ladder pts', valueLabel: 'GDP contribution',
    summary: 'Contribution of GDP per capita to the happiness score.' },
  Social: { slug: 'whr-driver-social', title: 'Happiness Driver: Social Support', unit: 'ladder pts', valueLabel: 'Social support contribution',
    summary: 'Contribution of social support to the happiness score.' },
  Health: { slug: 'whr-driver-health', title: 'Happiness Driver: Healthy Life Expectancy', unit: 'ladder pts', valueLabel: 'Health contribution',
    summary: 'Contribution of healthy life expectancy to the happiness score.' },
  Freedom: { slug: 'whr-driver-freedom', title: 'Happiness Driver: Freedom', unit: 'ladder pts', valueLabel: 'Freedom contribution',
    summary: 'Contribution of freedom to make life choices to the happiness score.' },
  Generosity: { slug: 'whr-driver-generosity', title: 'Happiness Driver: Generosity', unit: 'ladder pts', valueLabel: 'Generosity contribution',
    summary: 'Contribution of generosity to the happiness score.' },
  Corruption: { slug: 'whr-driver-corruption', title: 'Happiness Driver: Low Corruption', unit: 'ladder pts', valueLabel: 'Low-corruption contribution',
    summary: 'Contribution of perceived low corruption to the happiness score.' },
};

async function parseWHR(geoMap) {
  let text;
  try {
    text = await readFile(WHR_CSV, 'utf8');
  } catch {
    console.log('  – whr: source missing, skipped');
    return;
  }
  const name2iso = buildName2Iso(geoMap);

  // code → country → { region, byYear }
  const byCode = new Map(Object.keys(WHR_INDICATORS).map((c) => [c, new Map()]));
  const yearsByCode = new Map(Object.keys(WHR_INDICATORS).map((c) => [c, new Set()]));
  for (const row of parseCsvObjects(text)) {
    const cfg = WHR_INDICATORS[row.indicator_code];
    if (!cfg) continue;
    const v = Number(row.value);
    if (Number.isNaN(v)) continue;
    yearsByCode.get(row.indicator_code).add(row.year);
    const map = byCode.get(row.indicator_code);
    let rec = map.get(row.country);
    if (!rec) map.set(row.country, (rec = { region: enRegion(row.region), byYear: {} }));
    rec.byYear[row.year] = v;
  }

  for (const [code, cfg] of Object.entries(WHR_INDICATORS)) {
    const keep = latestN([...yearsByCode.get(code)], 8);
    if (keep.length < 2) continue;
    const data = [];
    for (const [country, rec] of byCode.get(code)) {
      for (const period of keep) {
        if (rec.byYear[period] == null) continue;
        data.push({ entity: country, group: rec.region, period, value: round(rec.byYear[period], 3), iso: name2iso.get(country.toLowerCase()) || '' });
      }
    }
    await writeDataset('survey', cfg.slug, {
      title: cfg.title,
      summary: `${cfg.summary} World Happiness Report, ${keep[0]}–${keep.at(-1)}.`,
      unit: cfg.unit,
      valueLabel: cfg.valueLabel,
      changeMode: 'pp',
      source: 'World Happiness Report (Gallup World Poll)',
      license: 'CC BY 4.0',
      url: 'https://worldhappiness.report/',
      parsedAt: new Date().toISOString().slice(0, 10),
    }, data);
  }
}

async function main() {
  console.log('Surveys → Gapminder + World Happiness Report');
  let geoMap;
  try {
    geoMap = await loadGeoMap();
  } catch {
    console.error(`✗ Gapminder entities not found in ${GAPMINDER_DIR}. Skipping Gapminder.`);
    geoMap = new Map();
  }
  if (geoMap.size) await parseGapminder(geoMap);
  await parseWHR(geoMap);
}

main().catch((err) => {
  console.error('✗ parse_surveys failed:', err.message);
  process.exit(1);
});
