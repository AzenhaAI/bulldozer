import type { APIRoute } from 'astro';
import { datasets } from '@data/datasets';
import { buildCountryIndex, countrySlug } from '@lib/countryIndex';
import { TOPICS } from '@lib/topics';

/** Compact index for the header search: [icon, label, href-path] triples. */
export const GET: APIRoute = () => {
  const items = [
    ...datasets.map((d) => [TOPICS[d.topic]?.icon ?? '📊', d.title, `/dataset/${d.slug}/`]),
    ...buildCountryIndex().map((c) => ['🌍', c.name, `/country/${countrySlug(c.name)}/`]),
  ];
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
};
