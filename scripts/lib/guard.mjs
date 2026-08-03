/**
 * Write guard: never let a refresh overwrite a good dataset with a broken one.
 *
 * Upstreams fail in ways a row count can't see — an API returns 200 with an
 * HTML maintenance page, a CSV gains a blank column so every value parses as 0,
 * a paginated endpoint silently returns page 1 only, two of five years 502 and
 * the rest still parse. In each case the parser produces a *plausible* file and
 * overwrites months of good data.
 *
 * So each write is compared against the file already on disk: the committed
 * dataset is its own baseline. Nothing to configure, nothing to drift.
 * A refresh that shrinks, loses ISO codes, goes flat or rolls back in time is
 * refused — the old file stays, and the run is marked failed.
 *
 * Deliberate shrinks (an upstream really did drop a year) are allowed through
 * with BD_ACCEPT_DATA_CHANGE=<slug>[,<slug>] or =all, or permanently via a
 * per-slug entry in guard_policy.json.
 */
import { readFile } from 'node:fs/promises';

export const DEFAULT_POLICY = {
  minRows: 1,
  maxRowShrink: 0.10,       // rows may not drop more than 10%
  maxEntityShrink: 0.10,    // nor may the country count
  requireNewestPeriod: true, // the latest period may not go backwards
  maxModeShare: 0.90,       // >90% identical values = a parsed-as-zero column
  minFiniteShare: 0.99,     // values must stay numeric
  maxIsoCoverageDrop: 0.05, // ISO codes may not silently stop matching
};

/** Cheap structural summary of a dataset's rows. */
export function fingerprint(data) {
  const vals = data.map((r) => r.value).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const counts = new Map();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  return {
    rows: data.length,
    entities: new Set(data.map((r) => r.iso ?? r.entity)).size,
    periods: [...new Set(data.map((r) => String(r.period)))].sort(),
    isoCoverage: data.length ? data.filter((r) => r.iso).length / data.length : 0,
    finiteShare: data.length ? vals.length / data.length : 0,
    modeShare: vals.length ? Math.max(...counts.values()) / vals.length : 0,
  };
}

const pct = (x) => `${(x * 100).toFixed(0)}%`;

/**
 * Compare a fresh fingerprint against the previous one.
 * `prev` is null for a brand-new dataset — then only minRows applies.
 * @returns {{ok: boolean, violations: {code: string, detail: string}[]}}
 */
export function compareFingerprints(prev, next, policy = DEFAULT_POLICY) {
  const v = [];
  const p = { ...DEFAULT_POLICY, ...policy };

  if (next.rows < p.minRows) v.push({ code: 'empty', detail: `${next.rows} rows` });
  // A flat or non-numeric file is broken whether or not there is a baseline:
  // this is the "blank column parsed as 0" and "HTML served as CSV" case.
  if (next.rows && next.modeShare > p.maxModeShare) {
    v.push({ code: 'flat-values', detail: `${pct(next.modeShare)} of values identical` });
  }
  if (next.rows && next.finiteShare < p.minFiniteShare) {
    v.push({ code: 'non-numeric', detail: `only ${pct(next.finiteShare)} of values are finite numbers` });
  }
  if (!prev) return { ok: !v.length, violations: v };

  if (prev.rows && next.rows < prev.rows * (1 - p.maxRowShrink)) {
    v.push({ code: 'row-shrink', detail: `${prev.rows} → ${next.rows} rows` });
  }
  if (prev.entities && next.entities < prev.entities * (1 - p.maxEntityShrink)) {
    v.push({ code: 'entity-shrink', detail: `${prev.entities} → ${next.entities} countries` });
  }
  if (prev.isoCoverage - next.isoCoverage > p.maxIsoCoverageDrop) {
    v.push({ code: 'iso-drop', detail: `ISO coverage ${pct(prev.isoCoverage)} → ${pct(next.isoCoverage)}` });
  }
  if (next.periods.length < prev.periods.length) {
    v.push({ code: 'periods-lost', detail: `${prev.periods.length} → ${next.periods.length} periods` });
  }
  if (p.requireNewestPeriod && prev.periods.length && next.periods.length) {
    const a = prev.periods.at(-1), b = next.periods.at(-1);
    if (b < a) v.push({ code: 'period-rollback', detail: `newest period ${a} → ${b}` });
  }
  return { ok: !v.length, violations: v };
}

/** Slugs the operator has accepted for this run (BD_ACCEPT_DATA_CHANGE=a,b or =all). */
export function acceptedSlugs() {
  const raw = (process.env.BD_ACCEPT_DATA_CHANGE ?? '').trim();
  if (!raw) return new Set();
  if (raw === 'all') return new Set(['all']);
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

/** Permanent per-slug loosening, e.g. {"unhcr-idps": {"maxRowShrink": 0.35}}. */
export async function loadPolicy(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return {};
  }
}
