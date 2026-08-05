/**
 * Largest companies directory → src/data/companies.json.
 * Base list (name, industry, revenue, employees, HQ) from the Wikipedia
 * "List of largest companies by revenue" table; logo, country ISO-3 and a
 * one-line description enriched from Wikidata (same approach as country
 * coat-of-arms). Public, factual, reproducible — no scraping of company sites.
 *   node scripts/parse_company_directory.mjs
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'companies.json');
const UA = { 'User-Agent': 'BullDozer/1.0 (azenha.agent@gmail.com)' };
const num = (s) => { const m = (s || '').match(/[\d][\d,.]*/); return m ? Number(m[0].replace(/,/g, '')) : null; };
const firstLink = (s) => { const m = (s || '').match(/\[\[([^\]]+)\]\]/); return m ? (m[1].split('|')[1] || m[1].split('|')[0]).trim() : null; };

async function wiki(params) {
  return (await fetch('https://en.wikipedia.org/w/api.php?format=json&' + new URLSearchParams(params), { headers: UA })).json();
}

const REV_YEAR = 2024;   // "List of largest companies by revenue" reports FY2024
const CAP_YEAR = 2026;   // market-cap snapshot section

/** Current market capitalisation (US$ mn) per company from the 2026 table. */
async function marketCaps() {
  const secs = (await wiki({ action: 'parse', page: 'List_of_public_corporations_by_market_capitalization', prop: 'sections' })).parse.sections;
  const idx = secs.find((s) => s.line === String(CAP_YEAR))?.index;
  if (!idx) return new Map();
  const wt = (await wiki({ action: 'parse', page: 'List_of_public_corporations_by_market_capitalization', prop: 'wikitext', section: idx })).parse.wikitext['*'];
  const table = wt.slice(wt.indexOf('{|'), wt.indexOf('|}'));
  const m = new Map();
  for (const block of table.split(/\n\|-/)) {
    const t = block.match(/\[\[([^\]|]+)/);
    const v = block.match(/([\d,]{4,})/);
    if (t && v) m.set(t[1].trim(), { name: (block.match(/\[\[[^\]|]+\|([^\]]+)\]\]/)?.[1] || t[1]).trim(), capBn: Math.round(Number(v[1].replace(/,/g, '')) / 1000) });
  }
  return m;
}

