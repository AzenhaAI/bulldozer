import type { APIRoute } from 'astro';
import { datasets } from '@data/datasets';

/** The last ten periods of one series, every country — enough to show a trend.
 *
 *  The dataset files hold everything they have (life expectancy runs to 1800
 *  and 3.4 MB); a client asking "how has this moved" needs the recent tail, not
 *  two centuries. Ten periods keeps this in the tens of kilobytes.
 *
 *  Values are indexed by ISO and ordered oldest to newest, so a client can draw
 *  them without sorting.
 */
const TAIL = 10;

export function getStaticPaths() {
  return datasets.map((d) => ({ params: { slug: d.slug }, props: { ds: d } }));
}

export const GET: APIRoute = ({ props }) => {
  const ds = (props as any).ds;
  const periods = [...new Set(ds.data.map((o: any) => o.period))].sort().slice(-TAIL);
  const keep = new Set(periods);
  const byIso: Record<string, (number | null)[]> = {};

  for (const o of ds.data) {
    if (!o.iso || !keep.has(o.period)) continue;
    if (!byIso[o.iso]) byIso[o.iso] = periods.map(() => null);
    byIso[o.iso][periods.indexOf(o.period)] = o.value;
  }

  return new Response(
    JSON.stringify({ slug: ds.slug, title: ds.title, unit: ds.unit, periods, countries: byIso }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
