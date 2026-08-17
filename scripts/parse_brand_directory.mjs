/**
 * Most valuable brands directory → src/data/brands.json.
 * List (brand, country, value) from the Wikipedia "List of most valuable brands"
 * (Kantar BrandZ table); logo + one-line description enriched from Wikidata.
 *   node scripts/parse_brand_directory.mjs
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'brands.json');
const UA = { 'User-Agent': 'BullDozer/1.0 (agent@azenha.ai)' };
const ALIAS = { 'United States': 'USA', 'South Korea': 'KOR', 'United Kingdom': 'GBR', 'Hong Kong': 'HKG', 'Germany': 'DEU' };

async function wiki(params) {
  return (await fetch('https://en.wikipedia.org/w/api.php?format=json&' + new URLSearchParams(params), { headers: UA })).json();
}

async function main() {
  const wt = (await wiki({ action: 'parse', page: 'List_of_most_valuable_brands', prop: 'wikitext', section: 1 })).parse.wikitext['*'];
  const table = wt.slice(wt.indexOf('{|'), wt.indexOf('|}'));

  const rows = [];
  for (const block of table.split(/\n\|-/)) {
    const link = block.match(/\[\[([^\]]+)\]\]/);
    const country = block.match(/\{\{Flagu?\|([^}|]+)/i)?.[1]?.trim();
    if (!link || !country) continue;
    const after = block.slice(block.search(/\{\{Flagu?\|/i));
    const val = after.match(/\|\s*([\d,]{4,})/)?.[1];
    if (!val) continue;
    const [title, disp] = link[1].split('|');
    const name = (disp || title).trim().replace(/\s+(Inc\.?|plc|Corporation|Company|Co\.?|S\.?A\.?|Group|Holdings?)$|\.com$/i, '').trim();
    rows.push({ title: title.trim(), name, country, valueBn: Math.round(Number(val.replace(/,/g, '')) / 1000) });
  }

  // QIDs for the brand articles
  const titleToQid = {};
  for (let i = 0; i < rows.length; i += 45) {
    const batch = rows.slice(i, i + 45).map((r) => r.title);
    const pages = (await wiki({ action: 'query', prop: 'pageprops', titles: batch.join('|'), redirects: '1' })).query;
    const norm = {}; for (const n of pages.normalized || []) norm[n.from] = n.to;
    const red = {}; for (const r of pages.redirects || []) red[r.from] = r.to;
    const byTitle = {}; for (const p of Object.values(pages.pages)) byTitle[p.title] = p.pageprops?.wikibase_item;
    for (const t of batch) titleToQid[t] = byTitle[red[norm[t] || t] || norm[t] || t];
  }

  const qids = [...new Set(Object.values(titleToQid).filter(Boolean))];
  const q = `SELECT ?c ?logo ?iso ?desc WHERE {
    VALUES ?c { ${qids.map((q) => 'wd:' + q).join(' ')} }
    OPTIONAL { ?c wdt:P154 ?logo }
    OPTIONAL { ?c wdt:P17 ?country . ?country wdt:P298 ?iso }
    OPTIONAL { ?c schema:description ?desc FILTER(lang(?desc)='en') }
  }`;
  const wd = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { ...UA, Accept: 'application/sparql-results+json' } });
  const meta = {};
  if (wd.ok) for (const b of (await wd.json()).results.bindings) {
    const m = meta[b.c.value.split('/').pop()] ||= {};
    if (b.logo && !m.logo) m.logo = b.logo.value.replace(/^http:/, 'https:'); // avoid mixed-content blocking on https
    if (b.iso && !m.iso) m.iso = b.iso.value.toUpperCase();
    if (b.desc && !m.desc) m.desc = b.desc.value;
  }

  const out = rows.map((r, i) => {
    const m = meta[titleToQid[r.title]] || {};
    return { rank: i + 1, name: r.name, valueBn: r.valueBn, year: 2026, iso: m.iso || ALIAS[r.country] || null, logo: m.logo || null, desc: m.desc || null, wiki: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title)}` };
  });
  await writeFile(OUT, JSON.stringify(out));
  console.log(`✓ brands.json: ${out.length} (${out.filter((c) => c.logo).length} logos)`);
  console.log('  top:', out.slice(0, 4).map((c) => `${c.name} $${c.valueBn}bn`).join(' · '));
}
main();
