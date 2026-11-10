// node test/trend.test.mjs — checks src/lib/trend.ts against SciPy/pymannkendall answers.
import { readFileSync } from 'node:fs';
import { theilSen, mannKendall, isFlat, yDomain, periodYear } from '../src/lib/trend.ts';
const { cases } = JSON.parse(readFileSync(new URL('./trend-vectors.json', import.meta.url)));
let bad = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
for (const c of cases) {
  const ts = theilSen(c.x, c.y), m = mannKendall(c.y);
  const ok = near(ts.slope, c.slope, 1e-9) && near(ts.intercept, c.intercept, 1e-9) && m.s === c.s && near(m.z, c.z, 1e-9) && Math.abs(m.p - c.p) < 1e-6;
  if (!ok) { bad++; console.log('✗', c.name, { slope: [ts.slope, c.slope], icpt: [ts.intercept, c.intercept], s: [m.s, c.s], z: [m.z, c.z], p: [m.p, c.p] }); }
}
const check = (cond, msg) => { if (!cond) { bad++; console.log('✗', msg); } };
check(isFlat([0, 0, 0, 0]) && !isFlat([1, 1.2]) && isFlat([1.04, 0.96]), 'isFlat');
check(yDomain([0, 0, 0])[0] === 0 && yDomain([0, 0, 0])[1] > 0, 'flat zero domain never negative');
check(yDomain([65, 76], { area: true })[0] === 0, 'area starts at 0');
check(yDomain([-3, 2], { nonNegative: false })[0] < -3, 'negative allowed when data has negatives');
check(periodYear('2021–2023') === 2022 && periodYear('2016') === 2016, 'periodYear');
console.log(bad ? `${bad} failed of ${cases.length + 5}` : `✓ all ${cases.length + 5} checks pass`);
process.exit(bad ? 1 : 0);
