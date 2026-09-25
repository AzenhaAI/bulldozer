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
    dek: 'Who tops the ranking, how happiness tracks income, and what actually drives it.',
  },
  {
    slug: 'what-people-die-of',
    tag: 'WHO Global Health Estimates',
    title: 'What the world dies of',
    dek: 'Cancer is a sign of a long life: causes of death track how long people live, not how rich they are.',
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
