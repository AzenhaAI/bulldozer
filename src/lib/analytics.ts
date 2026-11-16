/**
 * Generic analytics layer for BullDozer.
 *
 * Ported and generalised from the Madeira Ativa Python pipeline
 * (data_processor.py): instead of betting-brand search volumes, this works on
 * any long-format dataset of observations and computes the same family of
 * metrics — KPIs, top movers, group rollups and period-over-period trends.
 */

/** One observation: an entity measured in a period, optionally tagged. */
export interface Observation {
  entity: string; // e.g. country, respondent segment, brand
  period: string; // ISO-ish: "2025-04", "2025-W15", "2025"
  value: number;
  group?: string; // optional rollup dimension (region, category…)
  iso?: string; // ISO 3166-1 alpha-3, for map rendering
}

export interface Kpi {
  totalValue: number;
  /** Median across countries in the current period. */
  medianValue: number;
  /** Change of the median of the countries in both periods, in `mode` units. */
  totalPct: number;
  growthCount: number;
  declineCount: number;
  stableCount: number;
  /** Stable band used for the counts, in change units. */
  band: number;
  totalEntities: number;
  currPeriod: string;
  prevPeriod: string;
  /** Countries with a value in the current period (the average's base). */
  currCount: number;
}

export interface Change {
  entity: string;
  curr: number;
  prev: number;
  delta: number;
  pct: number;
}

export type ChangeMode = 'pct' | 'pp';
export type Better = 'high' | 'low';

/* ---------------------------------------------------------------------------
 * Units of change and the stable band.
 *
 * A change used to be labelled "pp" with a fixed ±0.5 stable band whatever the
 * scale: happiness (0–10) read "+0.10pp", life expectancy "+0.20pp", and on
 * V-Dem's 0–1 indices every one of 179 countries was "stable". Now:
 *  - 'pp' mode (absolute difference) speaks the dataset's unit: percentage
 *    points only for % shares, otherwise the unit itself ("+0.2 years",
 *    "+0.10 points" on scores and indices);
 *  - 'pct' mode (relative change, counts and money) stays in percent;
 *  - the stable band scales with the data: in 'pp' mode it is 1/40 of the
 *    cross-country interquartile range (every country, every period: the
 *    middle half of the values), which is ≈ ±0.5pp on a typical % share;
 *    in 'pct' mode it stays relative, ±0.5%.
 * ------------------------------------------------------------------------- */

/** Relative band for 'pct' mode, in percent. */
export const STABLE_PCT = 0.5;
/** 'pp' mode: the stable band is this fraction of the interquartile range. */
export const STABLE_IQR_FRACTION = 1 / 40;

/** Suffix of a change in `mode` for a dataset measured in `unit`. */
export function changeUnit(unit: string, mode: ChangeMode): string {
  if (mode === 'pct') return '%';
  const u = (unit || '').trim();
  if (u.includes('%')) return 'pp';
  if (!u) return ' points';
  // Scores, indices, means, estimates on a bounded scale: plain points.
  if (/^(index|score|mean|estimate|ladder|pisa|iea)\b/i.test(u) || /\d\s*[–-]\s*[\d+]|\bto\b|=/.test(u)) return ' points';
  return ' ' + u;
}

/** Linear-interpolated quantile of an ascending array. */
export function quantile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (!n) return NaN;
  const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function median(values: number[]): number {
  return quantile([...values].filter(Number.isFinite).sort((a, b) => a - b), 0.5);
}

/** Half-width of the "stable" band, in the units of the change. */
export function stableBand(values: number[], mode: ChangeMode): number {
  if (mode === 'pct') return STABLE_PCT;
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length < 2) return 0;
  const iqr = quantile(v, 0.75) - quantile(v, 0.25);
  const spread = iqr > 0 ? iqr : v[v.length - 1] - v[0];
  return spread * STABLE_IQR_FRACTION;
}

/** Everything needed to state and colour a change for one dataset. */
export interface ChangeSpec {
  mode: ChangeMode;
  /** 'pp', '%', ' years', ' points'… */
  suffix: string;
  /** Changes within ±band count as stable. */
  band: number;
  better?: Better;
}

export function changeSpec(data: Observation[], unit: string, mode: ChangeMode, better?: Better): ChangeSpec {
  return { mode, suffix: changeUnit(unit, mode), band: stableBand(data.map((d) => d.value), mode), better };
}

