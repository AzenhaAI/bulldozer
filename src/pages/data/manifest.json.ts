import type { APIRoute } from 'astro';
import { datasets } from '@data/datasets';
import { stories } from '@data/stories';
import { releases } from '@data/releases';
import { buildCountryIndex } from '@lib/countryIndex';
import cities from '@data/cities.json';
import brands from '@data/brands.json';

/**
 * Discovery manifest for the mobile app — the single doc the app reads first.
 * Lists every JSON resource the app can pull, plus counts and the freshest
 * data date, so new data / sections flow to the app WITHOUT an app rebuild.
 *
 * Convention going forward: anything new on the site ships a /data/*.json
 * endpoint and gets listed here; the app auto-discovers it via this manifest.
 */
export const GET: APIRoute = () => {
  const cat = datasets.filter((d) => !d.slug.startsWith('rlms-') && !d.slug.startsWith('cbr-'));
  // freshest parse date across all datasets → "data updated" on Home
  let freshest = '';
  for (const d of cat) if ((d.parsedAt ?? '') > freshest) freshest = d.parsedAt ?? '';

  const countries = buildCountryIndex();

  const manifest = {
    // bump when the manifest's shape changes (not on every data refresh)
    schema: 1,
    freshestParse: freshest, // ISO date of the most recently refreshed dataset
    counts: {
      datasets: cat.length,
      countries: countries.length,
      stories: stories.length,
      cities: (cities as any)?.metrics?.[0]?.data?.length ?? 0,
      brands: Array.isArray(brands) ? brands.length : 0,
      releases: releases.length,
    },
    // every resource the app can fetch, relative to /bulldozer
    resources: {
      catalog: '/data/catalog.json',
      countryIndex: '/data/country-index.json',
      countryMeta: '/data/country-meta.json',
      dataset: '/data/{slug}.json',
      quizPool: '/data/quiz-pool.json',
      releases: '/data/releases.json',
      stories: '/data/stories.json',
      cities: '/data/cities.json',
      brands: '/data/brands.json',
      search: '/data/search.json',
    },
    stories: stories.map((s) => ({ slug: s.slug, title: s.title })),
  };

  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/json' },
  });
};
