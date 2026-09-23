import type { APIRoute } from 'astro';
import { datasets } from '@data/datasets';

/**
 * Live dataset catalog for the mobile app — same shape as the app's baked
 * lib/catalog.dart (slug/title/unit/kind/topic/source). Lets the app pick up
 * new datasets without a rebuild. Excludes single-country RLMS microdata,
 * which the app does not surface (mirrors tools/gen_catalog.mjs).
 */
export const GET: APIRoute = () => {
  const catalog = datasets
    .filter((d) => !d.slug.startsWith('rlms-'))
    .map((d) => {
      // latest data year, so the app can show "data as of YYYY"
      let latest = '';
      for (const o of d.data ?? []) if (o.period > latest) latest = o.period;
      return {
        slug: d.slug,
        title: d.title,
        unit: d.unit ?? '',
        kind: d.kind,
        topic: d.topic,
        source: d.source ?? '',
        parsedAt: d.parsedAt ?? '', // when we last refreshed it (freshness)
        firstSeen: d.firstSeen ?? '', // when it first appeared — the app's "new" should use this
        latest, // latest period present in the data
      };
    });
  return new Response(JSON.stringify(catalog), {
    headers: { 'Content-Type': 'application/json' },
  });
};