/** Decimals a change needs so that the stable band itself is visible. */
export function changeDecimals(spec: Pick<ChangeSpec, 'mode' | 'band'>, value: number): number {
  // Relative changes: one decimal for every row, which already shows the ±0.5%
  // band. Two places below 1% printed "−0.87%" next to "+4.4%" in one list.
  if (spec.mode === 'pct') return 1;
  if (!(spec.band > 0)) return Math.abs(value) < 1 ? 2 : 1;
  // Capped at 2: a band of 0.005 gave "+0.590 points", false precision (QA, 16 Nov 2026).
  return Math.max(0, Math.min(2, Math.ceil(-Math.log10(spec.band))));
}

/** "+0.2 years", "−1.4pp", "+0.10 points", "+3.1%". */
export function formatDelta(value: number, spec: Pick<ChangeSpec, 'mode' | 'band' | 'suffix'>): string {
  if (!Number.isFinite(value)) return '—';
  const dp = changeDecimals(spec, value);
  const r = Number(value.toFixed(dp));
  // A real but tiny change is not "0.0%": it reads as "<0.1%" (always inside
  // the stable band, so its colour already says flat).
  if (r === 0 && value !== 0) return `<${(10 ** -dp).toFixed(dp)}${spec.suffix}`;
  const sign = r > 0 ? '+' : r < 0 ? '−' : '';
  return `${sign}${Math.abs(r).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}${spec.suffix}`;
}

/** Direction of a change against the stable band. */
export function moveOf(value: number, band: number): 'up' | 'down' | 'flat' {
  if (value > band) return 'up';
  if (value < -band) return 'down';
  return 'flat';
}

/** CSS class for a change: 'good' / 'bad' by polarity, 'flat' within the
 *  band, 'neutral' when the dataset has no better direction. */
export function toneOf(value: number, spec: Pick<ChangeSpec, 'band' | 'better'>): 'good' | 'bad' | 'flat' | 'neutral' {
  const m = moveOf(value, spec.band);
  if (m === 'flat') return 'flat';
  if (!spec.better) return 'neutral';
  return (m === 'up') === (spec.better === 'high') ? 'good' : 'bad';
}

/* ---------------------------------------------------------------------------
 * Value precision per scale. maximumFractionDigits: 1 everywhere printed
 * "−0" for −0.04 (WB Government Effectiveness), "1" for 0.954 (V-Dem) and
 * "3,187,412,907,763" for Maddison's GDP.
 * ------------------------------------------------------------------------- */

/** Fixed decimals for bounded index scales; undefined when magnitude decides. */
function scaleDecimals(unit: string): number | undefined {
  const u = unit || '';
  if (/0\s*[–-]\s*1\b(?!\d)|2\.5|births\/woman/.test(u)) return 2; // 0–1 indices, WGI ±2.5, fertility
  if (/\b(0|1)\s*[–-]\s*(5|10)\b(?!\d)|ladder/.test(u)) return 2; // 0–10 / 1–5 scores
  return undefined;
}

/** Counts of whole things (people, companies, sites): an average of them is
 *  still printed as a whole number, "115 people", not "115.4". */
export function isCount(unit: string): boolean {
  return /^(people|count|sites)$/i.test((unit || '').trim());
}

/**
 * A value as text, with sensible precision for its scale (no unit suffix).
 * `floor`: the source's own rounding step (IMF world-GDP shares come to three
 * places, with micro-states at 0): anything below it, a source zero included,
 * prints as "<0.01" rather than a precise-looking "0.003" or "0.00".
 */
export function formatValue(v: number, unit = '', floor?: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (floor && a < floor) return `${v < 0 ? '−' : ''}<${floor}`;
  // Millions and up in the compact style the chart axes use ("2.67M" beside
  // an axis at "5K"); "2.67 m" next to "5K" read as two conventions.
  if (a >= 1e6) {
    const [d, s] = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : [1e6, 'M'];
    return `${v < 0 ? '−' : ''}${(a / d).toFixed(2)}${s}`;
  }
  const fixed = scaleDecimals(unit);
  const dp = fixed ?? (isCount(unit) ? 0 : a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 1 : a >= 0.01 || a === 0 ? 2 : 3);
  const r = Number(v.toFixed(dp));
  // A tiny share is not zero: "<0.001", never "0.000".
  if (r === 0 && v !== 0) return `${v < 0 ? '−' : ''}<${(10 ** -dp).toFixed(dp)}`;
  const out = Math.abs(r).toLocaleString('en-US', { minimumFractionDigits: fixed ?? 0, maximumFractionDigits: dp });
  return r < 0 ? `−${out}` : out;
}

