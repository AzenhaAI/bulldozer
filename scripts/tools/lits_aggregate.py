"""EBRD Life in Transition Survey, waves I–IV (2006, 2010, 2016, 2022–23) ->
one row per country and wave, weighted means.

    python3 scripts/tools/lits_aggregate.py <dir> > data/raw/lits/lits_by_country_wave.csv

<dir> holds the EBRD's free Stata files (https://www.ebrd.com/home/what-we-do/
office-of-the-chief-economist/lits/life-in-transition-survey-data.html):
l1.dta (LITS-2006-data.dta), l2.dta (lits2.dta), l3.dta (lits_iii.dta),
l4/lits_iv.dta (from lits_iv_dta.zip).

The rule reproduces the LiTS IV means first published here from the EBRD's
visualiser (every country to two decimals): weighted mean of the answer scale,
"don't know", "difficult to say", refused and other negative or out-of-scale
codes left out. Weights: wave IV `weight`, III `weight_sample`, II `weight`,
I `weight_1` — within a country each is proportional to the sampling weight,
so the country mean does not depend on which population scaling is used.

Items and the waves that asked them on the same scale:
  trust            1–5   I q302_1, II q302, III q403, IV q402
  self_health      1–5   I q705, II q704, III q901, IV q801   (1 = very good, 5 = very bad)
  risk_tolerance   1–10  II q537, III q428, IV q418
  state_ownership  1–10  III q417b, IV q410ba
  religion         1–5   IV q814b only
"""
import os
import sys
import pyreadstat

WAVES = {
    '2006': ('l1.dta', 'weight_1', {'trust': 'q302_1', 'self_health': 'q705'}),
    '2010': ('l2.dta', 'weight', {'trust': 'q302', 'self_health': 'q704', 'risk_tolerance': 'q537'}),
    '2016': ('l3.dta', 'weight_sample', {'trust': 'q403', 'self_health': 'q901', 'risk_tolerance': 'q428', 'state_ownership': 'q417b'}),
    '2023': (os.path.join('l4', 'lits_iv.dta'), 'weight', {'trust': 'q402', 'self_health': 'q801', 'risk_tolerance': 'q418',
                                                         'state_ownership': 'q410ba', 'religion': 'q814b'}),
}
SCALE = {'trust': 5, 'self_health': 5, 'risk_tolerance': 10, 'state_ownership': 10, 'religion': 5}
COLS = list(SCALE)
MIN_N = 300


def main(d):
    rows = []
    for wave, (f, wcol, items) in WAVES.items():
        path = os.path.join(d, f)
        _, meta = pyreadstat.read_dta(path, metadataonly=True)
        ccol = 'countryname' if 'countryname' in meta.column_names else 'country'
        df, meta = pyreadstat.read_dta(path, usecols=[ccol, wcol] + list(items.values()))
        lab = meta.variable_value_labels.get(ccol, {})
        for key, g in df.groupby(ccol):
            name = str(lab.get(key, key)).strip()
            row = {'country': name, 'wave': wave}
            for col in COLS:
                q = items.get(col)
                if not q:
                    row[col] = ''
                    continue
                v, w = g[q], g[wcol]
                ok = v.between(1, SCALE[col]) & w.notna() & (w > 0)
                row[col] = '' if ok.sum() < MIN_N else f'{(v[ok] * w[ok]).sum() / w[ok].sum():.6f}'
            rows.append(row)
    print(','.join(['country', 'wave'] + COLS))
    for r in rows:
        print(','.join(('"%s"' % r[k]) if k == 'country' else str(r[k]) for k in ['country', 'wave'] + COLS))


if __name__ == '__main__':
    main(sys.argv[1])
