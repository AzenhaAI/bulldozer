/**
 * One region scheme per page.
 *
 * Sources tag countries with their own groupings, and some mix two schemes in
 * one file: LiTS lists Kosovo alone under the World Bank's "Europe & Central
 * Asia" next to everyone else's "Europe", and the World Bank pulls (market cap,
 * exchange rate, refugees) fold Australia, New Zealand and the Pacific islands
 * into "Asia". The country profiles already fix this with the UN M49
 * sub-region (QA, 15 Nov 2026); this module is that rule, shared, so the
 * dataset pages group countries the same way the profiles do.
 */
import subregions from '@data/subregions.json';

const SUBREGION = subregions as Record<string, string>;
const OCEANIA = new Set(['Australia and New Zealand', 'Melanesia', 'Micronesia', 'Polynesia']);
const CONTINENTS = new Set(['Africa', 'Americas', 'Asia', 'Europe', 'Oceania']);

/** Continent of a country: the source's own continent where it gave one,
 *  Oceania from the UN sub-region (sources fold the Pacific into Asia), and
 *  the UN sub-region where the source gave none. */
export function continentOf(iso: string, fromSource: string): string {
  const sub = SUBREGION[iso];
  if (sub && OCEANIA.has(sub)) return 'Oceania';
  if (fromSource || !sub) return fromSource;
  if (/Asia$/.test(sub)) return 'Asia';
  if (/Africa$/.test(sub)) return 'Africa';
  if (/Europe$/.test(sub)) return 'Europe';
  return 'Americas'; // Caribbean, Central, North and South America
}

/** A region name from another scheme, read as a continent when there is no
 *  sub-region to go by ("Europe & Central Asia" → Europe). */
function continentFromName(g: string): string {
  if (/europe/i.test(g)) return 'Europe';
  if (/africa/i.test(g)) return 'Africa';
  if (/america|caribbean/i.test(g)) return 'Americas';
  if (/pacific|oceania/i.test(g)) return 'Oceania';
  if (/asia|middle east/i.test(g)) return 'Asia';
  return g;
}

/**
 * Rows with their `group` on one scheme. When most rows use continents
 * (Africa, Americas, Asia, Europe), every row is put on continents, with
 * Oceania split out of Asia. A file on another scheme throughout (the IMF's
 * World Bank regions, where Australia does belong to "East Asia & Pacific")
 * is left as it is: it is already consistent.
 */
export function normaliseGroups<T extends { group?: string; iso?: string }>(rows: T[]): T[] {
  let tagged = 0, onContinents = 0;
  for (const o of rows) if (o.group) { tagged++; if (CONTINENTS.has(o.group)) onContinents++; }
  if (!tagged || onContinents * 2 < tagged) return rows;
  return rows.map((o) => {
    if (!o.group) return o;
    const src = CONTINENTS.has(o.group) ? o.group : '';
    const g = (o.iso ? continentOf(o.iso, src) : src) || continentFromName(o.group);
    return g === o.group ? o : { ...o, group: g };
  });
}