/**
 * formatValue texts of one list with the same decimals: formatValue drops a
 * trailing zero, so a column read "41.4%, 4%, 0%" or a range "18% – 61.5%".
 * A number below 1,000 gets the decimals its magnitude would show (one
 * from 1 up, two below 1), but no more than the list already shows; texts
 * with a magnitude suffix ("2.67M") or "<0.001" are left as they are, and so
 * is a list of whole numbers (people, counts).
 */
export function alignDecimals(texts: string[]): string[] {
  const dpOf = (t: string) => (/^−?[\d,]+\.(\d+)$/.exec(t)?.[1].length ?? (/^−?[\d,]+$/.test(t) ? 0 : -1));
  const maxDp = Math.max(0, ...texts.map(dpOf));
  if (!maxDp) return texts;
  return texts.map((t) => {
    const d = dpOf(t);
    if (d < 0) return t;
    const a = Math.abs(Number(t.replace(/[,−]/g, '')));
    if (a >= 1000) return t;
    // A dropped trailing zero after the point too: "0.3%" beside "0.64%"
    // (world GDP shares by region) becomes "0.30%".
    const want = Math.min(maxDp, a >= 1 ? 1 : 2);
    return d >= want ? t : `${t}${d ? '' : '.'}${'0'.repeat(want - d)}`;
  });
}

/** `texts` with the decimals of the list they summarise (`ref`): a median of
 *  "3" beside a ranking of "2.8, 4.1" reads "3.0", as the ranking would. */
export function alignDecimalsTo(texts: string[], ref: string[]): string[] {
  return alignDecimals([...texts, ...ref]).slice(0, texts.length);
}

/**
 * One column of values as text: formatValue, then one decimal count
 * (alignDecimals) and one style of large number. A count column that mixes
 * "2.67M" with "351,209" (UNHCR refugees) is written out in full, since a
 * table can afford the digits; "0.35M" would hide the small ones.
 */
export function formatColumn(values: number[], unit = '', floor?: number): string[] {
  const texts = values.map((v) => formatValue(v, unit, floor));
  const max = Math.max(0, ...values.filter(Number.isFinite).map(Math.abs));
  const mixed = texts.some((t) => /[MBT]$/.test(t)) && values.some((v) => Math.abs(v) >= 1000 && Math.abs(v) < 1e6);
  if (isCount(unit) && mixed && max < 1e9) {
    return values.map((v, i) => (Math.abs(v) >= 1e6 ? `${v < 0 ? '−' : ''}${Math.round(Math.abs(v)).toLocaleString('en-US')}` : texts[i]));
  }
  return alignDecimals(texts);
}

/**
 * Smallest earlier value a country needs to be listed among the relative
 * movers of a count (0 = no minimum). Percent change on a tiny base is noise:
 * Luxembourg's 20 refugees becoming 80 topped the risers at +300%. The floor
 * is the lower quartile of the earlier period (the smallest quarter of
 * countries is left out), and at least 1,000 for counts of people; rounded
 * down to two significant figures so the page can state it plainly.
 */
export function moverBase(data: Observation[], unit: string, mode: ChangeMode): number {
  if (mode !== 'pct' || !isCount(unit)) return 0;
  const [prevPeriod, currPeriod] = lastTwoPeriods(data);
  if (prevPeriod === currPeriod) return 0;
  const prev = [...entityTotals(data, prevPeriod).values()].filter(Number.isFinite).sort((a, b) => a - b);
  const people = /^people$/i.test(unit.trim());
  // A quartile of a handful of countries would cut real ones: needs 20.
  const q = prev.length >= 20 ? quantile(prev, 0.25) : 0;
  const base = Math.max(q, people ? 1000 : 0);
  if (base <= 0) return 0;
  const p = 10 ** (Math.floor(Math.log10(base)) - 1);
  return Math.floor(base / p) * p;
}

/**
 * Competition ranks ("1, 2, 2, 4") for rows already in rank order, keyed by
 * what the reader sees: rows whose values print the same share a rank
 * (Bulgaria and Lebanon, both 2.50 on LiTS trust, were #28 and #29; every
 * "Free" country was numbered 1 to 58). `label` is "28=" for a shared rank.
 */
