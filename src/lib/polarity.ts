/** Which way is better, for the indicators where that is not a matter of opinion.
 *
 *  A rank counts down from the highest value, whatever the series measures: on
 *  child mortality the country at #1 is the worst in the world. The app coloured
 *  the top third green regardless, and a tester asked of "#5 of 120" whether that
 *  was good or bad (2 Nov 2026). Only outcomes with a plain direction are listed
 *  here — health, poverty, safety, learning, governance indices built so that
 *  higher is better. Opinions, attitudes, trust, spending, debt, inflation,
 *  shares of deaths by cause and anything sized by population stay neutral: a
 *  rank there says where a country stands, not whether that is good. */
export type Better = 'high' | 'low';

const HIGH = new Set([
  'owid-electricity', 'findex-account-ownership', 'wb-account-ownership', 'gapminder-literacy',
  'v-dem-v2x-civlib', 'v-dem-v2xel-frefair', 'v-dem-v2x-delibdem', 'v-dem-v2x-egaldem', 'v-dem-v2x-polyarchy',
  'v-dem-v2x-libdem', 'v-dem-v2x-partipdem', 'v-dem-v2x-gender', 'v-dem-v2x-jucon', 'v-dem-v2x-rule',
  'v-dem-v2x-freexp-altinf', 'v-dem-v2mecenefm', 'fiw-freedom-score', 'afro-free-speech',
  'qog-wbgi-cce', 'cpi-corruption-perceptions', 'qog-ti-cpi', 'qog-wbgi-gee', 'qog-wbgi-vae',
  'epi-environmental-performance',
  'imf-gdp-per-capita', 'imf-gdp-per-capita-ppp', 'maddison-gdp-per-capita', 'gapminder-income', 'pwt-pwt-gdp-per-hour',
  'whr-happiness', 'evs-happiness', 'eb-life-satisfaction', 'cb-life-satisfaction', 'gapminder-hdi',
  'whr-driver-freedom', 'whr-driver-gdp', 'whr-driver-generosity', 'whr-driver-health', 'whr-driver-corruption', 'whr-driver-social',
  'iccs-civic-knowledge', 'icils-computational-thinking', 'icils-computer-literacy', 'pirls-reading',
  'pisa-mathematics', 'pisa-reading', 'pisa-science',
  'timss-math-grade4', 'timss-math-grade8', 'timss-science-grade4', 'timss-science-grade8', 'owid-schooling',
  'wb-life-expectancy', 'gapminder-life-expectancy', 'who-uhc', 'dhs-modern-contraception',
  'gapminder-internet', 'lapop-home-broadband', 'wrp-resilience', 'wrp-can-protect',
]);

const LOW = new Set([
  'who-adult-mortality', 'owid-child-mortality', 'qog-wdi-mortinf', 'who-ncd-mortality-rate', 'who-ncd-mortality-30-70',
  'who-obesity', 'ehis-obesity', 'who-hypertension', 'ehis-smoking', 'who-tobacco', 'who-suicide', 'who-road-deaths',
  'owid-undernourishment', 'dhs-child-marriage',
  'owid-extreme-poverty', 'silc-poverty-risk', 'silc-deprivation', 'imf-unemployment', 'gapminder-gini', 'owid-gender-inequality',
  'afro-went-without-cash', 'afro-went-without-food', 'afro-went-without-medical-care',
  'gapminder-homicide', 'gpi-global-peace', 'lapop-feel-unsafe', 'afro-felt-unsafe', 'wrp-discrimination',
  'lapop-police-bribe', 'v-dem-v2x-corr', 'qog-fh-status',
  'inform-risk', 'wri-risk', 'wri-exposure', 'wrp-disaster-experienced',
]);

export function betterFor(slug: string): Better | undefined {
  return HIGH.has(slug) ? 'high' : LOW.has(slug) ? 'low' : undefined;
}
