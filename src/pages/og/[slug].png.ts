/**
 * Share image of every dataset page (1200×630, og:image): the BullDozer mark,
 * the indicator, its source and period, and the top of the ranking the page
 * shows.
 *
 * Built with the site from the same rows as the page's ranking and its meta
 * description (lib/rankingData, lib/seoDescription). The old images came from
 * scripts/make_og_datasets.mjs, run by hand: 162 of 304 pages pointed at an
 * image that did not exist, and the rest ranked the IMF's projection year,
 * source names and stale data (16 Nov 2026).
 */
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { datasets, getDataset } from '@data/datasets';
import { formatColumn } from '@lib/analytics';
import { pageRows, rankingRows } from '@lib/rankingData';
import { currentRanking, shortSource } from '@lib/seoDescription';

export function getStaticPaths() {
  return datasets.map((d) => ({ params: { slug: d.slug } }));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Greedy wrap into the left column; three lines at most. */
function titleLines(t: string) {
  const MAX = 17;
  const lines: string[] = [];
  let cur = '';
  for (const w of t.split(' ')) {
    if (cur && (cur + ' ' + w).length > MAX) { lines.push(cur); cur = w; } else cur += (cur ? ' ' : '') + w;
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) { lines.length = 3; lines[2] = cut(lines[2], MAX); }
  return { lines, size: lines.some((l) => l.length > 14) ? 46 : 56 };
}

function bars(items: { name: string; text: string; value: number }[]) {
  const max = Math.max(...items.map((r) => Math.abs(r.value)), 1e-9);
  return items.map((r, i) => {
    const y = i * 52;
    const w = Math.max(6, Math.round((Math.abs(r.value) / max) * 270));
    return `<text x="0" y="${y + 24}" font-family="Inter,Arial,sans-serif" font-size="20" fill="#9aa1a9">${esc(cut(r.name, 14))}</text>
      <rect x="175" y="${y + 8}" width="${w}" height="22" rx="4" fill="url(#b)" opacity="${(1 - i * 0.09).toFixed(2)}"/>
      <text x="${181 + w}" y="${y + 25}" font-family="JetBrains Mono,monospace" font-size="17" fill="#e7e9ec">${esc(r.text)}</text>`;
  }).join('');
}

export const GET: APIRoute = async ({ params }) => {
  const ds = getDataset(params.slug!)!;
  const data = rankingRows(ds, pageRows(ds));
  const { curr, latest, rows } = currentRanking({ data, projectedFrom: ds.projectedFrom });

  let period = curr;
  if (latest) {
    const ys = data.filter((o) => o.year).map((o) => String(o.year).slice(0, 4)).sort();
    period = ys.length ? (ys[0] === ys.at(-1) ? `latest, ${ys[0]}` : `latest, ${ys[0]}–${ys.at(-1)}`) : 'latest';
  }

  let right: string;
  let caption: string;
  if (ds.incomparable) {
    caption = `${rows.length} countries`;
    right = `<text x="0" y="40" font-family="Inter,Arial,sans-serif" font-size="26" fill="#e7e9ec">Each country in its own</text>
      <text x="0" y="76" font-family="Inter,Arial,sans-serif" font-size="26" fill="#e7e9ec">currency per US dollar.</text>`;
  } else if (ds.categories) {
    const counts = new Map<string, number>();
    for (const r of rows) { const c = ds.categories[String(r.value)]; if (c) counts.set(c, (counts.get(c) ?? 0) + 1); }
    const order = Object.entries(ds.categories)
      .sort(([a], [b]) => (ds.better === 'high' ? Number(b) - Number(a) : Number(a) - Number(b)))
      .filter(([, n]) => counts.has(n));
    caption = `${rows.length} countries by status`;
    right = bars(order.map(([, n]) => ({ name: n, text: String(counts.get(n)), value: counts.get(n)! })));
  } else {
    const top = rows.slice(0, 8);
    // One decimal style down the column, as the page's ranking prints it.
    const texts = formatColumn(top.map((r) => r.value), ds.unit, ds.floor);
    // The unit, unless the values already carry it ("41.4%").
    const unit = texts.some((t) => /[%$]/.test(t)) || !ds.unit.trim() ? '' : ` · ${ds.unit}`;
    caption = cut(`Top ${top.length} of ${rows.length}${unit}`, 46);
    right = bars(top.map((r, i) => ({ name: r.name, text: texts[i], value: r.value })));
  }

  const { lines, size } = titleLines(ds.title);
  const titleSvg = lines.map((l, i) =>
    `<text x="90" y="${300 + i * (size + 10)}" font-family="Inter,Arial,sans-serif" font-size="${size}" font-weight="800" fill="#e7e9ec" letter-spacing="-1.5">${esc(l)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffb000"/><stop offset="1" stop-color="#ff7a00"/></linearGradient>
    <radialGradient id="glow" cx="78%" cy="0%" r="70%"><stop offset="0" stop-color="#ffb000" stop-opacity="0.16"/><stop offset="1" stop-color="#ffb000" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0e0f11"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(90,90)">
    <clipPath id="mk"><rect width="62" height="62" rx="15"/></clipPath>
    <g clip-path="url(#mk)"><rect width="62" height="62" fill="#ffb000"/><path d="M62 0 L62 62 L0 62 Z" fill="#ff7a00"/></g>
    <text x="31" y="45" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="42" font-weight="900" fill="#1a1300">B</text>
    <text x="80" y="45" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="800" fill="#e7e9ec">Bull<tspan fill="#ffb000">Dozer</tspan></text>
  </g>
  <text x="90" y="225" font-family="JetBrains Mono,monospace" font-size="22" fill="#ffb000">${esc(cut(shortSource(ds.source), Math.max(14, 42 - period.length - 3)))} · ${esc(period)}</text>
  ${titleSvg}
  <text x="90" y="560" font-family="JetBrains Mono,monospace" font-size="22" fill="#9aa1a9">azenha.ai/bulldozer · every number sourced</text>
  <text x="660" y="100" font-family="JetBrains Mono,monospace" font-size="18" fill="#9aa1a9">${esc(caption)}</text>
  <g transform="translate(660,120)">${right}</g>
</svg>`;
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
};
