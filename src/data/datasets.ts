/**
 * Dataset registry. Every dataset is PUBLIC and parsed from an open source —
 * provenance (source, licence, url, parsedAt) is mandatory and surfaced in the
 * UI. JSON files in ./surveys and ./macro are auto-registered, so the parsers
 * (scripts/parse_*.mjs) can add datasets without touching code.
 */
import type { Observation } from '@lib/analytics';
import { isOpinionSurvey, topicFor, topicOverride } from '@lib/topics';
import { methodologyFor } from '@data/methodology';
import { canonIso } from '@lib/geo';
import firstSeenMap from '@data/first-seen.json';

export type DatasetKind = 'survey' | 'macro';
export type ChangeMode = 'pct' | 'pp';

export interface DatasetMeta {
  slug: string;
  title: string;
  kind: DatasetKind;
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
      firstSeen: (firstSeenMap as Record<string, string>)[slug],
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

export function datasetsByKind(kind: DatasetKind): Dataset[] {
  return datasets.filter((d) => d.kind === kind);
}

/** The newest cohort of datasets, if it arrived within `windowDays` of `now`.
 *
 *  A cohort, not "everything in the window": datasets arrive in batches, and
 *  one batch is what a returning visitor has not seen. Fails closed — a dataset
 *  with no firstSeen is never new. `now` is the build date, so the strip goes
 *  quiet on its own once the batch is a month old and nobody has to remove it.
 */
export function recentlyAdded(windowDays = 30, now = new Date()): { date: string; items: Dataset[] } | null {
  const dates = datasets.map((d) => d.firstSeen).filter((d): d is string => !!d).sort();
  const date = dates.at(-1);
  if (!date) return null;
  const age = (now.getTime() - new Date(date + 'T00:00:00Z').getTime()) / 86_400_000;
  if (age > windowDays) return null;
  return { date, items: datasets.filter((d) => d.firstSeen === date).sort((a, b) => a.title.localeCompare(b.title)) };
}
