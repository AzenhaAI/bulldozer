// Series that a fresher one of ours measures too.
//
// Rule: where two sources give the same figure, the fresher one speaks for a
// country. A tester's Argentina showed 47 million people in the header (IMF,
// 2026) and 41 million a few lines below (Gapminder, which ends in 2013) —
// two answers to one question, the wrong one dressed as current (Oct 2026).
//
// A superseded series stays on the site as history — the bubble chart and the
// dataset pages run on Gapminder's long years — but it is kept out of country
// profiles, briefs, Ask AI and anything else that shows one number per country,
// and its title says "historical".
export const SUPERSEDED: Record<string, string> = {
  'gapminder-population': 'imf-population', // ends 2013
  'gapminder-income': 'imf-gdp-per-capita-ppp', // ends 2018
  'gapminder-gdp-growth': 'imf-gdp-growth', // ends 2019
  'gapminder-life-expectancy': 'wb-life-expectancy', // ends 2020
  'wb-digital-payments': 'findex-digital-payments', // ends 2017; Findex runs to 2024
};

export const isSuperseded = (slug: string): boolean => slug in SUPERSEDED;
