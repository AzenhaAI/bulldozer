/**
 * A country brief: what the catalogue holds on a country, and where it stands
 * out in the world. The "Ask AI" screen in the app shows it.
 *
 * Nothing here is written, only selected: every line is a published value
 * with its year, its rank and its source, so a brief cannot state a figure
 * the data does not hold. The app labels the screen as in development; a
 * model may later phrase these lines, but it will be handed this and nothing
 * else.
 *
 * How a line is chosen:
 *  - the series covers at least 50 countries, so a rank means something;
 *  - the value is from 2020 or later, so it describes the country now;
 *  - the country is in the top or bottom tenth of the world (at least three
 *    places either way);
 *  - one line per topic, the most extreme, up to six in all;
 *  - "highest" and "lowest", never "best" or "worst": #1 on child mortality
 *    is the worst place to be born.
 */
import { buildCountryIndex, type CountryProfile } from '@lib/countryIndex';
import { getDataset } from '@data/datasets';
import { TOPICS } from '@lib/topics';

// Series that rank but do not describe the country on their own.
const SKIP_PREFIX = [
  'whr-driver-',   // pieces of the happiness score's decomposition, not measures
];
const SKIP = new Set([
  'wrp-discrimination', // a reading around 1% nearly everywhere: rank is noise
]);

export interface BriefLine {
  slug: string; title: string; topic: string; unit: string;
  value: number; period: string; rank: number; total: number;
  side: 'high' | 'low'; source: string;
}
export interface CountryBrief {
  iso: string; name: string; region: string;
  indicators: number; since: string; latest: string;
  topics: { id: string; label: string; count: number }[];
  standouts: BriefLine[];
}

const year = (p: string) => Number(String(p).match(/\d{4}/)?.[0] ?? 0);

export function briefFor(c: CountryProfile): CountryBrief {
  const counts = new Map<string, number>();
  for (const it of c.items) counts.set(it.topic, (counts.get(it.topic) ?? 0) + 1);
  const years = c.items.map((it) => year(it.period)).filter(Boolean).sort((a, b) => a - b);

  const candidates = c.items
    .filter((it) => it.total >= 50 && year(it.period) >= 2020)
    .filter((it) => !SKIP.has(it.slug) && !SKIP_PREFIX.some((p) => it.slug.startsWith(p)))
    .map((it) => {
      const band = Math.max(3, Math.floor(it.total / 10));
      const side: 'high' | 'low' | null = it.rank <= band ? 'high' : it.rank > it.total - band ? 'low' : null;
      const edge = side === 'high' ? (it.rank - 1) / it.total : (it.total - it.rank) / it.total;
      return { it, side, edge };
    })
    .filter((x) => x.side)
    .sort((a, b) => a.edge - b.edge);

  const perTopic = new Set<string>();
  const standouts: BriefLine[] = [];
  for (const { it, side } of candidates) {
    if (perTopic.has(it.topic) || standouts.length >= 6) continue;
    perTopic.add(it.topic);
    standouts.push({
      slug: it.slug, title: it.title, topic: it.topic, unit: it.unit, value: it.value,
      period: String(it.period), rank: it.rank, total: it.total, side: side!,
      source: getDataset(it.slug)?.source ?? '',
    });
  }

  return {
    iso: c.iso, name: c.name, region: c.region,
    indicators: c.items.length, since: String(years[0] ?? ''), latest: String(years.at(-1) ?? ''),
    topics: [...counts.entries()].sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, label: TOPICS[id]?.label ?? id, count })),
    standouts,
  };
}

export const allBriefs = () => buildCountryIndex().map(briefFor);