async function main() {
  const wt = (await wiki({ action: 'parse', page: 'List_of_largest_companies_by_revenue', prop: 'wikitext', section: 1 })).parse.wikitext['*'];
  const table = wt.slice(wt.indexOf('{|'), wt.indexOf('|}'));

  // Only the rank + linked company name are reliable from the table (rowspans in
  // the HQ column shift the other cells); everything else comes from Wikidata.
  const rows = [];
  const seen = new Set();
  for (const block of table.split(/\n\|-/)) {
    if (!/scope="row"/.test(block)) continue;
    const title0 = block.match(/\[\[([^\]]+)\]\]/);
    if (!title0) continue;
    const [title, disp] = title0[1].split('|');
    // Revenue cell is uniquely marked with a {{profit}}/{{loss}} trend arrow;
    // the profit and employees cells follow it (all before the rowspan'd HQ col).
    const rev = block.match(/([\d,]+(?:\.\d+)?)\s*\{\{(?:profit|loss|nochange|increase|decrease)\}\}/i);
    let profitBn = null, employees = null;
    if (rev) {
      const after = block.slice(block.indexOf(rev[0]) + rev[0].length).split('||');
      const p = (after[1] || '').match(/(−|-)?\s*([\d,]+(?:\.\d+)?)/);
      if (p) profitBn = Number((p[1] ? '-' : '') + p[2].replace(/,/g, ''));
      const e = (after[2] || '').match(/([\d,]{4,})/);
      if (e) employees = Number(e[1].replace(/,/g, ''));
    }
    rows.push({ title: title.trim(), name: (disp || title).trim(), revenueBn: rev ? Number(rev[1].replace(/,/g, '')) : null, profitBn, employees, capBn: null });
    seen.add(title.trim());
  }
  // merge in market caps (and append any market-cap leaders missing from the revenue list)
  const caps = await marketCaps();
  for (const r of rows) { const c = caps.get(r.title); if (c) r.capBn = c.capBn; }
  for (const [title, c] of caps) if (!seen.has(title)) rows.push({ title, name: c.name, revenueBn: null, capBn: c.capBn });

  // Resolve Wikidata QIDs for the article titles (batched)
  const titleToQid = {};
  for (let i = 0; i < rows.length; i += 45) {
    const batch = rows.slice(i, i + 45).map((r) => r.title);
    const pages = (await wiki({ action: 'query', prop: 'pageprops', titles: batch.join('|'), redirects: '1' })).query;
    const norm = {}; for (const n of pages.normalized || []) norm[n.from] = n.to;
    const red = {}; for (const r of pages.redirects || []) red[r.from] = r.to;
    const byTitle = {}; for (const p of Object.values(pages.pages)) byTitle[p.title] = p.pageprops?.wikibase_item;
    for (const t of batch) titleToQid[t] = byTitle[red[norm[t] || t] || norm[t] || t];
  }

  // Wikidata: logo (P154), country ISO3 (P17→P298), industry (P452), description
  const qids = [...new Set(Object.values(titleToQid).filter(Boolean))];
  const q = `SELECT ?c ?logo ?iso ?industryLabel ?desc ?rev ?revt WHERE {
    VALUES ?c { ${qids.map((q) => 'wd:' + q).join(' ')} }
    OPTIONAL { ?c wdt:P154 ?logo }
    OPTIONAL { ?c wdt:P17 ?country . ?country wdt:P298 ?iso }
    OPTIONAL { ?c wdt:P452 ?industry . ?industry rdfs:label ?industryLabel FILTER(lang(?industryLabel)='en') }
    OPTIONAL { ?c schema:description ?desc FILTER(lang(?desc)='en') }
    OPTIONAL { ?c p:P2139 ?rst . ?rst ps:P2139 ?rev . ?rst psv:P2139 ?rvn . ?rvn wikibase:quantityUnit wd:Q4917 . OPTIONAL { ?rst pq:P585 ?revt } }
    OPTIONAL { ?c p:P2226 ?cst . ?cst ps:P2226 ?mcap . ?cst psv:P2226 ?mcn . ?mcn wikibase:quantityUnit wd:Q4917 . OPTIONAL { ?cst pq:P585 ?mcapt } }
  }`;
  const wd = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { ...UA, Accept: 'application/sparql-results+json' } });
  const meta = {};
  if (wd.ok) for (const b of (await wd.json()).results.bindings) {
    const m = meta[b.c.value.split('/').pop()] ||= {};
    if (b.logo && !m.logo) m.logo = b.logo.value.replace(/^http:/, 'https:'); // avoid mixed-content blocking on https
    if (b.iso && !m.iso) m.iso = b.iso.value.toUpperCase();
    if (b.industryLabel && !m.industry) m.industry = b.industryLabel.value;
    if (b.desc && !m.desc) m.desc = b.desc.value;
    // latest USD revenue (P2139) — fallback for cap leaders missing from the revenue table
    if (b.rev) {
      const t = b.revt ? b.revt.value : '0';
      if (!m.revAt || t > m.revAt) { m.revAt = t; m.revBn = Math.round(Number(b.rev.value) / 1e9); }
    }
    if (b.mcap) {
      const t = b.mcapt ? b.mcapt.value : '0';
      if (!m.capAt || t > m.capAt) { m.capAt = t; m.capWdBn = Math.round(Number(b.mcap.value) / 1e9); }
    }
  } else { console.warn('  Wikidata enrich failed', wd.status); }

  const out = rows.map((r) => {
    const m = meta[titleToQid[r.title]] || {};
    // Prefer the FY2024 revenue-table value; fall back to latest Wikidata USD revenue
    // (fills the cap leaders — Nvidia, Apple, Meta, Tesla — absent from the revenue table).
    const wdRevYear = m.revAt ? Number(m.revAt.slice(0, 4)) : null;
    const revenueBn = r.revenueBn != null ? r.revenueBn : (m.revBn ?? null);
    const revYear = r.revenueBn != null ? REV_YEAR : (r.revenueBn == null && m.revBn != null ? wdRevYear : null);
    // Cap: authoritative fresh table value first; Wikidata P2226 (latest USD) widens
    // coverage to the non-tech giants (Walmart, Aramco, Exxon…) absent from the table.
    const wdCapYear = m.capAt ? Number(m.capAt.slice(0, 4)) : null;
    const capBn = r.capBn != null ? r.capBn : (m.capWdBn ?? null);
    const capYear = r.capBn != null ? CAP_YEAR : (r.capBn == null && m.capWdBn != null ? wdCapYear : null);
    return { name: r.name, capBn, capYear, revenueBn, profitBn: r.profitBn, employees: r.employees, revYear, industry: m.industry || null, iso: m.iso || null, logo: m.logo || null, desc: m.desc || null, wiki: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title)}` };
  });

  // Curated 2026 snapshot filling two gaps the open sources structurally miss:
  // TSMC reports revenue in TWD (filtered out of the USD-only Wikidata pull) and
  // Saudi Aramco's market cap isn't in the Wikipedia cap table. Public figures.
  const CURATED = {
    'TSMC': { revenueBn: 90, revYear: 2024 },
    'Saudi Aramco': { capBn: 1600, capYear: CAP_YEAR },
    'Broadcom': { revenueBn: 64, revYear: 2025 },   // FY2025 $63.9B (was a stale FY2023 figure)
    // SpaceX IPO'd 12 Jun 2026 (Nasdaq: SPCX) — largest IPO ever, ~$1.77T at listing;
    // FY2025 revenue ~$18.7B. Too new for the Wikipedia tables, so added in full.
    'SpaceX': { capBn: 1770, capYear: CAP_YEAR, revenueBn: 19, revYear: 2025, iso: 'USA',
      industry: 'aerospace', desc: 'American spacecraft manufacturer and launch provider (Nasdaq: SPCX)',
      logo: 'https://commons.wikimedia.org/wiki/Special:FilePath/SpaceX-Logo.svg',
      wiki: 'https://en.wikipedia.org/wiki/SpaceX' },
  };
  for (const o of out) {
    const cu = CURATED[o.name]; if (!cu) continue;
    // curated values are hand-verified and take precedence over the scraped ones
    if (cu.revenueBn != null) { o.revenueBn = cu.revenueBn; o.revYear = cu.revYear ?? o.revYear; }
    if (cu.capBn != null) { o.capBn = cu.capBn; o.capYear = cu.capYear ?? o.capYear; }
  }
  // add curated companies that aren't in the Wikipedia lists at all (e.g. just-IPO'd)
  for (const [name, cu] of Object.entries(CURATED)) {
    if (out.some((o) => o.name === name) || cu.capBn == null) continue;
    out.push({ name, capBn: cu.capBn, capYear: cu.capYear ?? CAP_YEAR, revenueBn: cu.revenueBn ?? null,
      profitBn: null, employees: null, revYear: cu.revYear ?? null, industry: cu.industry ?? null,
      iso: cu.iso ?? null, logo: cu.logo ?? null, desc: cu.desc ?? null, wiki: cu.wiki ?? null });
  }
  out.sort((a, b) => (b.capBn || 0) - (a.capBn || 0) || (b.revenueBn || 0) - (a.revenueBn || 0));
  // Most valuable first: market-cap leaders, then by revenue.
  out.sort((a, b) => (b.capBn || 0) - (a.capBn || 0) || (b.revenueBn || 0) - (a.revenueBn || 0));
  await writeFile(OUT, JSON.stringify(out));
  console.log(`✓ companies.json: ${out.length} (${out.filter((c) => c.capBn).length} with market cap, ${out.filter((c) => c.logo).length} logos)`);
  console.log('  top cap:', out.filter((c) => c.capBn).sort((a, b) => b.capBn - a.capBn).slice(0, 4).map((c) => `${c.name} $${(c.capBn / 1000).toFixed(2)}tn`).join(' · '));
}
main();
