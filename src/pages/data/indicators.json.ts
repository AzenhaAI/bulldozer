import type { APIRoute } from 'astro';
import { datasets } from '@data/datasets';

/** Compact catalogue for resolving what someone types into an indicator.
 *
 *  Titles carry qualifiers a person would never type — "Happiness (Cantril
 *  Ladder)", "Corruption Perceptions Index (QoG)" — so each entry also gets the
 *  plain words to match on, taken from the title with the bracketed source
 *  dropped. Matching itself belongs to the client; this is just the vocabulary.
 */
export const GET: APIRoute = () => {
  const items = datasets.map((d) => {
    const plain = d.title.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
    const periods = [...new Set(d.data.map((o) => o.period))].sort();
    return {
      slug: d.slug,
      title: d.title,
      plain,
      unit: d.unit,
      topic: d.topic,
      latest: periods[periods.length - 1],
      countries: new Set(d.data.filter((o) => o.period === periods[periods.length - 1] && o.iso).map((o) => o.iso)).size,
    };
  });
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
};
