import type { APIRoute } from 'astro';
import { datasets } from '@data/datasets';

/** The latest period of one dataset, already ranked — so a client can answer
 *  "who is highest on X" without downloading the whole series.
 *
 *  A dataset file carries every period it has: life expectancy alone is 3.4 MB,
 *  running back to 1800. This is the ~200 rows anyone actually asks for.
 *
 *  Ranked by value descending, the same ordering the country profiles use, so a
 *  position means the same thing in both places — which also means that on a
 *  series where less is better, position 1 is the worst country, not the best.
 */
export function getStaticPaths() {
  return datasets.map((d) => ({ params: { slug: d.slug }, props: { ds: d } }));
}

export const GET: APIRoute = ({ props }) => {
  const ds = (props as any).ds;
  const period = [...new Set(ds.data.map((o: any) => o.period))].sort().at(-1);
  const rows = ds.data
    .filter((o: any) => o.period === period && o.iso)
    .sort((a: any, b: any) => b.value - a.value)
    .map((o: any, i: number) => ({ iso: o.iso, name: o.entity, value: o.value, rank: i + 1 }));

  return new Response(
    JSON.stringify({
      slug: ds.slug, title: ds.title, unit: ds.unit, source: ds.source,
      period, total: rows.length, rows,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
