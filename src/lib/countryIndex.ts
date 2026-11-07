/**
 * Per-country profile index: every indicator's latest value + world rank.
 * Shared by the /data/country-index.json endpoint (interactive Geo panel)
 * and the static /country/[slug] SEO pages.
 */
import { SUPERSEDED } from '@lib/superseded';
import { datasets } from '@data/datasets';
import { bestCountryName } from '@lib/geo';
import countryNames from '@data/country-names.json';

const NAMES: Record<string, { common: string; official: string }> = countryNames;

// Women and men beside the headline, where the upstream publishes the series by
// sex (scripts/parse_sex_splits.mjs). Shown only when the split is for the same
// year as the headline, so the three numbers never disagree about when.
type SexSplit = { meta: { slug: string }; bySex: Record<string, { period: string; female: number; male: number }> };
const SPLITS = Object.values(import.meta.glob('../data/splits/*.json', { eager: true, import: 'default' })) as SexSplit[];
const SEX = new Map(SPLITS.map((s) => [s.meta.slug, s.bySex]));

export interface CountryItem {
  slug: string;
  title: string;
  kind: string;
  topic: string;
  unit: string;
  value: number;
  period: string;
  rank: number;
  total: number;
  /** This country's earliest period in the series and how many periods it has:
   *  1 means a single figure, so no trend to show (testers' R15, 2 Nov 2026). */
  first: string;
  years: number;
  /** Which way is better, when plain (lib/polarity.ts) — the rank alone does not say. */
  better?: 'high' | 'low';
  /** Women and men for the same period, when the source publishes them. */
  sex?: { female: number; male: number };
}

export interface CountryProfile {
  iso: string;
  name: string;
  /** Official Latin name (e.g. "Republic of Korea"), when known. */
  official?: string;
  region: string;
  items: CountryItem[];
}

let cache: CountryProfile[] | null = null;

export function buildCountryIndex(): CountryProfile[] {
  if (cache) return cache;
  const byIso: Record<string, CountryProfile> = {};
  // sources spell the same country differently; vote on a clean display name
  const nameVotes: Record<string, Map<string, number>> = {};

  // Countries each fresher series covers, so a superseded series is dropped only
  // where its replacement actually has the country: Anguilla's population exists
  // only in Gapminder's 2013 figure, and that stays, dated, rather than nothing.
  const covered = new Map<string, Set<string>>();
  for (const ds of datasets) {
    if (!Object.values(SUPERSEDED).includes(ds.slug)) continue;
    covered.set(ds.slug, new Set(ds.data.filter((o) => o.iso).map((o) => o.iso!)));
  }

  for (const ds of datasets) {
    const replacedIn = ds.supersededBy ? covered.get(ds.supersededBy) : undefined;
    const periods = [...new Set(ds.data.map((o) => o.period))].sort();
    const period = periods[periods.length - 1];
    const rows = ds.data.filter((o) => o.period === period && o.iso);
    const ranked = [...rows].sort((a, b) => b.value - a.value);
    const total = ranked.length;
    const own = new Map<string, Set<string>>();
    for (const o of ds.data) if (o.iso) (own.get(o.iso) ?? own.set(o.iso, new Set()).get(o.iso)!).add(o.period);
    ranked.forEach((o, i) => {
      const iso = o.iso!;
      // One number per question: where a fresher series has this country, the
      // superseded one is history, not a profile line.
      if (replacedIn?.has(iso)) return;
      if (!byIso[iso]) byIso[iso] = { iso, name: o.entity, region: o.group ?? '', items: [] };
      const votes = (nameVotes[iso] ??= new Map());
      votes.set(o.entity, (votes.get(o.entity) ?? 0) + 1);
      byIso[iso].items.push({
        slug: ds.slug, title: ds.title, kind: ds.kind, topic: ds.topic, unit: ds.unit,
        value: o.value, period, rank: i + 1, total,
        first: [...own.get(iso)!].sort()[0], years: own.get(iso)!.size,
        ...(ds.better ? { better: ds.better } : {}),
        ...((sx) => (sx && sx.period === period ? { sex: { female: sx.female, male: sx.male } } : {}))(SEX.get(ds.slug)?.[iso]),
      });
    });
  }

  for (const c of Object.values(byIso)) {
    // Prefer the canonical international name; fall back to a voted source name
    // for non-standard codes (survey sub-entities like Zanzibar/Somaliland).
    const canon = NAMES[c.iso];
    c.name = canon?.common ?? bestCountryName(nameVotes[c.iso]);
    if (canon && canon.official !== canon.common) c.official = canon.official;
    c.items.sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title) : a.kind < b.kind ? 1 : -1));
  }

  cache = Object.values(byIso)
    .filter((c) => c.items.length >= 5)
    .sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}

/** URL slug from a country name: "Korea, Rep." → "korea-rep". */
export function countrySlug(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Nearest neighbours by Euclidean distance on shared rank percentiles. */
export function similarCountries(target: CountryProfile, all: CountryProfile[], n = 5): { c: CountryProfile; match: number }[] {
  const pct = (c: CountryProfile) => new Map(c.items.map((it) => [it.slug, 1 - (it.rank - 1) / Math.max(1, it.total - 1)]));
  const tp = pct(target);
  const scored: { c: CountryProfile; match: number }[] = [];
  for (const c of all) {
    if (c.iso === target.iso) continue;
    const cp = pct(c);
    let sum = 0, k = 0;
    for (const [slug, v] of tp) {
      const w = cp.get(slug);
      if (w !== undefined) { sum += (v - w) ** 2; k++; }
    }
    // A territory with a dozen indicators could "match" on those alone:
    // Kazakhstan's closest were Zanzibar, Somaliland and New Caledonia. The
    // comparison has to cover a real share of the target's own profile.
    if (k < Math.max(8, Math.round(tp.size * 0.4))) continue;
    scored.push({ c, match: Math.max(0, 1 - Math.sqrt(sum / k)) });
  }
  return scored.sort((a, b) => b.match - a.match).slice(0, n);
}
