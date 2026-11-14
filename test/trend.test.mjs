// node test/trend.test.mjs — checks src/lib/trend.ts against SciPy/pymannkendall answers.
import { readFileSync } from 'node:fs';
import { theilSen, mannKendall, yDomain, niceTicks, periodYear, lowess, trendOf } from '../src/lib/trend.ts';
const { cases } = JSON.parse(readFileSync(new URL('./trend-vectors.json', import.meta.url)));
let bad = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
for (const c of cases) {
  const ts = theilSen(c.x, c.y), m = mannKendall(c.y);
  const ok = near(ts.slope, c.slope, 1e-9) && near(ts.intercept, c.intercept, 1e-9) && m.s === c.s && near(m.z, c.z, 1e-9) && Math.abs(m.p - c.p) < 1e-6;
  if (!ok) { bad++; console.log('✗', c.name, { slope: [ts.slope, c.slope], icpt: [ts.intercept, c.intercept], s: [m.s, c.s], z: [m.z, c.z], p: [m.p, c.p] }); }
}
const check = (cond, msg) => { if (!cond) { bad++; console.log('✗', msg); } };
check(yDomain([0, 0, 0])[0] < 0 && yDomain([0, 0, 0])[1] > 0, 'flat series still gets a range');
check(yDomain([65, 76])[0] > 64 && yDomain([65, 76])[1] < 77, 'axis zooms to the data');
check(JSON.stringify(niceTicks(-10.7, 10.9, 5)) === '[-10,-5,0,5,10]', 'round ticks with 0: ' + niceTicks(-10.7, 10.9));
check(!trendOf([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023].map((x, i) => ({ x, y: [70, 74, 77, 78, 77, 74, 70, 66][i] }))).clear, 'no trend through a rise then fall');
check(trendOf([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023].map((x, i) => ({ x, y: 50 + i * 1.5 }))).clear, 'steady rise is a trend');
check(periodYear('2021–2023') === 2022 && periodYear('2016') === 2016, 'periodYear');
const lw = JSON.parse(readFileSync(new URL('./lowess-vectors.json', import.meta.url))).cases;
for (const c of lw) {
  const sm = lowess(c.x, c.y, 0.3);
  const worst = Math.max(...sm.map((v, i) => Math.abs(v - c.smooth[i])));
  if (!(worst < 1e-8)) { bad++; console.log('✗ lowess', c.name, worst); }
}
console.log(`  lowess: ${lw.length} series vs statsmodels`);
console.log(bad ? `${bad} failed` : `✓ all ${cases.length} trend cases, ${lw.length} lowess series and 6 rule checks pass`);
process.exit(bad ? 1 : 0);
