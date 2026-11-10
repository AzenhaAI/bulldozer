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

// Splits beside the headline — women and men, younger and older, poorer and
// richer — where the upstream publishes them (scripts/parse_splits.mjs). Shown
// only when the split is for the same year as the headline, so the numbers
// never disagree about when.
type Pair = { period: string; a: number; b: number };
type SplitFile = {
  meta: { slug: string; dims?: Record<string, [string, string]> };
  bySex?: Record<string, { period: string; female: number; male: number }>;
  byAge?: Record<string, Pair>;
  byIncome?: Record<string, Pair>;
};
export type SplitDim = 'sex' | 'age' | 'income';
export interface Split { dim: SplitDim; labels: [string, string]; a: number; b: number }
const SPLIT_FILES = Object.values(import.meta.glob('../data/splits/*.json', { eager: true, import: 'default' })) as SplitFile[];
const SPLIT = new Map(SPLIT_FILES.map((f) => [f.meta.slug, f]));

function pairs(f: SplitFile, dim: SplitDim): Record<string, Pair> {
  if (dim === 'sex') return Object.fromEntries(Object.entries(f.bySex ?? {}).map(([k, v]) => [k, { period: v.period, a: v.female, b: v.male }]));
  return (dim === 'age' ? f.byAge : f.byIncome) ?? {};
}

function splitsFor(slug: string, iso: string, period: string): Split[] {
  const f = SPLIT.get(slug);
  if (!f) return [];
  const out: Split[] = [];
  for (const dim of ['sex', 'age', 'income'] as SplitDim[]) {
    const p = pairs(f, dim)[iso];
    if (p && p.period === period) out.push({ dim, labels: f.meta.dims?.[dim] ?? (dim === 'sex' ? ['Women', 'Men'] : ['A', 'B']), a: p.a, b: p.b });
  }
  return out;
}

/** Lowest and highest value of either group across every country in a split —
 *  the axis the profile's scale is drawn on. */
export function splitRange(slug: string, dim: SplitDim): { min: number; max: number; n: number } | null {
  const f = SPLIT.get(slug);
  if (!f) return null;
  const rows = Object.values(pairs(f, dim));
  const vals = rows.flatMap((r) => [r.a, r.b]);
  return vals.length ? { min: Math.min(...vals), max: Math.max(...vals), n: rows.length } : null;
}

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
  /** Every split for the same period: sex, age group, income group. */
  splits?: Split[];
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
    // Usually one year for everyone; for latestPerCountry series, each country's
    // newest reading from the last ten years, so a 2023 survey and a 2024 one
    // are ranked together rather than the 2024 handful alone.
    const rows = ds.latestPerCountry
      ? [...ds.data.filter((o) => o.iso && Number(String(o.period).slice(0, 4)) >= Number(String(period).slice(0, 4)) - 10)
          .reduce((m, o) => (!m.has(o.iso!) || String(o.period) > String(m.get(o.iso!)!.period) ? m.set(o.iso!, o) : m), new Map<string, typeof ds.data[number]>())
          .values()]
      : ds.data.filter((o) => o.period === period && o.iso);
    const ranked = [...rows].sort((a, b) => b.value - a.value);
    const total = ranked.length;
    const own = new Map<string, Set<string>>();
    for (const o of ds.data) if (o.iso) (own.get(o.iso) ?? own.set(o.iso, new Set()).get(o.iso)!).add(o.period);
    // Equal values share a rank (1 + the number strictly higher), so sixteen
    // countries at 0% are not spread from #149 to #164 by sort order.
    const tieRank: number[] = [];
    ranked.forEach((o, i) => { tieRank[i] = i > 0 && ranked[i - 1].value === o.value ? tieRank[i - 1] : i + 1; });
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
        value: o.value, period: ds.latestPerCountry ? String(o.period) : period, rank: tieRank[i], total,
        first: [...own.get(iso)!].sort()[0], years: own.get(iso)!.size,
        ...(ds.better ? { better: ds.better } : {}),
        ...((sp) => (sp.length ? { splits: sp, ...(sp[0].dim === 'sex' ? { sex: { female: sp[0].a, male: sp[0].b } } : {}) } : {}))(
          splitsFor(ds.slug, iso, ds.latestPerCountry ? String(o.period) : period)),
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
