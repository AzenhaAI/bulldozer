import type { APIRoute } from 'astro';
import { buildCountryIndex } from '@lib/countryIndex';
import { briefFor } from '@lib/countryBrief';

/** One small file per country for the app's "Ask AI" screen (and the bot):
 *  what we hold on the country and where it stands out. See countryBrief.ts
 *  for how lines are chosen. */
export function getStaticPaths() {
  return buildCountryIndex().map((c) => ({ params: { iso: c.iso.toLowerCase() }, props: { brief: briefFor(c) } }));
}

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify((props as any).brief), { headers: { 'Content-Type': 'application/json' } });
