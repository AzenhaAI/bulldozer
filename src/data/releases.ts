/**
 * Data release calendar — when the key macro indicators and surveys come out.
 * `month` is the typical release month(s) (1–12) used to sort by "next up".
 */
export interface Release {
  name: string;
  window: string;
  months: number[];
  description: string;
  url: string;
  kind: 'macro' | 'survey';
}

export const releases: Release[] = [
  { name: 'IMF World Economic Outlook', window: 'April & October', months: [4, 10], kind: 'macro',
    description: 'Flagship global growth, inflation and fiscal forecasts. The Update lands in January & July.',
    url: 'https://www.imf.org/en/Publications/WEO' },
  { name: 'World Bank — Global Economic Prospects', window: 'January & June', months: [1, 6], kind: 'macro',
    description: 'The World Bank’s twice-yearly outlook for the world and developing economies.',
    url: 'https://www.worldbank.org/en/publication/global-economic-prospects' },
  { name: 'World Happiness Report', window: '20 March', months: [3], kind: 'survey',
    description: 'Released on the International Day of Happiness — the country happiness ranking and its drivers.',
    url: 'https://worldhappiness.report/' },
  { name: 'V-Dem Democracy Report', window: 'March', months: [3], kind: 'survey',
    description: 'Annual state of democracy worldwide, with updated electoral and liberal democracy indices.',
    url: 'https://www.v-dem.net/publications/democracy-reports/' },
  { name: 'Transparency Int’l — Corruption Perceptions Index', window: 'February', months: [2], kind: 'survey',
    description: 'The most-cited global corruption ranking, scoring 180 countries.',
    url: 'https://www.transparency.org/en/cpi' },
  { name: 'Freedom House — Freedom in the World', window: 'February / March', months: [2, 3], kind: 'survey',
    description: 'Annual assessment of political rights and civil liberties across the globe.',
    url: 'https://freedomhouse.org/report/freedom-world' },
  { name: 'Eurobarometer (Standard)', window: 'Spring & autumn', months: [5, 11], kind: 'survey',
    description: 'The European Commission’s twice-yearly read on EU public opinion.',
    url: 'https://europa.eu/eurobarometer/' },
  { name: 'OECD — Taxing Wages', window: 'April / May', months: [4], kind: 'macro',
    description: 'Annual comparison of the tax burden on labour across OECD countries.',
    url: 'https://www.oecd.org/en/data/datasets/taxing-wages.html' },
  { name: 'BIS — Credit statistics', window: 'Quarterly', months: [3, 6, 9, 12], kind: 'macro',
    description: 'Quarterly update of credit to households, firms and government as a share of GDP.',
    url: 'https://www.bis.org/statistics/totcredit.htm' },
  { name: 'Reuters Institute Digital News Report', window: 'Mid June', months: [6], kind: 'survey',
    description: 'The yearly study of news consumption across ~48 markets — trust, payment, avoidance, platforms.',
    url: 'https://reutersinstitute.politics.ox.ac.uk/digital-news-report' },
  { name: 'Latinobarómetro report', window: 'December', months: [12], kind: 'survey',
    description: 'Annual report on democracy and society across 18 Latin American countries.',
    url: 'https://www.latinobarometro.org/' },
];

/** Releases ordered by how soon the next one is, from the given month (1–12). */
export function upcoming(fromMonth: number): Release[] {
  const nextDelta = (r: Release) =>
    Math.min(...r.months.map((m) => (m - fromMonth + 12) % 12));
  return [...releases].sort((a, b) => nextDelta(a) - nextDelta(b));
}
