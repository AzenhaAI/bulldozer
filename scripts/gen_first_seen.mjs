/**
 * Writes src/data/first-seen.json: the date each live dataset first appeared.
 *
 *   node scripts/gen_first_seen.mjs
 *
 * Why not parsedAt: every parser stamps parsedAt on every run, so it is the
 * date a series was last RE-parsed. On 2026-09-23 "parsedAt in the last ten
 * days" matched 51 datasets, of which 14 were new — 37 months-old series would
 * have been announced as fresh. Twenty more carry a survey vintage ("2024",
 * "2017–2020") in that field, not a date at all.
 *
 * The date a file was first added to git is the real signal. It is computed
 * here, locally, where history exists, and committed — the scheduled CI run
 * checks out with depth 1 and would see every file as added today.
 * A live dataset with no commit yet is being added right now, so it gets today.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const OUT = join('src', 'data', 'first-seen.json');
const DIRS = ['src/data/macro', 'src/data/surveys'];
const today = new Date().toISOString().slice(0, 10);

if (execFileSync('git', ['rev-parse', '--is-shallow-repository']).toString().trim() === 'true') {
  console.error('✗ shallow clone: every file would look new. Run this where the history is.');
  process.exit(1);
}

const live = new Set(DIRS.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => basename(f, '.json'))));

// One pass over history. Each commit prints a NUL-prefixed date, then the
// files it added; earliest date wins, so a later rename cannot make an old
// dataset look new.
const log = execFileSync('git', ['log', '--diff-filter=A', '--format=%x00%aI', '--name-only', '--', ...DIRS], { maxBuffer: 64 << 20 }).toString();
const first = {};
for (const block of log.split('\0').slice(1)) {
  const [date, ...files] = block.trim().split('\n');
  const day = date.slice(0, 10);
  for (const f of files) {
    const slug = basename(f.trim(), '.json');
    if (live.has(slug) && (!first[slug] || day < first[slug])) first[slug] = day;
  }
}
for (const slug of live) first[slug] ??= today;

const sorted = Object.fromEntries(Object.entries(first).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
const byDay = {};
for (const d of Object.values(sorted)) byDay[d] = (byDay[d] ?? 0) + 1;
const newest = Object.keys(byDay).sort().at(-1);
console.log(`✓ ${OUT}: ${Object.keys(sorted).length} datasets, newest cohort ${newest} (${byDay[newest]})`);
