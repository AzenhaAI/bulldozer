"""SDR2 (Survey Data Recycling, Harvard Dataverse, CC0) MASTER file ->
one row per country and five-year period, weighted.

    python3 scripts/tools/sdr2_aggregate.py MASTER.sav > data/raw/sdr2/sdr2_by_country_period.csv

MASTER.sav: https://dataverse.harvard.edu/api/access/datafile/7345859 (zipped,
~1 GB unzipped; doi:10.7910/DVN/YOCX0M). SDR2 harmonises 22 international
survey projects (Eurobarometer, ESS, ISSP, WVS/EVS, the regional barometers,
LiTS, Political Action…) into common target variables, 1966–2017.

The rule reproduces the pooled figures BullDozer first published, every
country of all seven series exactly: country = T_COUNTRY_L1U; weight
T_WEIGHT_L2U; trust items = weighted mean of the harmonised 0–10 scale
(T_*_11, missing codes < 0 left out); petition and demonstration = share
answering "yes" (codes 4 and 5) among codes 1–5; union = share "currently
member" (1) among 0 and 1.

Periods are five-year bins of the interview year (T_INT_YEAR), labelled
"1995–1999"; the last is "2015–2017". A bin pools whatever projects surveyed
the country in those years, so part of a change between bins can come from a
different mix of surveys; SDR2's harmonisation is what makes them comparable.
A country-period needs 500 valid answers.
"""
import sys
import numpy as np
import pyreadstat

MEAN = {'trgov': 'T_TRGOV_11', 'trparl': 'T_TRPARL_11', 'trparty': 'T_TRPARTY_11', 'trleg': 'T_TRLEG_11'}
SHARE = {'petition': ('T_PETITION', [4, 5], [1, 2, 3, 4, 5]), 'demonst': ('T_DEMONST', [4, 5], [1, 2, 3, 4, 5]),
         'union': ('T_MEMBER_UNION', [1], [0, 1])}
MIN_N = 500

cols = ['T_COUNTRY_L1U', 'T_INT_YEAR', 'T_WEIGHT_L2U'] + list(MEAN.values()) + [v[0] for v in SHARE.values()]
df, _ = pyreadstat.read_sav(sys.argv[1], usecols=cols)
y = df['T_INT_YEAR']
lo = (y // 5 * 5).astype('Int64')
df['_p'] = [f'{a}–{min(a + 4, 2017)}' if a == a else '' for a in lo]
df = df[df['_p'] != '']
keys = ['iso2', 'period'] + list(MEAN) + list(SHARE)
print(','.join(keys))
for (c, p), g in sorted(df.groupby(['T_COUNTRY_L1U', '_p'])):
    w = g['T_WEIGHT_L2U']
    row = {'iso2': c, 'period': p}
    for k, q in MEAN.items():
        ok = g[q] >= 0
        row[k] = '' if ok.sum() < MIN_N else f'{np.average(g[q][ok], weights=w[ok]):.6f}'
    for k, (q, yes, base) in SHARE.items():
        ok = g[q].isin(base)
        row[k] = '' if ok.sum() < MIN_N else f'{100 * w[ok & g[q].isin(yes)].sum() / w[ok].sum():.6f}'
    if any(row[k] for k in list(MEAN) + list(SHARE)):
        print(','.join(str(row[k]) for k in keys))
