/**
 * Titles and meta descriptions that fit what search engines show: titles
 * ≤ 60 characters, descriptions ≤ 155 (Ahrefs site audit, 25 Nov 2026: 935
 * titles and 31 descriptions too long). The same rules run in the Pages
 * Function that renders /country/<country>/<indicator>/ (azenha repo,
 * functions/bulldozer/country/[c]/[[rest]].js) — keep them in step.
 */
export const TITLE_MAX = 60;
export const DESC_MAX = 155;

/** "Feel Unsafe (AmericasBarometer)" → "Feel Unsafe". */
export const dropParen = (s: string) => s.replace(/\s*\([^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim();

/** Cut at a word boundary and add "…" so the result is at most `max`. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:—–-]+$/, '') + '…';
}

/** The first candidate that fits; otherwise the last one, clipped. */
export function fitTitle(candidates: string[], max = TITLE_MAX): string {
  const c = candidates.map((s) => s.replace(/\s{2,}/g, ' ').trim()).filter(Boolean);
  return c.find((s) => s.length <= max) ?? clip(c[c.length - 1] ?? '', max);
}

/** Ends at the last full sentence inside the limit when that keeps most of the
 *  text; otherwise at a word, with "…". */
export function fitDesc(s: string, max = DESC_MAX): string {
  const t = s.replace(/\s{2,}/g, ' ').trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const stop = Math.max(head.lastIndexOf('. '), head.endsWith('.') ? head.length - 1 : -1);
  if (stop >= 110) return head.slice(0, stop + 1);
  return clip(t, max);
}

/** Add parts while the text still fits: a description built from the most
 *  important facts down. */
export function fitParts(parts: string[], sep: string, max = DESC_MAX): string {
  let out = '';
  for (const p of parts) {
    const next = out ? out + sep + p : p;
    if (next.length > max) break;
    out = next;
  }
  return out || clip(parts[0] ?? '', max);
}
