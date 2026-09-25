/**
 * CSES Integrated Module Dataset → one row per election study.
 *
 *   unzip -p cses_imd_csv.zip | node scripts/tools/cses_imd_aggregate.mjs > data/raw/cses/cses_imd_by_study.csv
 *
 * Run once per CSES release, locally. The source is 655 MB of CSV — larger than
 * the longest string Node can hold (512 MB), so it is read as a stream, line by
 * line, and only the aggregate (a few dozen KB) is committed. The scheduled
 * pipeline reads that aggregate and never touches the source.
 *
 * Every answer code below is taken from the IMD codebook
 * (cses_imd_codebook_part2_variables.txt). Refusals, don't-knows and missing are
 * integers in the same column as real answers; averaged naively they give
 * numbers that look plausible and mean nothing.
 *
 *   IMD3010 satisfaction with democracy: 1 very, 2 fairly, 4 not very,
 *           5 not at all, 6 neither (only in some modules) · 7/8/9 dropped.
 *           Reported as the share satisfied (1–2) among substantive answers:
 *           there is no code 3, and 6 exists in some waves only, so a mean
 *           over the codes would compare different scales.
 *   IMD3006 left–right self-placement 0–10 · 95/97/98/99 dropped. Mean.
 *   IMD3011 who is in power makes a difference, 1–5 · 7/8/9 dropped.
 *   IMD3012 who people vote for makes a difference, 1–5 · 7/8/9 dropped.
 *           Both reported as the share answering 4 or 5.
 *   Weight  IMD1010_2, the election-study demographic weight.
 */
import { createInterface } from 'node:readline';

// Quote-aware split of one CSV line; the file has no embedded newlines.
function split(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const NEED = ['IMD1004', 'IMD1006_UNALPHA3', 'IMD1006_NAM', 'IMD1008_YEAR', 'IMD1010_2', 'IMD3010', 'IMD3006', 'IMD3011', 'IMD3012'];
let col = null;
const studies = new Map();
let rows = 0, badWeight = 0;

const acc = () => ({ num: 0, den: 0, n: 0 });
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  if (!line) continue;
  const f = split(line);
  if (!col) {
    col = Object.fromEntries(NEED.map((k) => [k, f.indexOf(k)]));
    const missing = NEED.filter((k) => col[k] < 0);
    if (missing.length) throw new Error(`columns not found: ${missing.join(', ')}`);
    continue;
  }
  rows++;
  const id = f[col.IMD1004];
  let s = studies.get(id);
  if (!s) {
    s = { id, iso: f[col.IMD1006_UNALPHA3], name: f[col.IMD1006_NAM], year: f[col.IMD1008_YEAR], respondents: 0,
          sat: acc(), lr: acc(), power: acc(), vote: acc() };
    studies.set(id, s);
  }
  s.respondents++;
  let w = Number(f[col.IMD1010_2]);
  if (!(w > 0) || !Number.isFinite(w)) { w = 1; badWeight++; }

  const sat = Number(f[col.IMD3010]);
  if ([1, 2, 4, 5, 6].includes(sat)) { s.sat.den += w; s.sat.n++; if (sat <= 2) s.sat.num += w; }
  const lr = Number(f[col.IMD3006]);
  if (Number.isInteger(lr) && lr >= 0 && lr <= 10) { s.lr.num += w * lr; s.lr.den += w; s.lr.n++; }
  for (const [key, c] of [['power', 'IMD3011'], ['vote', 'IMD3012']]) {
    const v = Number(f[col[c]]);
    if (Number.isInteger(v) && v >= 1 && v <= 5) { s[key].den += w; s[key].n++; if (v >= 4) s[key].num += w; }
  }
}

const r = (a, k) => (a.den > 0 ? (k * a.num / a.den).toFixed(2) : '');
console.log('study,iso3,name,year,respondents,sat_share,sat_n,lr_mean,lr_n,power_share,power_n,vote_share,vote_n');
for (const s of [...studies.values()].sort((a, b) => a.id.localeCompare(b.id))) {
  console.log([s.id, s.iso, `"${s.name}"`, s.year, s.respondents,
    r(s.sat, 100), s.sat.n, r(s.lr, 1), s.lr.n, r(s.power, 100), s.power.n, r(s.vote, 100), s.vote.n].join(','));
}
console.error(`${rows} respondents, ${studies.size} election studies, ${badWeight} without a usable weight (counted as 1)`);
