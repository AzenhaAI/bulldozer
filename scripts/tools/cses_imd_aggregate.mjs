/**
 * CSES → one row per election study. Two releases, two layouts:
 *
 *   unzip -p cses_imd_csv.zip | node scripts/tools/cses_imd_aggregate.mjs imd > data/raw/cses/cses_imd_by_study.csv
 *   unzip -p cses6_csv.zip    | node scripts/tools/cses_imd_aggregate.mjs m6  > data/raw/cses/cses6_by_study.csv
 *
 * The same question carries a different code in each release — in Module 6,
 * F3010 is turnout and F3006 is "how democratic is your country", neither of
 * which is what IMD3010/IMD3006 mean — so every column is looked up by name
 * from the table below, never carried over by number.
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

// Codes per release, from each codebook (part 2, variables).
//  imd: satisfaction 1,2,4,5 + 6 "neither" (a real answer, some waves only).
//  m6:  satisfaction 1,2,4,5; 6 is labelled "[see election study notes]".
//       The notes say it is "neither satisfied nor dissatisfied" in both
//       studies that use it (Brazil 2022, Montenegro 2023) — the IMD's 6 — so
//       it is counted the same way; dropping it would lift Montenegro by ~20
//       points, since 368 of 1,200 gave that answer. Module 6 has no "who is
//       in power" item; that series stays on the IMD.
const MODULES = {
  imd: { study: 'IMD1004', iso: 'IMD1006_UNALPHA3', name: 'IMD1006_NAM', year: 'IMD1008_YEAR', weight: 'IMD1010_2',
         sat: 'IMD3010', satOk: [1, 2, 4, 5, 6], lr: 'IMD3006', power: 'IMD3011', vote: 'IMD3012' },
  m6:  { study: 'F1004', iso: 'F1006_UNALPHA3', name: 'F1006_NAM', year: 'F1009', weight: 'F1103_2',
         sat: 'F3022', satOk: [1, 2, 4, 5, 6], lr: 'F3020_R', power: null, vote: 'F3017' },
};
const M = MODULES[process.argv[2] || 'imd'];
if (!M) throw new Error(`unknown module ${process.argv[2]}; use imd or m6`);
const NEED = [M.study, M.iso, M.name, M.year, M.weight, M.sat, M.lr, M.vote, ...(M.power ? [M.power] : [])];

let col = null;
const studies = new Map();
let rows = 0, badWeight = 0;

const acc = () => ({ num: 0, den: 0, n: 0 });
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  if (!line) continue;
  const f = split(line);
  if (!col) {
    f[0] = f[0].replace(/^\uFEFF/, '');          // Module 6 starts with a byte-order mark
    col = Object.fromEntries(NEED.map((k) => [k, f.indexOf(k)]));
    const missing = NEED.filter((k) => col[k] < 0);
    if (missing.length) throw new Error(`columns not found: ${missing.join(', ')}`);
    continue;
  }
  rows++;
  const id = f[col[M.study]];
  let s = studies.get(id);
  if (!s) {
    s = { id, iso: f[col[M.iso]], name: f[col[M.name]], year: f[col[M.year]], respondents: 0,
          sat: acc(), lr: acc(), power: acc(), vote: acc() };
    studies.set(id, s);
  }
  s.respondents++;
  let w = Number(f[col[M.weight]]);
  if (!(w > 0) || !Number.isFinite(w)) { w = 1; badWeight++; }

  const sat = Number(f[col[M.sat]]);
  if (M.satOk.includes(sat)) { s.sat.den += w; s.sat.n++; if (sat <= 2) s.sat.num += w; }
  const lr = Number(f[col[M.lr]]);
  if (Number.isInteger(lr) && lr >= 0 && lr <= 10) { s.lr.num += w * lr; s.lr.den += w; s.lr.n++; }
  for (const [key, c] of [['power', M.power], ['vote', M.vote]]) {
    if (!c) continue;
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
