/**
 * Chart rules for time series — the same logic as the app's
 * lib/widgets/chart_rules.dart; test/trend-vectors.json and
 * test/lowess-vectors.json check both against SciPy, pymannkendall and
 * statsmodels.
 *
 * Kept (owner's choice, 10 Nov 2026): the axis zooms to the data so every
 * change is visible — no forced zero, no minimum span, and a flat series is
 * still drawn as a chart.
 *  - x by time: "2013" and "2020" sit seven years apart, not one step.
 *  - Round axis ticks, and a 0 line whenever values cross zero.
 *  - Change in words: first → last; for growth rates the average rate.
 *  - Trend line: Theil–Sen slope (median of pairwise slopes), drawn over the
 *    observed years only, and only with ≥ 6 readings, Mann–Kendall p < 0.05
 *    and the same direction in the first and second half (no line through a
 *    rise-then-fall). Projections are left out of the fit.
 *  - LOWESS curve for long series (≥ 20 readings).
 *  - Survey margins of error (scripts/tools/moe.py) as a band; IMF
 *    projections as a shaded "forecast" stretch; a median reference line.
 */

/** Calendar position of a period label: "2021" → 2021, "2021–2023" → 2022. */
export function periodYear(p: string | number): number {
  const m = String(p).match(/\d{4}/g);
  if (!m) return NaN;
  const ys = m.map(Number);
  return ys.length > 1 ? (ys[0] + ys[ys.length - 1]) / 2 : ys[0];
}

/**
 * y-axis domain, zoomed to the data (and anything drawn with it: margins,
 * trend ends, a reference line inside the range) with 8% padding.
 */
export function yDomain(values: number[]): [number, number] {
  const v = values.filter(Number.isFinite);
  let lo = Math.min(...v), hi = Math.max(...v);
  if (hi === lo) { const p = Math.abs(hi) * 0.1 || 1; return [lo - p, hi + p]; }
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

/** Round ticks (1, 2, 2.5, 5 × 10^k) inside [lo, hi]; 0 included when the range crosses it. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) out.push(Math.round(t / step) * step);
  if (lo < 0 && hi > 0 && !out.includes(0)) out.push(0);
  return out.sort((a, b) => a - b).map((t) => +t.toPrecision(12));
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
  /** A steady direction: ≥ 6 readings, Mann–Kendall p < 0.05, same sign in both halves. */
  clear: boolean;
  x0: number; x1: number;
  /** Fitted on log(y): levels that grow by a percentage (money, people). */
  log: boolean;
}

/** The trend's value at x (exponential when fitted on logs). */
export const trendAt = (t: Trend, x: number) => (t.log ? Math.exp(t.intercept + t.slope * x) : t.intercept + t.slope * x);

/** Change per year: points for a linear fit, percent (e^slope − 1) for a log fit. */
export const trendRate = (t: Trend) => (t.log ? (Math.exp(t.slope) - 1) * 100 : t.slope);

/**
 * Points sorted by time; `projectedFrom` (a year) leaves projections out of
 * the fit. `log` fits on log(y) (only when every value is above 0): a straight
 * line through compounding growth went below zero in early years.
 */
export function trendOf(points: { x: number; y: number }[], projectedFrom?: number, log = false): Trend | null {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && (projectedFrom == null || p.x < projectedFrom)).sort((a, b) => a.x - b.x);
  if (pts.length < 3) return null;
  const useLog = log && pts.every((p) => p.y > 0);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => (useLog ? Math.log(p.y) : p.y));
  const { slope, intercept } = theilSen(xs, ys);
  const { p } = mannKendall(ys);
  // The same direction in each half: a rise then a fall is not one trend.
  const h = Math.floor(pts.length / 2);
  const s1 = theilSen(xs.slice(0, h), ys.slice(0, h)).slope, s2 = theilSen(xs.slice(-h), ys.slice(-h)).slope;
  const steady = Math.sign(s1) === Math.sign(slope) && Math.sign(s2) === Math.sign(slope);
  return { slope, intercept, p, n: pts.length, clear: pts.length >= TREND_MIN_POINTS && p < TREND_P && slope !== 0 && steady, x0: xs[0], x1: xs[xs.length - 1], log: useLog };
}

const fmtN = (v: number, dp: number) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Units where a change is read in points rather than percent. */
export const isPointUnit = (unit = '') => unit.includes('%') || /index|score|mean|0–|0-/.test(unit.toLowerCase());

// Round half away from zero, as Dart's round() does, so both platforms print
// the same number (JavaScript rounds −1.5 to −1).
const roundAway = (v: number, k: number) => (Math.sign(v) * Math.round(Math.abs(v) * 10 ** k)) / 10 ** k;

/**
 * One line under a chart: "−1.6 pp since 2013 · trend −0.2 pp per year".
 * `mode` 'pp' for shares and scores, 'pct' for levels (money, people).
 * Growth-rate units ("% YoY"): the compound average rate instead.
 */
