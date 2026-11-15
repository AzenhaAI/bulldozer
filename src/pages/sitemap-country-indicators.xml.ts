import type { APIRoute } from 'astro';
import { buildCountryIndex, countrySlug } from '@lib/countryIndex';

/** Every country × indicator page the Pages Function serves, so search engines
 *  find "<country> <indicator>" pages that exist as no file. Survey data from
 *  the GESIS archive (eb-, evs-, issp-) is left out of those pages. */
const GESIS = /^(eb|evs|issp)-/;
export const GET: APIRoute = () => {
  const base = 'https://azenha.ai/bulldozer';
  const urls: string[] = [];
  for (const c of buildCountryIndex()) {
    const cs = countrySlug(c.name);
    for (const it of c.items) if (!GESIS.test(it.slug)) urls.push(`${base}/country/${cs}/${it.slug}/`);
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
