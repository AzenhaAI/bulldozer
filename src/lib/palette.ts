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
};

export function colorFor(region?: string): string {
  return (region && regionColor[region]) || '#94a3b8';
}

export const regionList = [
  'Europe & Central Asia',
  'Americas',
  'East Asia & Pacific',
  'South Asia',
  'Middle East & North Africa',
  'Sub-Saharan Africa',
];
