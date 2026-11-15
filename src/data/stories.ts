/** Data stories shown on the News/Home page and served to the mobile app. */
export interface Story {
  slug: string;
  tag: string;
  title: string;
  dek: string;
}

export const stories: Story[] = [
  {
    slug: 'happiest-countries',
    tag: 'World Happiness Report',
    title: 'The world’s happiest countries',
    dek: 'Who tops the World Happiness Report 2026, how happiness tracks income, and how the report’s model accounts for the scores.',
  },
  {
    slug: 'what-people-die-of',
    tag: 'WHO Global Health Estimates',
    title: 'What the world dies of',
    dek: 'Cancer is a sign of a long life: across countries, the cancer share of deaths tracks life expectancy far more closely than income (2021, a COVID-19 year).',
  },
  {
    slug: 'strongest-democracies',
    tag: 'V-Dem',
    title: 'The world’s strongest democracies',
    dek: 'The liberal-democracy leaders — and the countries at the bottom of the scale.',
  },
  {
    slug: 'cultural-map',
    tag: 'World Values Survey',
    title: 'The map of the world’s values',
    dek: 'The Inglehart-Welzel cultural map — where every country sits on two value dimensions.',
  },
  {
    slug: 'cultural-dimensions',
    tag: 'Hofstede',
    title: 'The shape of national culture',
    dek: 'Hofstede’s power distance vs individualism — the cultural fault lines between societies.',
  },
  {
    slug: 'russia-online',
    tag: 'RLMS-HSE',
    title: 'Russia went online — but not everyone',
    dek: 'Internet use in Russia since 2012, and the stark generation gap, from RLMS microdata.',
  },
];
