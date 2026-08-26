import type { APIRoute } from 'astro';
import { buildCountryIndex } from '@lib/countryIndex';

/** One file per country, so a client can fetch a single profile.
 *
 *  country-index.json holds all 232 profiles in one 3.4 MB document — fine for
 *  a build step, far too heavy for something that answers a chat message. These
 *  slices are ~15 KB each and are what the Telegram bot reads.
 */
export function getStaticPaths() {
  return buildCountryIndex().map((c) => ({
    params: { iso: c.iso.toLowerCase() },
    props: { country: c },
  }));
}

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify((props as any).country), {
    headers: { 'Content-Type': 'application/json' },
  });
