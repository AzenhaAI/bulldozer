/** Per-source methodology & vintage notes — surfaced on dataset pages so the
 *  numbers are honest about how and when they were produced. Keyed by slug
 *  prefix; centralised here so we don't fake period labels in the data. */
export interface Methodology { vintage?: string; method?: string }

export function methodologyFor(slug: string): Methodology {
  if (slug.startsWith('imf-'))
    return { method: 'Years after the latest actual are IMF estimates/projections, not outturns.' };
  if (slug.startsWith('ess-'))
    return { vintage: 'Pooled recent rounds (~2017–2023)', method: 'Weighted by post-stratification weight (pspwght); country mean on the 0–10 item.' };
  if (slug.startsWith('afro-'))
    return { vintage: 'Round 9 (2021–2023)', method: 'Weighted by within-country weight (withinwt_ea); share giving the stated response.' };
  if (slug.startsWith('wvs-'))
    return { vintage: 'Wave 7 (2017–2022)', method: 'Weighted by W_WEIGHT; Welzel cultural-values index, country mean.' };
  if (slug.startsWith('lits-'))
    return { vintage: 'LiTS IV (~2022–2023)', method: 'Country mean of the item; transition region only, single wave.' };
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
    return { vintage: 'Wellcome Global Monitor 2018 (Gallup)', method: 'Gallup World Poll; weighted shares (Column N %); share giving the stated response.' };
  if (slug.startsWith('rlms-'))
    return { vintage: 'RLMS-HSE annual waves', method: 'RLMS-HSE longitudinal microdata (Russia only); weighted by inwgt; share/median by survey year.' };
  if (slug.startsWith('cb-'))
    return { vintage: 'Caucasus Barometer 2013 (last wave incl. Azerbaijan)', method: 'CRRC; weighted by indwt; South Caucasus only (Armenia, Azerbaijan, Georgia).' };
  if (slug.startsWith('sdr2-'))
    return { vintage: 'Pooled harmonized waves (to ~2017)', method: 'SDR2 harmonization across 22 survey projects; weighted by T_WEIGHT_L2U; country mean of the harmonized target item.' };
  if (slug === 'wrp-resilience')
    return { vintage: 'World Risk Poll 2023', method: 'Weighted by WGT; Resilience Index rescaled to 0–100.' };
  if (slug.startsWith('wrp-'))
    return { vintage: 'World Risk Poll 2023 (Gallup)', method: 'Weighted by WGT; share giving the stated response, country level.' };
  return {};
}