export function changeLine(points: { label: string; x: number; y: number }[], mode: 'pp' | 'pct', unit = '', trend?: Trend | null): string {
  if (points.length < 2) return '';
  const a = points[0], b = points[points.length - 1];
  const ppUnit = unit.includes('%') ? 'pp' : unit.replace(/^%\s*/, '').trim();
  const u = ppUnit ? ' ' + ppUnit : '';
  const mag = Math.max(Math.abs(a.y), Math.abs(b.y));
  const dp = mag >= 100 ? 0 : mag >= 10 ? 1 : 2;
  const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');
  if (/yoy|growth/i.test(unit)) {
    // Yearly rates compound: Macao's +4.9% plain average hid a 12.7% fall.
    const g = points.reduce((t, p) => t * (1 + p.y / 100), 1);
    const r = g > 0 ? roundAway((g ** (1 / points.length) - 1) * 100, 1) : NaN;
    return Number.isFinite(r) ? `compound average ${sign(r)}${fmtN(Math.abs(r), 1)}% per year, ${a.label}–${b.label}` : '';
  }
  let s: string;
  if (mode === 'pct' && a.y > 0) { const v = roundAway(((b.y - a.y) / a.y) * 100, 1); s = v === 0 ? `no change since ${a.label}` : `${sign(v)}${fmtN(Math.abs(v), 1)}% since ${a.label}`; }
  else { const v = roundAway(b.y - a.y, dp); s = v === 0 ? `no change since ${a.label}` : `${sign(v)}${fmtN(Math.abs(v), dp)}${u} since ${a.label}`; }
  if (trend) {
    if (trend.clear) {
      const r = trendRate(trend);
      s += trend.log ? ` · trend ${sign(r)}${fmtN(Math.abs(roundAway(r, 1)), 1)}% per year`
        : ` · trend ${sign(r)}${fmtN(Math.abs(roundAway(r, Math.max(dp, 1))), Math.max(dp, 1))}${u} per year`;
    } else if (trend.n >= TREND_MIN_POINTS) s += ' · no steady trend';
  }
  return s;
}

/**
 * LOWESS smoothing (Cleveland 1979; local linear fit, tricube weights over the
 * k = floor(frac·n) nearest readings, no robustness passes) — the same as
 * statsmodels' lowess(y, x, frac, it=0, delta=0). Used for long series
 * (≥ SMOOTH_MIN_POINTS readings) to show the shape under year-to-year noise.
 */
export const SMOOTH_MIN_POINTS = 20;
export const SMOOTH_FRAC = 0.3;
export function lowess(xs: number[], ys: number[], frac = SMOOTH_FRAC): number[] {
  const n = xs.length;
  const k = Math.min(n, Math.max(2, Math.floor(frac * n + 1e-10))); // statsmodels: int(frac·n)
  const out: number[] = new Array(n);
  let left = 0, right = k; // window [left, right) of the k nearest
  for (let i = 0; i < n; i++) {
    while (right < n && xs[i] - xs[left] > xs[right] - xs[i]) { left++; right++; }
    const h = Math.max(xs[i] - xs[left], xs[right - 1] - xs[i]);
    let sw = 0, sx = 0, sy = 0;
    const w: number[] = [];
    for (let j = left; j < right; j++) {
      // Cleveland's thresholds: within 0.001·h weight 1, beyond 0.999·h weight 0.
      const r = Math.abs(xs[j] - xs[i]);
      const wj = r <= 0.001 * h ? 1 : r > 0.999 * h ? 0 : (1 - (r / h) ** 3) ** 3;
      w.push(wj); sw += wj; sx += wj * xs[j]; sy += wj * ys[j];
    }
    if (sw <= 0) { out[i] = ys[i]; continue; }
    const mx = sx / sw, my = sy / sw;
    let sxx = 0, sxy = 0;
    for (let j = left; j < right; j++) { const wj = w[j - left]; sxx += wj * (xs[j] - mx) ** 2; sxy += wj * (xs[j] - mx) * (ys[j] - my); }
    out[i] = sxx > 1e-12 * sw ? my + (sxy / sxx) * (xs[i] - mx) : my;
  }
  return out;
}

/** True when some group has ≥ minPanel countries measured in every period (else no regional trend chart). */
export function hasRegionalPanel(data: { entity: string; group?: string; period: string | number }[], minPanel = 3): boolean {
  const periods = new Set(data.map((o) => String(o.period)));
  const seen = new Map<string, Map<string, Set<string>>>();
  for (const o of data) {
    if (!o.group) continue;
    const g = seen.get(o.group) ?? seen.set(o.group, new Map()).get(o.group)!;
    (g.get(o.entity) ?? g.set(o.entity, new Set()).get(o.entity)!).add(String(o.period));
  }
  return [...seen.values()].some((g) => [...g.values()].filter((s) => s.size === periods.size).length >= minPanel);
}
