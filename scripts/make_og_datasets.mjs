/**
 * Per-dataset Open Graph images (1200×630) → public/og/{slug}.png.
 * Brand mark + dataset title + a top-8 bar chart from the latest period.
 * Reads the dataset JSON files directly (no Astro involved).
 */
import sharp from 'sharp';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'public', 'og');
mkdirSync(outDir, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Greedy word-wrap into the left column (chart owns the right half).
 *  ≤17 chars per line at 52px keeps every line under ~500px wide. */
function titleLines(t) {
  const MAX = 17;
  const lines = [];
  let cur = '';
  for (const w of t.split(' ')) {
    if (cur && (cur + ' ' + w).length > MAX) { lines.push(cur); cur = w; }
    else cur += (cur ? ' ' : '') + w;
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].slice(0, MAX - 1) + '…'; }
  return { lines, size: lines.some((l) => l.length > 14) ? 46 : 56 };
}

function fmt(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1) + 'bn';
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'm';
  if (a >= 1e3) return Math.round(v).toLocaleString('en-US');
  return a >= 100 ? String(Math.round(v)) : String(+v.toFixed(1));
}

function svgFor(meta, rows, period) {
  const { lines, size } = titleLines(meta.title);
  const top = rows.slice(0, 8);
  const max = Math.max(...top.map((r) => Math.abs(r.value)), 1e-9);
  const bars = top.map((r, i) => {
    const y = i * 52;
    const w = Math.max(6, Math.round((Math.abs(r.value) / max) * 290));
    const name = r.entity.length > 14 ? r.entity.slice(0, 13) + '…' : r.entity;
    return `<text x="0" y="${y + 24}" font-family="Inter,Arial,sans-serif" font-size="20" fill="#9aa1a9">${esc(name)}</text>
      <rect x="175" y="${y + 8}" width="${w}" height="22" rx="4" fill="url(#b)" opacity="${1 - i * 0.09}"/>
      <text x="${181 + w}" y="${y + 25}" font-family="JetBrains Mono,monospace" font-size="17" fill="#e7e9ec">${esc(fmt(r.value))}</text>`;
  }).join('');
  const titleSvg = lines.map((l, i) =>
    `<text x="90" y="${300 + i * (size + 10)}" font-family="Inter,Arial,sans-serif" font-size="${size}" font-weight="800" fill="#e7e9ec" letter-spacing="-1.5">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
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
  <text x="90" y="225" font-family="JetBrains Mono,monospace" font-size="22" fill="#ffb000">${esc((meta.source.length > 32 ? meta.source.slice(0, 31) + '…' : meta.source))} · ${esc(period)}</text>
  ${titleSvg}
  <text x="90" y="560" font-family="JetBrains Mono,monospace" font-size="22" fill="#9aa1a9">azenha.ai/bulldozer · every number sourced</text>
  <g transform="translate(660,120)">${bars}</g>
</svg>`;
}

let n = 0;
for (const dir of ['surveys', 'macro']) {
  const d = join(root, 'src', 'data', dir);
  for (const f of readdirSync(d).filter((x) => x.endsWith('.json'))) {
    const slug = f.replace(/\.json$/, '');
    const { meta, data } = JSON.parse(readFileSync(join(d, f), 'utf8'));
    const periods = [...new Set(data.map((o) => o.period))].sort();
    const period = periods.at(-1);
    const rows = data.filter((o) => o.period === period && o.iso).sort((a, b) => b.value - a.value);
    if (!rows.length) continue;
    const svg = svgFor(meta, rows, period);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(join(outDir, `${slug}.png`));
    n++;
  }
}
console.log(`✓ wrote ${n} images to public/og/`);
