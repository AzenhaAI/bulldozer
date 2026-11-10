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
  totalPct: number; // % change of total vs previous period
  growthCount: number;
  declineCount: number;
  stableCount: number;
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

const STABLE_BAND = 0.5; // ±0.5 (percent for 'pct', percentage points for 'pp')

/** Period-over-period change of one entity, in the units of `mode`:
 *  'pct' → multiplicative percent; 'pp' → percentage-point delta. */
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

export function computeKpi(data: Observation[], mode: ChangeMode = 'pct'): Kpi {
  const [prevPeriod, currPeriod] = lastTwoPeriods(data);
  const curr = entityTotals(data, currPeriod);
  const prev = entityTotals(data, prevPeriod);

  // Change is only meaningful for a country present in both periods: one that was
  // not surveyed is not a zero (a missing Ethiopia showed as "0%, −85pp").
  const both = [...curr.keys()].filter((e) => prev.has(e));
  let growthCount = 0;
  let declineCount = 0;
  let stableCount = 0;
  for (const e of both) {
    const change = changeValue(curr.get(e)!, prev.get(e)!, mode);
    if (change > STABLE_BAND) growthCount++;
    else if (change < -STABLE_BAND) declineCount++;
    else stableCount++;
  }

  const sum = (m: Map<string, number>, keys?: string[]) => (keys ?? [...m.keys()]).reduce((a, k) => a + (m.get(k) ?? 0), 0);
  const totalValue = sum(curr);
  // Headline delta over the same countries in both periods, so a change in who
  // was surveyed does not read as a change in the value.
  const headlineDelta = !both.length ? 0
    : mode === 'pp'
      ? Math.round(((sum(curr, both) - sum(prev, both)) / both.length) * 10) / 10
      : (() => { const tp = sum(prev, both); return tp ? Math.round(((sum(curr, both) - tp) / tp) * 100) : 0; })();

  return {
    totalValue,
    totalPct: headlineDelta,
    growthCount,
    declineCount,
    stableCount,
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

export function topGrowth(data: Observation[], n = 10, mode: ChangeMode = 'pct'): Change[] {
  return computeChanges(data, mode)
    .filter((c) => c.pct > 0)
    .slice(0, n);
}

export function topDecline(data: Observation[], n = 10, mode: ChangeMode = 'pct'): Change[] {
  return computeChanges(data, mode)
    .filter((c) => c.pct < 0)
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
  const r1 = (n: number) => Math.round(n * 10) / 10;

  const result: GroupRollup[] = [];
  for (const [group, rows] of groups) {
    const currRows = rows.filter((r) => r.period === currPeriod);
    const prevRows = rows.filter((r) => r.period === prevPeriod);
    const currSum = currRows.reduce((a, b) => a + b.value, 0);
    const members = currRows.length;
    if (members === 0) continue;
    const value = additive ? r1(currSum) : r1(currSum / members);
    // The change compares the same members in both periods.
    const prevBy = new Map(prevRows.map((r) => [r.entity, r.value]));
    const pair = currRows.filter((r) => prevBy.has(r.entity));
    const pcs = pair.reduce((a, b) => a + b.value, 0), pps = pair.reduce((a, b) => a + prevBy.get(b.entity)!, 0);
    const currMean = pair.length ? pcs / pair.length : 0;
    const prevMean = pair.length ? pps / pair.length : 0;
    const prevSum = pps;
    const currSumPair = pcs;
    let pct: number;
    if (mode === 'pp') pct = r1(currMean - prevMean); // points change of the mean
    else if (additive) pct = r1(prevSum ? ((currSumPair - prevSum) / prevSum) * 100 : 0);
    else pct = r1(prevMean ? ((currMean - prevMean) / prevMean) * 100 : 0);
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
