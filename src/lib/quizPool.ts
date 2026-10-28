import { buildCountryIndex, countrySlug } from '@lib/countryIndex';
import { flagFor } from '@lib/flags';
import { formatNum } from '@lib/format';

/** One quiz country: pre-formatted fact strings, flag kept separate as the give-away clue. */
export interface QuizCountry {
  name: string;
  region: string;
  flag: string;
  slug: string;
  facts: string[];
}

// Clue vocabulary: recognisable indicators across topics, one line per fact.
const CLUE_DEFS: { slug: string; label: string; fmt: (v: number) => string }[] = [
  { slug: 'imf-population', label: 'Population', fmt: (v) => `${formatNum(v)} million people` },
  { slug: 'imf-gdp-per-capita', label: 'GDP per capita', fmt: (v) => `$${formatNum(v)}` },
  { slug: 'wb-life-expectancy', label: 'Life expectancy', fmt: (v) => `${formatNum(v)} years` },
  { slug: 'gapminder-median-age', label: 'Median age', fmt: (v) => `${formatNum(v)} years` },
  { slug: 'gapminder-urban', label: 'Urban population', fmt: (v) => `${formatNum(v)}%` },
  { slug: 'gapminder-internet', label: 'Internet users', fmt: (v) => `${formatNum(v)}%` },
  { slug: 'whr-happiness', label: 'Happiness score', fmt: (v) => `${formatNum(v)} / 10` },
  { slug: 'qog-ti-cpi', label: 'Corruption Perceptions Index', fmt: (v) => `${formatNum(v)} / 100` },
  { slug: 'imf-inflation', label: 'Inflation', fmt: (v) => `${formatNum(v)}% a year` },
  { slug: 'who-obesity', label: 'Adult obesity', fmt: (v) => `${formatNum(v)}%` },
  { slug: 'owid-schooling', label: 'Mean years of schooling', fmt: (v) => `${formatNum(v)} years` },
  { slug: 'wb-sp-dyn-tfrt-in', label: 'Fertility rate', fmt: (v) => `${formatNum(v)} births per woman` },
  { slug: 'gapminder-homicide', label: 'Homicide rate', fmt: (v) => `${formatNum(v)} per 100k` },
  { slug: 'v-dem-v2x-libdem', label: 'Liberal democracy index', fmt: (v) => `${formatNum(v)} / 1` },
  { slug: 'wb-mobile-subscriptions', label: 'Mobile subscriptions', fmt: (v) => `${formatNum(v)} per 100 people` },
];

let cached: QuizCountry[] | null = null;

/** Countries with enough facts to fill a round; built once per build. */
export function buildQuizPool(): QuizCountry[] {
  if (cached) return cached;
  cached = buildCountryIndex().flatMap((c) => {
    const byDsSlug = new Map(c.items.map((it) => [it.slug, it]));
    const facts = CLUE_DEFS.flatMap((d) => {
      const it = byDsSlug.get(d.slug);
      return it ? [`${d.label}: ${d.fmt(it.value)} · #${it.rank} of ${it.total}`] : [];
    });
    const flag = flagFor(c.iso);
    if (facts.length < 8 || !flag) return [];
    return [{ name: c.name, region: c.region || 'Other', flag, slug: countrySlug(c.name), facts }];
  });
  return cached;
}
