import type { APIRoute } from 'astro';
import { buildCountryIndex } from '@lib/countryIndex';
import isoAlpha2 from '@data/iso-alpha2.json';

/** Resolver for whatever someone types: KZ, KAZ or Kazakhstan.
 *
 *  Every key is lowercased; the value is the ISO-3 code naming the slice at
 *  /data/country/<iso3>.json. Two-letter codes are included because that is
 *  what people actually type, and they are the ambiguous ones — GE is Georgia,
 *  Germany is DE — so they resolve here rather than by guesswork in a client.
 */
export const GET: APIRoute = () => {
  const a2 = isoAlpha2 as Record<string, string>;
  const map: Record<string, string> = {};
  const names: { iso: string; a2: string; name: string; region: string }[] = [];

  for (const c of buildCountryIndex()) {
    const iso3 = c.iso.toUpperCase();
    map[iso3.toLowerCase()] = iso3;
    const two = a2[iso3];
    if (two && !map[two.toLowerCase()]) map[two.toLowerCase()] = iso3;
    map[c.name.toLowerCase()] = iso3;
    names.push({ iso: iso3, a2: two ?? '', name: c.name, region: c.region ?? 'Other' });
  }
  // names travel alongside the map so a client can offer "did you mean", and
  // carry the two-letter code a client needs to draw a flag, without pulling
  // the full index.
  return new Response(JSON.stringify({ map, names }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
