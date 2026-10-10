/**
 * Per-country profile index: every indicator's latest value + world rank.
 * Shared by the /data/country-index.json endpoint (interactive Geo panel)
 * and the static /country/[slug] SEO pages.
 */
import { datasets } from '@data/datasets';
import { bestCountryName } from '@lib/geo';
import countryNames from '@data/country-names.json';

const NAMES: Record<string, { common: string; official: string }> = countryNames;

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

  for (const ds of datasets) {
    const periods = [...new Set(ds.data.map((o) => o.period))].sort();
    const period = periods[periods.length - 1];
    const rows = ds.data.filter((o) => o.period === period && o.iso);
    const ranked = [...rows].sort((a, b) => b.value - a.value);
    const total = ranked.length;
    ranked.forEach((o, i) => {
      const iso = o.iso!;
      if (!byIso[iso]) byIso[iso] = { iso, name: o.entity, region: o.group ?? '', items: [] };
      const votes = (nameVotes[iso] ??= new Map());
      votes.set(o.entity, (votes.get(o.entity) ?? 0) + 1);
      byIso[iso].items.push({
        slug: ds.slug, title: ds.title, kind: ds.kind, topic: ds.topic, unit: ds.unit,
        value: o.value, period, rank: i + 1, total,
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
