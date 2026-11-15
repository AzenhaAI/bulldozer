/** Region and sub-national rules shared by the parsers and fix_regions.mjs. */

/** World Bank region (api.worldbank.org/v2/country) for codes the tidy
 *  exports leave as "—" ("Advanced / other") because their name lookup misses
 *  the source's spelling. Labels are the tidy taxonomy (REGION_RU_EN): North
 *  and Latin America are one "Americas". Keyed by ISO-3, or by name where the
 *  source has no code (North Cyprus). */
export const WB_REGION_FIX = {
  ARE: 'Middle East & North Africa', PSG: 'Middle East & North Africa',
  GBR: 'Europe & Central Asia', SVK: 'Europe & Central Asia', KGZ: 'Europe & Central Asia',
  MDA: 'Europe & Central Asia', RUS: 'Europe & Central Asia', XKX: 'Europe & Central Asia',
  CHI: 'Europe & Central Asia', 'North Cyprus': 'Europe & Central Asia',
  VNM: 'East Asia & Pacific', KOR: 'East Asia & Pacific', HKG: 'East Asia & Pacific', LAO: 'East Asia & Pacific',
  CIV: 'Sub-Saharan Africa', COG: 'Sub-Saharan Africa', COD: 'Sub-Saharan Africa', SWZ: 'Sub-Saharan Africa',
  SML: 'Sub-Saharan Africa', ZZB: 'Sub-Saharan Africa',
  MAF: 'Americas', SXM: 'Americas',
};

/** Parts of a country that some sources report on their own. Their rows stay
 *  in the dataset (listed on its page) but get iso '' and `sub: true`, so they
 *  are not ranked or profiled as countries: V-Dem's Zanzibar, Palestine/Gaza
 *  and Somaliland, WVS Northern Ireland, WDI's Channel Islands, WHR's North
 *  Cyprus (review, 15 Nov 2026). */
export const SUBNATIONAL_ISO = new Set(['ZZB', 'PSG', 'SML', 'NIR', 'CHI']);
export const SUBNATIONAL_NAME = new Set(['North Cyprus', 'Northern Cyprus']);

/** Mark a row as sub-national in place; returns the row. */
export function markSubnational(r) {
  if ((r.iso && SUBNATIONAL_ISO.has(r.iso)) || SUBNATIONAL_NAME.has(r.entity)) { r.iso = ''; r.sub = true; }
  return r;
}
