/**
 * Runs every data parser and reports once at the end.
 *
 * Replaces the old `a.mjs && b.mjs && ...` chain, where a single flaky upstream
 * cancelled everything downstream: when the World Bank returned 502 for Findex,
 * the seven parsers after it never ran at all, so unrelated datasets went stale
 * for a week over someone else's bad minute.
 *
 * Each parser is independent, so each gets to run. Failures are collected and
 * printed as a summary; the process exits non-zero if anything failed, which
 * keeps CI honest without letting one source hold the rest hostage.
 *
 *   node scripts/run_parsers.mjs            # all of them
 *   node scripts/run_parsers.mjs owid cpi   # only matching ones
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));

// Order matters only for readability — no parser depends on another's output.
const PARSERS = [
  'parse_macro.mjs', 'parse_surveys.mjs', 'parse_tidy.mjs', 'parse_lits.mjs',
  'parse_risk.mjs', 'parse_owid.mjs', 'parse_maddison.mjs', 'parse_eurostat.mjs',
  'parse_findex.mjs', 'parse_bigmac.mjs', 'parse_cpi.mjs', 'parse_pisa.mjs',
  'parse_rsf.mjs', 'parse_fiw.mjs', 'parse_unhcr.mjs', 'parse_eu_cities.mjs',
];

const filter = process.argv.slice(2);
const todo = filter.length ? PARSERS.filter((p) => filter.some((f) => p.includes(f))) : PARSERS;

const run = (script) => new Promise((resolve) => {
  const started = process.hrtime.bigint();
  const child = spawn(process.execPath, [join(SCRIPTS, script)], { stdio: 'inherit' });
  child.on('close', (code) => resolve({
    script,
    code: code ?? 1,
    secs: Number((process.hrtime.bigint() - started) / 1_000_000n) / 1000,
  }));
});

const results = [];
for (const script of todo) results.push(await run(script));

const failed = results.filter((r) => r.code !== 0);
console.log('\n' + '─'.repeat(58));
for (const r of results) {
  console.log(`${r.code === 0 ? '  ok  ' : ' FAIL '} ${r.script.padEnd(24)} ${r.secs.toFixed(1)}s`);
}
console.log('─'.repeat(58));
console.log(`${results.length - failed.length}/${results.length} parsers ok`);

if (failed.length) {
  console.error(`\n✗ failed: ${failed.map((f) => f.script).join(', ')}`);
  console.error('  Datasets they own were left untouched — nothing was overwritten.');
  console.error('  A refused write means the guard rejected suspicious data (lib/guard.mjs);');
  console.error('  an upstream error usually just means try again later.');
  process.exit(1);
}
