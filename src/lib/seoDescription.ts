/**
 * Meta description of a dataset page, written from its data so it stays true
 * after every refresh: indicator, how many countries, years, source, and who
 * leads and trails in the ranking the page shows (the same rows RankTable
 * ranks: the last observed period, or each country's latest reading).
 *
 * Search engines want 140–160 characters; Bing flagged the old ones, which
 * were the dataset's one-line summary (27–97 characters), 16 Nov 2026.
 */
import type { Observation } from './analytics';
import { entityTotals, formatValue, periods } from './analytics';
import countryNames from '@data/country-names.json';

const NAMES = countryNames as Record<string, { common: string }>;
const MIN = 140;
const MAX = 155; // lib/seoFit DESC_MAX

export interface DescInput {
  title: string;
  source: string;
  unit: string;
  /** Rows as RankTable gets them (latestPerCountry rows carry `year`). */
  data: (Observation & { year?: string })[];
  projectedFrom?: string;
  categories?: Record<string, string>;
  better?: 'high' | 'low';
  incomparable?: boolean;
  company?: boolean;
  floor?: number;
}

/** "IMF World Economic Outlook (Oct 2026)" → "IMF World Economic Outlook";
 *  "V-Dem Institute — Varieties of Democracy" → "V-Dem Institute". */
export function shortSource(s: string): string {
  const noParen = s.replace(/\s*\([^)]*\)/g, '').trim();
  return noParen.split(' — ')[0].trim() || s;
}

const yearOf = (p: string, last = false) => {
  const ys = String(p).match(/\d{4}/g);
  return ys ? (last ? ys.at(-1)! : ys[0]) : null;
};
const span = (a: string | null, b: string | null) => (a && b && a !== b ? `${a}–${b}` : a ?? b ?? '');

/** Names of the first rows, never splitting a tie: three names when the
 *  third and fourth differ, else fewer; null when the extreme itself is shared
 *  by more rows than are named. */
function ends(rows: { name: string; value: number }[], k: number): string[] | null {
  for (let n = Math.min(k, rows.length); n >= 1; n--) {
    if (n === rows.length || rows[n - 1].value !== rows[n].value) return rows.slice(0, n).map((r) => r.name);
  }
  return null;
}

/** The ranking the page shows: the last observed period (or "Latest"),
 *  highest first, in the page's own names. */
export function currentRanking(d: Pick<DescInput, 'data' | 'projectedFrom'>) {
  const pf = d.projectedFrom ? Number(String(d.projectedFrom).slice(0, 4)) : null;
  const isProj = (p: string) => pf != null && Number(String(p).slice(0, 4)) >= pf;
  const all = periods(d.data);
  const observed = all.filter((p) => !isProj(p));
  const ps = observed.length ? observed : all;
  const curr = ps.at(-1)!;
  const isoOf = new Map(d.data.filter((o) => o.iso).map((o) => [o.entity, o.iso!]));
  const shown = (e: string) => { const iso = isoOf.get(e); return (iso && NAMES[iso]?.common) || e; };
  const rows = [...entityTotals(d.data, curr).entries()]
    .map(([entity, value]) => ({ name: shown(entity), value }))
    .filter((r) => Number.isFinite(r.value))
    .sort((a, b) => b.value - a.value);
  return { ps, curr, latest: curr === 'Latest', rows };
}

export function datasetDescription(d: DescInput): string {
  const noun = d.company ? 'companies' : 'countries';
  const { ps, curr, latest, rows } = currentRanking(d);
  const n = rows.length;

  // Years: the whole observed span; for latest-per-country, the span of the
  // readings ranked; the period ranked when it differs from the end of the span.
  let years: string;
  let at = '';
  if (latest) {
    const ys = d.data.filter((o) => o.period === curr && o.year).map((o) => String(o.year)).sort();
    years = ys.length ? `latest readings ${span(yearOf(ys[0]), yearOf(ys.at(-1)!, true))}` : 'latest readings';
  } else {
    years = span(yearOf(ps[0]), yearOf(curr, true));
    if (ps.length > 1) at = ` in ${/^\d{4}$/.test(curr) ? curr : yearOf(curr, true) ?? curr}`;
  }
  const src = shortSource(d.source);
  const srcPart = d.title.toLowerCase().includes(src.toLowerCase()) ? '' : `, ${src}`;
  // "…, 2021, WHO Global Health Estimates 2021": the source already says the year.
  const yearsPart = srcPart && /^\d{4}$/.test(years) && src.includes(years) ? '' : `, ${years}`;
  const head = `${d.title} for ${n} ${n === 1 ? noun.replace(/ies$/, 'y') : noun}${yearsPart}${srcPart}.`;

  const suffixes = d.company
    ? [' See the full ranking, trends and CSV download.', ' Full ranking, trends and CSV.', ' Full ranking and trends.', '']
    : [' See the full ranking, map, trends and CSV download.', ' Full ranking, map, trends and CSV.', ' Full ranking, map and trends.', ' Full ranking and map.', ''];

  let bodies: string[];
  if (d.incomparable) {
    bodies = [' Each value is in its own currency per US dollar, so countries are listed A–Z, not ranked.', ' Each in its own currency per US dollar, listed A–Z.'];
  } else if (d.categories) {
    const counts = new Map<string, number>();
    for (const r of rows) { const c = d.categories[String(r.value)]; if (c) counts.set(c, (counts.get(c) ?? 0) + 1); }
    const order = Object.entries(d.categories).sort(([a], [b]) => (d.better === 'high' ? Number(b) - Number(a) : Number(a) - Number(b)));
    bodies = [` In ${curr}: ${order.filter(([, name]) => counts.has(name)).map(([, name]) => `${counts.get(name)} ${name}`).join(', ')}.`];
  } else {
    const val = (v: number) => formatValue(v, d.unit, d.floor);
    const tiedAt = (list: typeof rows) => `${list.filter((r) => r.value === list[0].value).length} tied at ${val(list[0].value)}`;
    const low = [...rows].reverse();
    // Never name a country on both ends: at most half the ranking each way.
    bodies = [3, 2, 1].filter((k, i, a) => k <= Math.max(1, Math.floor(n / 2)) || i === a.length - 1).map((k) => {
      const hi = ends(rows, k);
      const lo = ends(low, k);
      return ` Highest${at}: ${hi ? hi.join(', ') : tiedAt(rows)}; lowest: ${lo ? lo.join(', ') : tiedAt(low)}.`;
    });
    if (n < 2) bodies = [''];
  }

  const options: string[] = [];
  for (const b of bodies) for (const s of suffixes) options.push(head + b + s);
  const fit = options.find((o) => o.length >= MIN && o.length <= MAX);
  if (fit) return fit;
  const under = options.filter((o) => o.length <= MAX).sort((a, b) => b.length - a.length)[0];
  if (under) {
    // Short: the free download and the cited source are true of every page.
    const extra = [' Free to download, every number sourced.', ' Free CSV, sources cited.'];
    return extra.map((e) => under + e).find((o) => o.length <= MAX) ?? under;
  }
  const cut = options.sort((a, b) => a.length - b.length)[0];
  return cut.slice(0, MAX - 1).replace(/\s+\S*$/, '') + '…';
}