export function sharedRanks(keys: string[]): { rank: number; tied: boolean; label: string }[] {
  const ranks = keys.map((k, i) => i);
  for (let i = 1; i < keys.length; i++) if (keys[i] === keys[i - 1]) ranks[i] = ranks[i - 1];
  return keys.map((k, i) => {
    const tied = (i > 0 && keys[i - 1] === k) || (i < keys.length - 1 && keys[i + 1] === k);
    const rank = ranks[i] + 1;
    return { rank, tied, label: `${rank}${tied ? '=' : ''}` };
  });
}

/** Period-over-period change of one entity, in the units of `mode`:
 *  'pct' → multiplicative percent; 'pp' → absolute difference in the unit. */
export function changeValue(curr: number, prev: number, mode: ChangeMode): number {
  if (mode === 'pp') return curr - prev;
  return prev ? ((curr - prev) / prev) * 100 : 0;
}

export function periods(data: Observation[]): string[] {
  return [...new Set(data.map((d) => d.period))].sort();
}

export function lastTwoPeriods(data: Observation[]): [string, string] {
  const p = periods(data);
  if (p.length < 2) return [p[p.length - 1], p[p.length - 1]]; // single period → no change
  return [p[p.length - 2], p[p.length - 1]];
}

/** True when the dataset only has one period (no period-over-period change). */
export function isSinglePeriod(data: Observation[]): boolean {
  return periods(data).length < 2;
}

/** Sum of value per entity within a single period. */
export function entityTotals(data: Observation[], period: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const d of data) {
    if (d.period !== period) continue;
    totals.set(d.entity, (totals.get(d.entity) ?? 0) + d.value);
  }
  return totals;
}

/** Counts of risers / fallers / stable, and the headline median.
 *  `band` defaults to the dataset's own scale-aware band (stableBand). */
export function computeKpi(data: Observation[], mode: ChangeMode = 'pct', band?: number): Kpi {
  const [prevPeriod, currPeriod] = lastTwoPeriods(data);
  const curr = entityTotals(data, currPeriod);
  const prev = entityTotals(data, prevPeriod);
  const b = band ?? stableBand(data.map((d) => d.value), mode);

  // Change is only meaningful for a country present in both periods: one that was
  // not surveyed is not a zero (a missing Ethiopia showed as "0%, −85pp").
  const both = [...curr.keys()].filter((e) => prev.has(e));
  let growthCount = 0;
  let declineCount = 0;
  let stableCount = 0;
  for (const e of both) {
    const m = moveOf(changeValue(curr.get(e)!, prev.get(e)!, mode), b);
    if (m === 'up') growthCount++;
    else if (m === 'down') declineCount++;
    else stableCount++;
  }

  const sum = (m: Map<string, number>, keys?: string[]) => (keys ?? [...m.keys()]).reduce((a, k) => a + (m.get(k) ?? 0), 0);
  const totalValue = sum(curr);
  // Headline: the median country, and how the median of the same countries in
  // both periods moved, so a change in who was surveyed does not read as a
  // change in the value.
  const medianValue = median([...curr.values()]);
  const mc = both.length ? median(both.map((e) => curr.get(e)!)) : NaN;
  const mp = both.length ? median(both.map((e) => prev.get(e)!)) : NaN;
  const headlineDelta = !both.length ? 0 : changeValue(mc, mp, mode);

  return {
    totalValue,
    medianValue,
    totalPct: headlineDelta,
    growthCount,
    declineCount,
    stableCount,
    band: b,
    totalEntities: both.length,
    currCount: curr.size,
    currPeriod,
    prevPeriod,
  };
}

/** `pct` holds the change in the units of `mode` (percent or percentage points). */
export function computeChanges(data: Observation[], mode: ChangeMode = 'pct'): Change[] {
  const [prevPeriod, currPeriod] = lastTwoPeriods(data);
  const curr = entityTotals(data, currPeriod);
  const prev = entityTotals(data, prevPeriod);

  const records: Change[] = [];
  for (const e of curr.keys()) {
    if (!prev.has(e)) continue; // not measured last period: no change to report
    const cv = curr.get(e)!;
    const pv = prev.get(e)!;
    if (mode === 'pct' && pv === 0) continue; // undefined percent change
    records.push({ entity: e, curr: cv, prev: pv, delta: cv - pv, pct: changeValue(cv, pv, mode) });
  }
  return records.sort((a, b) => b.pct - a.pct);
}

