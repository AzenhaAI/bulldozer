/**
 * Minimal SEC EDGAR client for the company-metrics parser.
 *
 * EDGAR asks automated clients to declare themselves in the User-Agent (a
 * name and a contact address; an anonymous agent gets 403 "Undeclared
 * Automated Tool") and to stay under 10 requests a second. We stay under 4.
 *   https://www.sec.gov/os/accessing-edgar-data
 *
 * Set EDGAR_CACHE=<dir> to keep raw responses on disk between runs while
 * developing; the weekly run needs no cache (it only fetches new filings).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const UA = 'BullDozer research agent@azenha.ai';
const GAP_MS = 260; // < 4 requests a second
const CACHE = process.env.EDGAR_CACHE || '';
let last = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { cache = true } = {}) {
  const key = CACHE && cache ? join(CACHE, url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_')) : '';
  if (key) { try { return await readFile(key, 'utf8'); } catch { /* not cached */ } }
  for (let attempt = 1; ; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' } });
    if (res.ok) {
      const text = await res.text();
      if (key) { await mkdir(CACHE, { recursive: true }); await writeFile(key, text); }
      return text;
    }
    // 429 / 403 "rate threshold" / 5xx: back off and retry a few times.
    if (attempt >= 4 || res.status === 404) throw new Error(`EDGAR ${res.status} for ${url}`);
    await sleep(2000 * attempt);
  }
}

const pad = (cik) => String(cik).padStart(10, '0');

/** Every filing of a company as flat rows: {form, filed, accession, items, primary}.
 *  The submissions file holds the latest ~1000 filings; older pages are listed
 *  under `filings.files` and fetched only when the cut-off reaches back that far. */
export async function listFilings(cik, since = '2019-01-01') {
  const rows = [];
  const add = (r) => {
    for (let i = 0; i < r.form.length; i++) {
      rows.push({ form: r.form[i], filed: r.filingDate[i], accession: r.accessionNumber[i], items: r.items?.[i] ?? '', primary: r.primaryDocument[i], description: r.primaryDocDescription?.[i] ?? '' });
    }
  };
  // Submissions change daily: never served from the dev cache.
  const sub = JSON.parse(await get(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`, { cache: false }));
  add(sub.filings.recent);
  for (const f of sub.filings.files ?? []) {
    if (f.filingTo < since) continue;
    add(JSON.parse(await get(`https://data.sec.gov/submissions/${f.name}`)));
  }
  return rows.filter((r) => r.filed >= since);
}

export const archiveDir = (cik, accession) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, '')}`;

/** The documents in one filing, from its index page: [{type, name, url}],
 *  where type is the EDGAR document type (8-K, EX-99.1, GRAPHIC, ...). */
export async function filingDocs(cik, accession) {
  const html = await get(`${archiveDir(cik, accession)}/${accession}-index.htm`);
  const table = html.slice(html.indexOf('tableFile'), html.indexOf('</table>', html.indexOf('tableFile')));
  const docs = [];
  for (const tr of table.split(/<tr[^>]*>/i).slice(2)) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    const href = cells[2]?.match(/href="([^"]+)"/)?.[1];
    if (!href) continue;
    const path = href.replace(/^\/ix\?doc=/, '');
    docs.push({ type: cells[3]?.replace(/<[^>]+>/g, '').trim() ?? '', name: path.split('/').pop(), url: `https://www.sec.gov${path}` });
  }
  return docs;
}

export async function fetchDoc(url) {
  return get(url);
}

/** Plain text of an HTML filing document: tags dropped, entities decoded,
 *  table cells and block ends turned into separators so phrases and table
 *  rows stay readable to a regular expression. */
export function htmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<\/(p|div|tr|li|h\d|table)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&amp;|&#38;/gi, '&')
    .replace(/&#8217;|&#x2019;|&rsquo;|&#8216;|&#x2018;|&lsquo;/gi, "'")
    .replace(/&#8220;|&#8221;|&#x201c;|&#x201d;|&ldquo;|&rdquo;|&quot;/gi, '"')
    .replace(/&#8211;|&#8212;|&#x2013;|&#x2014;|&ndash;|&mdash;/gi, '-')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&euro;/gi, 'EUR ')
    .replace(/&#14[56];/g, "'").replace(/&#14[78];/g, '"').replace(/&#15[01];/g, '-') // cp1252 punctuation
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, ' ')
    .replace(/[\u2018\u2019\u0091\u0092]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n[\s|]*\n */g, '\n')
    .trim();
}
