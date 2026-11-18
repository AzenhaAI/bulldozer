/**
 * The app screen that matches a site page, as the app's own link path
 * (bulldozerstats://open/<screen>, lib/deep_links.dart in bulldozer_app).
 * Used by the Smart App Banner's app-argument and the Android "open in the
 * app" intent, so someone who has the app lands where they were reading.
 * Pages with no screen of their own open the app at home ('').
 */
const TABS: Record<string, string> = {
  ask: 'ask', macro: 'stats', explore: 'stats', markets: 'biz',
  surveys: 'polls', geo: 'geo', edu: 'edu', economy: 'economy', quiz: 'quiz',
};

export function appScreen(pathname: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const seg = pathname.slice(base.length).split('/').filter(Boolean);
  if (seg[0] === 'dataset' && seg[1]) {
    // Single-country series stay on the site; the app does not carry them.
    return /^(rlms|cbr)-/.test(seg[1]) ? '' : `dataset/${seg[1]}`;
  }
  return TABS[seg[0] ?? ''] ?? '';
}