/** `minPrev`: leave out entities whose earlier value is below it (moverBase). */
export function topGrowth(data: Observation[], n = 10, mode: ChangeMode = 'pct', minPrev = 0): Change[] {
  return computeChanges(data, mode)
    .filter((c) => c.pct > 0 && c.prev >= minPrev)
    .slice(0, n);
}

export function topDecline(data: Observation[], n = 10, mode: ChangeMode = 'pct', minPrev = 0): Change[] {
  return computeChanges(data, mode)
    .filter((c) => c.pct < 0 && c.prev >= minPrev)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, n);
}

export function topByVolume(data: Observation[], n = 15): Change[] {
  const [prevPeriod, currPeriod] = lastTwoPeriods(data);
  const curr = entityTotals(data, currPeriod);
  const prev = entityTotals(data, prevPeriod);
  return [...curr.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([entity, cv]) => {
      const pv = prev.get(entity);
      if (pv == null) return { entity, curr: cv, prev: NaN, delta: NaN, pct: NaN };
      const delta = cv - pv;
      return { entity, curr: cv, prev: pv, delta, pct: pv ? (delta / pv) * 100 : 0 };
    });
}

export interface GroupRollup {
  group: string;
  members: number;
  value: number;
  pct: number;
}

/** Volumes/counts (population, total GDP) are additive — they can be summed.
 *  Rates, per-capita values and indices must be averaged across countries. */
export function isAdditive(unit: string): boolean {
  return /\bbn\b/.test(unit) || unit === 'million' || unit === 'thousand';
}

export function groupRollups(data: Observation[], mode: ChangeMode = 'pct', additive = false): GroupRollup[] {
  const [prevPeriod, currPeriod] = lastTwoPeriods(data);
  const groups = new Map<string, Observation[]>();
  for (const d of data) {
    if (!d.group) continue;
    const arr = groups.get(d.group) ?? [];
    arr.push(d);
    groups.set(d.group, arr);
  }
  const result: GroupRollup[] = [];
  for (const [group, rows] of groups) {
    const currRows = rows.filter((r) => r.period === currPeriod);
    const prevRows = rows.filter((r) => r.period === prevPeriod);
    const currSum = currRows.reduce((a, b) => a + b.value, 0);
    const members = currRows.length;
    if (members === 0) continue;
    // Not rounded here: a 0–1 index rounded to one place read 0.5 for 0.45.
    const value = additive ? currSum : currSum / members;
    // The change compares the same members in both periods.
    const prevBy = new Map(prevRows.map((r) => [r.entity, r.value]));
    const pair = currRows.filter((r) => prevBy.has(r.entity));
    const pcs = pair.reduce((a, b) => a + b.value, 0), pps = pair.reduce((a, b) => a + prevBy.get(b.entity)!, 0);
    const currMean = pair.length ? pcs / pair.length : 0;
    const prevMean = pair.length ? pps / pair.length : 0;
    const prevSum = pps;
    const currSumPair = pcs;
    let pct: number;
    if (mode === 'pp') pct = currMean - prevMean; // change of the mean, in the unit
    else if (additive) pct = prevSum ? ((currSumPair - prevSum) / prevSum) * 100 : 0;
    else pct = prevMean ? ((currMean - prevMean) / prevMean) * 100 : 0;
    result.push({ group, members: new Set(currRows.map((r) => r.entity)).size, value, pct });
  }
  return result.sort((a, b) => b.value - a.value);
}

/** Period-over-period % change series, per group. */
export function trendByGroup(data: Observation[]): Record<string, { periods: string[]; pctChanges: number[] }> {
  const allPeriods = periods(data);
  const out: Record<string, { periods: string[]; pctChanges: number[] }> = {};
  const groups = new Set(data.map((d) => d.group).filter(Boolean) as string[]);

  for (const g of groups) {
    const series = allPeriods.map((p) =>
      data.filter((d) => d.group === g && d.period === p).reduce((a, b) => a + b.value, 0),
    );
    if (series.length < 2) continue;
    const pctChanges: number[] = [];
    for (let i = 1; i < series.length; i++) {
      pctChanges.push(series[i - 1] > 0 ? ((series[i] - series[i - 1]) / series[i - 1]) * 100 : 0);
    }
    out[g] = { periods: allPeriods.slice(1), pctChanges };
  }
  return out;
}
