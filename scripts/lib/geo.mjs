/** Country lookup shared by parsers whose sources give bare ISO codes
 *  (ISO-3 or ISO-2) without names: name and region from the Gapminder
 *  registry, with country-names.json as the fallback name. Only codes in
 *  src/data/iso-alpha2.json count as countries, so regional aggregates and
 *  private-use codes fall away. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, gapminderRows, REGION_4 } from './datasets.mjs';

export async function countryLookup() {
  const a3a2 = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'iso-alpha2.json'), 'utf8'));
  const names = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'country-names.json'), 'utf8'));
  const a2a3 = Object.fromEntries(Object.entries(a3a2).map(([a3, a2]) => [a2, a3]));
  const geo = new Map();
  for (const r of await gapminderRows()) {
    const k = (r.iso3166_1_alpha3 || '').toUpperCase();
    if (k) geo.set(k, { name: r.name, region: REGION_4[r.world_4region] || 'Other' });
  }
  return {
    /** ISO-3 for an ISO-3 or ISO-2 code, or null when it is not a country. */
    iso3(code) {
      const c = String(code || '').toUpperCase();
      if (c.length === 3) return a3a2[c] ? c : null;
      return a2a3[c] ?? null;
    },
    iso2s: Object.values(a3a2),
    /** {entity, group} for an ISO-3 code. */
    describe(iso3) {
      const g = geo.get(iso3);
      return { entity: g?.name || names[iso3]?.common || iso3, group: g?.region || 'Other' };
    },
  };
}

/** fetch → text with retries; null on 404. Sources here (World Bank, APNIC)
 *  have bad minutes that a second try gets past. */
export async function fetchText(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i >= tries) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

/** Run `fn` over `items` with at most `n` in flight; results keep input order. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
