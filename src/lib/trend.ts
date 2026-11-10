/**
 * Chart rules for time series — the same logic as the app's
 * lib/widgets/chart_rules.dart; test/trend-vectors.json checks both against
 * SciPy and pymannkendall.
 *
 *  1. Flat series: every value equal at display precision → no chart, the
 *     number and "unchanged since <first year>".
 *  2. Honest y-axis: a non-negative unit never shows negative ticks; an area
 *     fill starts at 0; a minimum span keeps rounding noise from looking like
 *     a collapse.
 *  3. x by time: "2013" and "2020" sit seven years apart, not one step.
 *  4. Change in words: first → last, and the typical change per year.
 *  5. Trend line: Theil–Sen slope (median of pairwise slopes — robust to one
 *     odd year), drawn dashed over the observed years only, and only when
 *     there are at least 6 readings and the Mann–Kendall test says the
 *     direction is consistent (p < 0.05). Readings flagged as projections
 *     are left out of the fit.
 */

/** Calendar position of a period label: "2021" → 2021, "2021–2023" → 2022. */
export function periodYear(p: string | number): number {
  const m = String(p).match(/\d{4}/g);
  if (!m) return NaN;
  const ys = m.map(Number);
  return ys.length > 1 ? (ys[0] + ys[ys.length - 1]) / 2 : ys[0];
}

/**
 * Whether the axis may go below zero is read from the data, not the unit
 * name: a series is non-negative when no country, in any year, is below 0
 * (shares, money, years) — growth and balances have negative readings.
 */
export const nonNegativeFrom = (allValues: number[]) => allValues.every((v) => !(v < 0));

/** True when every value rounds to the same number at `dp` decimals. */
export function isFlat(values: number[], dp = 1): boolean {
  if (values.length < 2) return true;
  const r = (v: number) => Math.round(v * 10 ** dp);
  return values.every((v) => r(v) === r(values[0]));
}

/**
 * y-axis domain. `area` charts start at 0 (a filled area is read as an
 * amount). Line charts may zoom, but a non-negative unit never goes below 0,
 * and the span is at least `minSpanFrac` of the largest absolute value so
 * that 0.1-point noise is not drawn as a cliff.
 */
export function yDomain(values: number[], opts: { nonNegative?: boolean; area?: boolean; minSpanFrac?: number } = {}): [number, number] {
  const { nonNegative = true, area = false, minSpanFrac = 0.1 } = opts;
  let lo = Math.min(...values), hi = Math.max(...values);
  const minSpan = Math.max(Math.abs(lo), Math.abs(hi)) * minSpanFrac || 1;
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;
  if (area && lo > 0) lo = 0;
  if (nonNegative && lo < 0) lo = 0;
  return [lo, hi];
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/** Theil–Sen line: slope = median pairwise slope; intercept = median(y − slope·x). */
export function theilSen(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (xs[j] !== xs[i]) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
  const slope = slopes.length ? median(slopes) : 0;
  return { slope, intercept: median(ys.map((y, i) => y - slope * xs[i])) };
}

// Normal CDF via erf (Abramowitz & Stegun 7.1.26, error < 1.5e-7).
function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + e) / 2 : (1 - e) / 2;
}

/** Mann–Kendall test (two-sided, normal approximation, tie-corrected variance). */
export function mannKendall(ys: number[]): { s: number; z: number; p: number } {
  const n = ys.length;
  let s = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += Math.sign(ys[j] - ys[i]);
  const ties = new Map<number, number>();
  for (const y of ys) ties.set(y, (ties.get(y) ?? 0) + 1);
  let tieTerm = 0;
  for (const t of ties.values()) tieTerm += t * (t - 1) * (2 * t + 5);
  const variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  const z = variance <= 0 || s === 0 ? 0 : (s > 0 ? s - 1 : s + 1) / Math.sqrt(variance);
  return { s, z, p: 2 * (1 - phi(Math.abs(z))) };
}

export const TREND_MIN_POINTS = 6;
export const TREND_P = 0.05;

export interface Trend {
  slope: number; intercept: number; p: number; n: number;
  /** A consistent direction: enough readings and Mann–Kendall p < 0.05. */
  clear: boolean;
  x0: number; x1: number;
}

/** Points sorted by time; `projectedFrom` (a year) leaves projections out of the fit. */
export function trendOf(points: { x: number; y: number }[], projectedFrom?: number): Trend | null {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && (projectedFrom == null || p.x < projectedFrom)).sort((a, b) => a.x - b.x);
  if (pts.length < 3) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const { slope, intercept } = theilSen(xs, ys);
  const { p } = mannKendall(ys);
  return { slope, intercept, p, n: pts.length, clear: pts.length >= TREND_MIN_POINTS && p < TREND_P && slope !== 0, x0: xs[0], x1: xs[xs.length - 1] };
}

const fmtN = (v: number, dp: number) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Units where a change is read in points rather than percent. */
export const isPointUnit = (unit = '') => unit.includes('%') || /index|score|mean|0–|0-/.test(unit.toLowerCase());

/**
 * One line under a chart: "−1.6 pp since 2013 · trend −0.2 pp a year".
 * `mode` 'pp' for shares and scores, 'pct' for levels (money, people).
 */
export function changeLine(points: { label: string; x: number; y: number }[], mode: 'pp' | 'pct', unit = '', trend?: Trend | null): string {
  if (points.length < 2) return '';
  const a = points[0], b = points[points.length - 1];
  const d = b.y - a.y;
  const ppUnit = unit.includes('%') ? 'pp' : unit.replace(/^%\s*/, '').trim();
  const mag = Math.max(Math.abs(a.y), Math.abs(b.y));
  const dp = mag >= 100 ? 0 : mag >= 10 ? 1 : 2;
  const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±');
  // A growth rate is already a change: "since 2019" between two years' rates
  // says little, so the caption gives the average rate instead.
  if (/yoy|growth/i.test(unit)) {
    const r = Math.round((points.reduce((t, p) => t + p.y, 0) / points.length) * 10) / 10;
    return `average ${r === 0 ? '' : sign(r)}${fmtN(Math.abs(r), 1)}% a year, ${a.label}–${b.label}`;
  }
  // The sign follows the number as shown: a change that rounds to zero reads
  // "no change", never "−0.00".
  const shown = (v: number, k: number) => Math.round(v * 10 ** k) / 10 ** k;
  let s: string;
  if (mode === 'pct' && a.y > 0) { const v = shown((d / a.y) * 100, 1); s = v === 0 ? `no change since ${a.label}` : `${sign(v)}${fmtN(Math.abs(v), 1)}% since ${a.label}`; }
  else { const v = shown(d, dp); s = v === 0 ? `no change since ${a.label}` : `${sign(v)}${fmtN(Math.abs(v), dp)}${ppUnit ? ' ' + ppUnit : ''} since ${a.label}`; }
  if (trend) {
    if (trend.clear) {
      const per = mode === 'pct' && a.y > 0 ? `${sign(trend.slope)}${fmtN(Math.abs((trend.slope / median(points.map((p) => p.y))) * 100), 1)}% a year`
        : `${sign(trend.slope)}${fmtN(Math.abs(trend.slope), dp >= 1 ? dp : 1)}${ppUnit ? ' ' + ppUnit : ''} a year`;
      s += ` · trend ${per}`;
    } else if (trend.n >= TREND_MIN_POINTS) s += ' · no clear trend';
  }
  return s;
}
