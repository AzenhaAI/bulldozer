/** Shared region colour palette for editorial charts. */
export const regionColor: Record<string, string> = {
  'Europe & Central Asia': '#60a5fa',
  'Americas': '#facc15', // yellow, not amber: amber and Africa's orange could not be told apart
  'East Asia & Pacific': '#34d399',
  'South Asia': '#a78bfa',
  'Middle East & North Africa': '#f472b6',
  'Sub-Saharan Africa': '#fb923c',
  'Advanced / other': '#94a3b8',
  // Gapminder 4-region names
  Europe: '#60a5fa',
  Asia: '#34d399',
  Africa: '#fb923c',
  // Split out of Asia by UN sub-region (lib/regions): its own hue.
  Oceania: '#22d3ee',
};

export function colorFor(region?: string): string {
  return (region && regionColor[region]) || '#94a3b8';
}

/**
 * Ordered category colours, best category first (Freedom House: Free, Partly
 * free, Not free): blue → amber → red, told apart without red–green and
 * readable as lines and chips on both themes. The map, the panel's category
 * chips and the trend lines all use these, so one status is one colour.
 */
const CATEGORY_COLORS = ['#3b82f6', '#e0a526', '#dc2626'];
export function categoryColors(n: number): string[] {
  if (n <= 1) return CATEGORY_COLORS.slice(0, Math.max(n, 0));
  return Array.from({ length: n }, (_, i) => CATEGORY_COLORS[Math.round((i * (CATEGORY_COLORS.length - 1)) / (n - 1))]);
}

export const regionList = [
  'Europe & Central Asia',
  'Americas',
  'East Asia & Pacific',
  'South Asia',
  'Middle East & North Africa',
  'Sub-Saharan Africa',
];
