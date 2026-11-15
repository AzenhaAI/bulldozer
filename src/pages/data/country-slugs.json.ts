import type { APIRoute } from 'astro';
import { buildCountryIndex, countrySlug } from '@lib/countryIndex';

/** Country page slug → ISO-3, for the Pages Function that renders
 *  /country/<slug>/<dataset>/ on request (azenha functions/bulldozer/country).
 *  One small file instead of ~25,000 pages, which the 20,000-file upload limit
 *  of the whole azenha.ai site could not hold. */
export const GET: APIRoute = () => {
  const map: Record<string, string> = {};
  for (const c of buildCountryIndex()) map[countrySlug(c.name)] = c.iso.toUpperCase();
  return new Response(JSON.stringify(map), { headers: { 'Content-Type': 'application/json' } });
};
