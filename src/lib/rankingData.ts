/**
 * The rows a dataset page ranks, shared by the page, its meta description
 * (lib/seoDescription) and its share image (pages/og/[slug].png.ts), so the
 * three never disagree.
 *
 * Everyday country names ("Czechia", not the source's "Czech Republic") and
 * one region scheme (lib/regions). Series measured in different years per
 * country (household surveys, latestPerCountry) give each country's newest
 * reading of the last ten years, labelled "Latest", with its own `year`.
 */
import type { Dataset } from '@data/datasets';
import type { Observation } from './analytics';
import { normaliseGroups } from './regions';
import countryNames from '@data/country-names.json';

const NAMES = countryNames as Record<string, { common: string }>;

export type RankRow = Observation & { year?: string };

export function pageRows(ds: Dataset): RankRow[] {
  if (ds.entityType === 'company') return ds.data;
  return normaliseGroups(ds.data.map((o) => {
    const n = o.iso ? NAMES[o.iso]?.common : undefined;
    return n && n !== o.entity ? { ...o, entity: n } : o;
  }));
}

export function rankingRows(ds: Dataset, pageData: RankRow[] = pageRows(ds)): RankRow[] {
  if (!ds.latestPerCountry) return pageData;
  const end = Math.max(...pageData.map((o) => Number(String(o.period).slice(0, 4))).filter(Number.isFinite));
  const latest = new Map<string, RankRow>();
  for (const o of pageData) {
    if (Number(String(o.period).slice(0, 4)) < end - 10) continue;
    const k = o.iso ?? o.entity;
    if (!latest.has(k) || String(o.period) > String(latest.get(k)!.period)) latest.set(k, o);
  }
  return [...latest.values()].map((o) => ({ ...o, period: 'Latest', year: String(o.period) }));
}
