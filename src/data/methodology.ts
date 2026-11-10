/** Per-source methodology & vintage notes — surfaced on dataset pages so the
 *  numbers are honest about how and when they were produced. Keyed by slug
 *  prefix; centralised here so we don't fake period labels in the data. */
export interface Methodology { vintage?: string; method?: string; notes?: StatsNote }

/** A sourced note on what an official statistics office no longer publishes.
 *  Every item carries at least one link to a report we read; an item we could
 *  not confirm from a solid source is left out rather than hedged in. */
export interface StatsNote {
  title: string;
  intro: string;
  items: { when: string; what: string; sources: { label: string; url: string }[] }[];
  /** Date the sources were last read. */
  checked: string;
}

/** Russia: why the monthly series come from the Bank of Russia, and which
 *  Rosstat publications have been withdrawn or cut back. Shown on the Russian
 *  series' dataset pages and on the Russia country profile. English only —
 *  Russian-language reports are cited with translated titles. */
export const RUSSIA_STATS_NOTE: StatsNote = {
  title: 'Russian official statistics: what is no longer published',
  intro: 'The monthly Russian series on this site come from the Bank of Russia. Rosstat, the federal statistics service, still publishes the consumer price index the central bank reports, but its website (rosstat.gov.ru) and its EMISS database (fedstat.ru) do not answer requests from outside Russia. Since 2024 Rosstat has also stopped or cut back several publications. The list below covers only changes we could confirm in at least one news report; the date is when the change took effect or was reported.',
  items: [
    { when: 'May–Aug 2024', what: 'Monthly output of motor fuels: petrol from the end of May 2024, then diesel, fuel oil, liquefied propane and butane, coke and stable gas condensate from August 2024. Rosstat cited a decision of the government.',
      sources: [{ label: 'Interfax, 29 Aug 2024', url: 'https://interfax.com/newsroom/top-stories/105511/' }] },
    { when: 'Mar–Jul 2025', what: 'Monthly births, deaths, marriages and divorces: the regional figures first (from the March 2025 data), then the national figures, which were left out of the monthly socio-economic report released in early July 2025.',
      sources: [
        { label: 'Meduza, 14 Jul 2025', url: 'https://meduza.io/en/feature/2025/07/14/no-births-no-deaths-no-data' },
        { label: 'The Moscow Times, 7 Jul 2025', url: 'https://www.themoscowtimes.com/2025/07/07/rosstat-stops-publishing-monthly-population-data-amid-war-deaths-demographic-crisis-a89696' },
      ] },
    { when: 'Jun 2025', what: 'Final mortality data for 2024: not released, for the first time.',
      sources: [{ label: 'Meduza, 14 Jul 2025', url: 'https://meduza.io/en/feature/2025/07/14/no-births-no-deaths-no-data' }] },
    { when: 'Late 2025', what: 'Statistical compendia on EMISS: 168 tables removed or shortened across ten compendia, more than 100 of them on demography; 115 indicators not updated since summer 2025 (count by the research project To Be Precise).',
      sources: [{ label: 'Meduza, 13 Feb 2026 — “Rosstat stopped publishing data on civil servants’ pay and household spending on housing and utilities” (in Russian)', url: 'https://meduza.io/news/2026/02/13/rosstat-perestal-publikovat-dannye-o-zarplatah-gossluzhaschih-i-tratah-grazhdan-na-zhkh' }] },
    { when: 'Feb 2026', what: 'Household budget survey, 2024 results: 2 of the 24 indicators on Rosstat’s website were updated; the shares of household spending on food, housing and utilities, and medicines were removed. Rosstat cited a decision of the government.',
      sources: [
        { label: 'iStories, 13 Feb 2026 — “Rosstat stopped publishing data on the pay of doctors and teachers and on spending on housing and utilities” (in Russian)', url: 'https://istories.media/news/2026/02/13/rosstat-perestal-publikovat-dannie-o-zarplatakh-vrachei-uchitelei-i-tratakh-na-zhkkh/' },
        { label: 'Meduza, 13 Feb 2026 (in Russian)', url: 'https://meduza.io/news/2026/02/13/rosstat-perestal-publikovat-dannye-o-zarplatah-gossluzhaschih-i-tratah-grazhdan-na-zhkh' },
      ] },
    { when: 'Feb 2026', what: 'Headcount and pay of federal and municipal civil servants; pay of doctors, teachers, university lecturers, culture workers and scientists.',
      sources: [
        { label: 'The Moscow Times, 13 Feb 2026', url: 'https://www.themoscowtimes.com/2026/02/13/russia-stops-publishing-officials-salary-data-a91949' },
        { label: 'Meduza, 13 Feb 2026 (in Russian)', url: 'https://meduza.io/news/2026/02/13/rosstat-perestal-publikovat-dannye-o-zarplatah-gossluzhaschih-i-tratah-grazhdan-na-zhkh' },
      ] },
  ],
  checked: '2026-11-10',
};

/** Country-level notes, by ISO3, shown on the country profile. */
export const COUNTRY_NOTES: Record<string, StatsNote> = { RUS: RUSSIA_STATS_NOTE };

