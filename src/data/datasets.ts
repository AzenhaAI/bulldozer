/**
 * Dataset registry. Every dataset is PUBLIC and parsed from an open source —
 * provenance (source, licence, url, parsedAt) is mandatory and surfaced in the
 * UI. JSON files in ./surveys and ./macro are auto-registered, so the parsers
 * (scripts/parse_*.mjs) can add datasets without touching code.
 */
import { SUPERSEDED, DUPLICATE_OF } from '@lib/superseded';
import type { Observation } from '@lib/analytics';
import { isOpinionSurvey, topicFor, topicOverride } from '@lib/topics';
import { methodologyFor, type StatsNote } from '@data/methodology';
import { betterFor } from '@lib/polarity';
import { canonIso } from '@lib/geo';
import firstSeenMap from '@data/first-seen.json';

export type DatasetKind = 'survey' | 'macro';
export type ChangeMode = 'pct' | 'pp';

export interface DatasetMeta {
  slug: string;
  title: string;
  kind: DatasetKind;
  /** A fresher series of ours that measures the same thing (lib/superseded.ts). */
  supersededBy?: string;
  summary: string;
  source: string;
  license: string;
  url: string;
  parsedAt: string; // ISO date of the last RE-parse, not of arrival — see firstSeen
  /** Date the dataset first appeared (scripts/gen_first_seen.mjs, from git). */
  firstSeen?: string;
  unit: string;
  valueLabel: string;
  /** How period-over-period change is expressed: percentage points for
   *  rate/percentage data, multiplicative percent for counts/volumes. */
  changeMode: ChangeMode;
  /** Topic id (see lib/topics) for grouping the lists. */
  topic: string;
  /** Honest period label when the stored period is synthetic (pooled/single wave). */
  vintage?: string;
  /** One-line methodology note (weighting, item, projection caveat). */
  method?: string;
  /** Sourced note on what the official statistics office no longer publishes. */
  notes?: StatsNote;
  /** 'high' or 'low' when one direction is plainly better; absent when neutral. */
  better?: 'high' | 'low';
  /** Countries are measured in different years (household surveys): profiles
   *  rank each country's latest reading against the others', not one year's. */
  latestPerCountry?: boolean;
  /** 'company' when the entities are companies, not countries (the SEC
   *  company-metrics datasets): no map, no country profiles, kept out of the
   *  country explorers. Absent = countries. */
  entityType?: 'company';
  /** First projected year (IMF WEO): drawn dashed, left out of trends. */
  projectedFrom?: string;
  /** Values are codes on a category scale (Freedom House 1 = Free … 3 = Not
   *  free): shown by name, mapped by category, never averaged or "changed by
   *  0.00 points". */
  categories?: Record<string, string>;
}

export interface Dataset extends DatasetMeta {
  data: Observation[];
}

interface RawDataset {
  meta: Omit<DatasetMeta, 'slug' | 'changeMode' | 'topic'> & { changeMode?: ChangeMode; topic?: string };
  data: Observation[];
}

/** Percentage / rate units compare in percentage points; counts multiplicatively. */
function deriveChangeMode(unit: string): ChangeMode {
  return unit.includes('%') ? 'pp' : 'pct';
}

/** Category scales, by slug: code → name. */
const CATEGORIES: Record<string, Record<string, string>> = {
  'qog-fh-status': { 1: 'Free', 2: 'Partly free', 3: 'Not free' },
};

/** One reading per country, spread over several years: the World Bank "most
 *  recent value" pulls (market cap, exchange rate, bank branches…). Such a
 *  series has no trend, so it is ranked as each country's latest reading
 *  (latestPerCountry) rather than as a time series of near-empty years. */
function oneReadingEach(data: Observation[]): boolean {
  const seen = new Set<string>();
  for (const o of data) {
    const k = o.iso ?? o.entity;
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return new Set(data.map((o) => o.period)).size > 1;
}

const surveyModules = import.meta.glob<{ default: RawDataset }>('./surveys/*.json', { eager: true });
const macroModules = import.meta.glob<{ default: RawDataset }>('./macro/*.json', { eager: true });

function build(modules: Record<string, { default: RawDataset }>): Dataset[] {
  return Object.entries(modules).map(([path, mod]) => {
    const slug = path.split('/').pop()!.replace(/\.json$/, '');
    const raw = mod.default;
    return {
      slug,
      ...raw.meta,
      // kind reflects opinion surveys vs objective statistics, not the source folder
      kind: isOpinionSurvey(slug) ? 'survey' : 'macro',
      topic: topicOverride(slug) ?? raw.meta.topic ?? topicFor(slug),
      changeMode: raw.meta.changeMode ?? deriveChangeMode(raw.meta.unit),
      ...methodologyFor(slug),
      // Which way is better, where that is plain (lib/polarity.ts); absent = neutral.
      ...(betterFor(slug) ? { better: betterFor(slug) } : {}),
      firstSeen: (firstSeenMap as Record<string, string>)[slug],
      ...(raw.meta.latestPerCountry == null && oneReadingEach(raw.data) ? { latestPerCountry: true } : {}),
      ...(CATEGORIES[slug] ? { categories: CATEGORIES[slug] } : {}),
      // A fresher series of ours measures the same thing (lib/superseded.ts).
      ...(SUPERSEDED[slug] ? { title: `${raw.meta.title} (historical)`, supersededBy: SUPERSEDED[slug] } : {}),
      ...(DUPLICATE_OF[slug] ? { supersededBy: DUPLICATE_OF[slug] } : {}),
      // fold alternate ISO codes (IMF's UVK/WBG) onto the canonical spelling
      data: raw.data.map((o) => {
        const iso = canonIso(o.iso);
        return iso === o.iso ? o : { ...o, iso };
      }),
    };
  });
}

export const datasets: Dataset[] = [...build(surveyModules), ...build(macroModules)].sort((a, b) =>
  a.title.localeCompare(b.title),
);

export function getDataset(slug: string): Dataset | undefined {
  return datasets.find((d) => d.slug === slug);
}

/** Datasets whose entities are countries — the ones maps, country profiles
 *  and the cross-country explorers can use. */
export const isCountryDataset = (d: Pick<DatasetMeta, 'entityType'>): boolean => d.entityType !== 'company';

export function datasetsByKind(kind: DatasetKind): Dataset[] {
  return datasets.filter((d) => d.kind === kind);
}

/** Datasets that first appeared within `windowDays` of `now`, newest first.
 *
 *  Everything in the window, not only the latest batch: showing one batch meant
 *  the next one hid it, however recent — fourteen mortality series dropped off
 *  the home page two weeks after they landed, the day four more arrived. Fails
 *  closed: a dataset with no firstSeen is never new. `now` is the build date,
 *  so the section goes quiet on its own and nobody has to remove it.
 */
export function recentlyAdded(windowDays = 30, now = new Date()): { date: string; items: Dataset[] } | null {
  const age = (d: string) => (now.getTime() - new Date(d + 'T00:00:00Z').getTime()) / 86_400_000;
  const items = datasets
    .filter((d) => d.firstSeen && age(d.firstSeen) <= windowDays)
    .sort((a, b) => (b.firstSeen ?? '').localeCompare(a.firstSeen ?? '') || a.title.localeCompare(b.title));
  return items.length ? { date: items[0].firstSeen!, items } : null;
}
