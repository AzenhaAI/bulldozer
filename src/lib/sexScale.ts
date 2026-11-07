import { sexRange } from '@lib/countryIndex';

// Women / men / everyone on one axis running from the lowest to the highest
// value of either sex across all countries, so the gap reads against the world.
export function sexScaleSvg(
  it: { slug: string; value: number; unit: string; sex?: { female: number; male: number } },
  fmt: (v: number, unit: string) => string,
): string {
  const r = it.sex && sexRange(it.slug);
  if (!r || !it.sex) return '';
  const W = 320, L = 14, R = 14, Y = 34;
  const x = (v: number) => L + ((v - r.min) / ((r.max - r.min) || 1)) * (W - L - R);
  const f = (v: number) => fmt(v, it.unit);
  const dot = (v: number, col: string, label: string, up: boolean) =>
    `<circle cx="${x(v).toFixed(1)}" cy="${Y}" r="6" fill="${col}"/>` +
    `<text x="${Math.min(W - R - 40, Math.max(L + 40, x(v))).toFixed(1)}" y="${up ? Y - 12 : Y + 21}" fill="${col}" font-size="11" font-weight="700" text-anchor="middle">${label} ${f(v)}</text>`;
  const womenUp = it.sex.female >= it.sex.male;
  return `<svg viewBox="0 0 ${W} 80" width="100%" style="max-width:420px;display:block" role="img" aria-label="Women ${f(it.sex.female)}, men ${f(it.sex.male)}, on a scale from ${f(r.min)} to ${f(r.max)} across ${r.n} countries">` +
    `<line x1="${L}" x2="${W - R}" y1="${Y}" y2="${Y}" stroke="var(--border)" stroke-width="4" stroke-linecap="round"/>` +
    `<line x1="${x(it.sex.female).toFixed(1)}" x2="${x(it.sex.male).toFixed(1)}" y1="${Y}" y2="${Y}" stroke="var(--text-dim)" stroke-width="4"/>` +
    `<path d="M${x(it.value).toFixed(1)} ${Y - 5}l4 5-4 5-4-5z" fill="var(--accent,#ffb000)"/>` +
    dot(it.sex.female, 'var(--sex-w)', 'Women', womenUp) + dot(it.sex.male, 'var(--sex-m)', 'Men', !womenUp) +
    `<text x="${L}" y="76" fill="var(--text-dim)" font-size="10">${f(r.min)}</text>` +
    `<text x="${W / 2}" y="76" fill="var(--text-dim)" font-size="10" text-anchor="middle">lowest to highest, ${r.n} countries</text>` +
    `<text x="${W - R}" y="76" fill="var(--text-dim)" font-size="10" text-anchor="end">${f(r.max)}</text></svg>`;
}