export function methodologyFor(slug: string): Methodology {
  if (slug.startsWith('imf-'))
    return { method: 'Years after the latest actual are IMF estimates/projections, not outturns.' };
  if (slug.startsWith('ess-'))
    return { vintage: 'Pooled recent rounds (~2017–2023)', method: 'Weighted by post-stratification weight (pspwght); country mean on the 0–10 item.' };
  if (slug.startsWith('afro-'))
    return { vintage: 'Rounds 2–10 (2002–2025), one point per round', method: 'Weighted by within-country weight (withinwt; withinwt_ea from Round 8); share of substantive answers giving the stated response. A round that asked the question on a different answer scale is left out.' };
  if (slug.startsWith('wvs-'))
    return { vintage: 'Wave 7 (2017–2022)', method: 'Weighted by W_WEIGHT; Welzel cultural-values index, country mean.' };
  if (slug.startsWith('lits-'))
    return { vintage: 'LiTS I–IV (2006, 2010, 2016, 2022–23); which waves asked each item is in the summary', method: 'Weighted country mean of the item from the EBRD microdata; transition region plus a few comparator countries.' };
  if (slug.startsWith('hofstede-'))
    return { vintage: 'Dimension matrix (2010)', method: 'Published national scores (0–100); a fixed model, not a time series.' };
  if (slug === 'wb-account-ownership' || slug === 'wb-debit-card' || slug === 'wb-digital-payments' || slug === 'wb-mobile-money')
    return { vintage: 'Global Findex 2021/2024', method: 'World Bank Findex survey; share of adults 15+; latest available year per country.' };
  if (slug === 'forbes-global-2000')
    return { vintage: 'Forbes Global 2000 — 2023 list', method: 'Count of a country’s companies in the Forbes Global 2000; aggregate parsed from Wikipedia, by HQ country.' };
  if (slug.startsWith('brandz-'))
    return { vintage: 'Kantar BrandZ — 2026 ranking', method: 'Country totals aggregated from the Kantar BrandZ Most Valuable Global Brands list (via Wikipedia), by brand HQ country. Brand values are Kantar estimates.' };
  // GHE files carry their own vintage and a per-country data grade; the generic
  // GHO note below would replace both with "latest year varies", which is wrong.
  if (slug.startsWith('who-ghe-')) return {};
  if (slug.startsWith('who-'))
    return { method: 'WHO Global Health Observatory; latest available year per country (varies); both sexes, modelled estimates.' };
  if (slug.startsWith('wgm-'))
    return { vintage: 'Wellcome Global Monitor 2018 and 2020 (Gallup); vaccine items 2018 only', method: 'Gallup World Poll; weighted shares, base includes don’t know (as in Wellcome’s crosstabs); share giving the stated response.' };
  if (slug === 'cbr-key-rate')
    return { vintage: 'Monthly, September 2013 (when the key rate was introduced) onward', method: 'Rate in force on the last day of each complete month, from the Bank of Russia’s daily key-rate series; checked against the key-rate column of its monthly inflation and key rate table on every parse.', notes: RUSSIA_STATS_NOTE };
  if (slug === 'cbr-inflation')
    return { vintage: 'Monthly, September 2013 onward (the span of the Bank of Russia’s table)', method: 'Rosstat’s consumer price index, % change on the same month a year earlier, as the Bank of Russia republishes it.', notes: RUSSIA_STATS_NOTE };
  if (slug === 'cbr-inflation-expectations')
    return { vintage: 'Irregular waves 2010–2013; monthly from February 2014, except March 2014 and April–July 2020', method: 'Median of households’ own numeric estimates of price growth over the next 12 months, from the survey inFOM conducts for the Bank of Russia. Since 2013 the households’ figure has been above measured inflation in most months.', notes: RUSSIA_STATS_NOTE };
  if (slug === 'cbr-usd-rub')
    return { vintage: 'Monthly, January 2005 onward', method: 'Average of the Bank of Russia’s official US dollar rate over the month, from its data service; identical to the bank’s “basic derived indicators of the ruble exchange rate” workbook.', notes: RUSSIA_STATS_NOTE };
  if (slug === 'cbr-m2-growth')
    return { vintage: 'Monthly, January 2002 onward; each period is the stock on the 1st of that month (2026-10 = 1 October 2026)', method: 'M2, national definition (cash outside banks plus ruble deposits), % change on a year earlier as the Bank of Russia publishes it. The published rates can differ by a few tenths of a point from a plain ratio of the published levels.', notes: RUSSIA_STATS_NOTE };
  if (slug.startsWith('rlms-'))
    return { vintage: 'RLMS-HSE annual waves', method: 'RLMS-HSE longitudinal microdata (Russia only); weighted by inwgt; share/median by survey year.' };
  if (slug.startsWith('cb-'))
    return slug === 'cb-life-satisfaction'
      ? { vintage: 'Caucasus Barometer 2013 (last wave incl. Azerbaijan)', method: 'CRRC; weighted; mean of the 1–10 item. Not extended: CRRC’s time-series files keep only three bands.' }
      : { vintage: 'Caucasus Barometer 2008–2024 (Azerbaijan to 2013)', method: 'CRRC harmonised time-series files; weighted by WTIND; South Caucasus only (Armenia, Azerbaijan, Georgia).' };
  if (slug.startsWith('sdr2-'))
    return { vintage: '1966–2017 by five-year period; each country’s latest period in profiles', method: 'SDR2 harmonization across 22 survey projects; weighted by T_WEIGHT_L2U; a period pools the projects that surveyed the country then, so part of a change between periods can come from a different mix of surveys.' };
  if (slug === 'wrp-resilience')
    return { vintage: 'World Risk Poll 2023', method: 'Weighted by WGT; Resilience Index rescaled to 0–100.' };
  if (slug.startsWith('wrp-'))
    return { vintage: 'World Risk Poll 2019–2025 (Gallup); which waves asked each question is in the summary', method: 'Weighted by WGT; share giving the stated response among substantive answers, country level.' };
  return {};
}
