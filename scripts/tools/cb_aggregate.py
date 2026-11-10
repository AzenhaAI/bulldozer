"""Caucasus Barometer time-series files -> one row per country and year, weighted shares.

    python3 scripts/tools/cb_aggregate.py am.dta ge.dta az.dta > data/raw/caucasus/cb_by_country_year.csv

CRRC publishes one harmonised time-series file per country (free, no account):
  https://caucasusbarometer.org/en/cb-am/downloads/  — Armenia 2008–2024, Georgia 2008–2024,
  Azerbaijan 2008–2013 (the last wave that still included Azerbaijan).

The rule reproduces the 2013 figures BullDozer published from the regional file
(all nine, to two decimals): weight WTIND; share answering "Trust" (the file's
code 3, which merges "somewhat" and "fully" trust); denominator = Distrust,
Neither and Trust — "don't know / refused" (98), legal skips and errors are left
out. Support for EU membership is read the same way (code 3, "Support").

Life satisfaction is not written: the time-series file keeps only three bands,
so the 1–10 mean published for 2013 cannot be recomputed from it.
"""
import sys
import pyreadstat
from moe import share_moe

ITEMS = {
    'trust_army': 'TRUARMY', 'trust_police': 'TRUPOLI', 'trust_eu': 'TRUSTEU',
    'trust_parliament': 'TRUPARL', 'trust_president': 'TRUPRES', 'trust_courts': 'TRUCRTS',
    'trust_media': 'TRUMEDI', 'trust_religious': 'TRURELI', 'eu_support': 'EUSUPP',
}
ISO = {'am': ('ARM', 'Armenia'), 'ge': ('GEO', 'Georgia'), 'az': ('AZE', 'Azerbaijan')}
MIN_N = 300

rows = []
for path in sys.argv[1:]:
    key = next(k for k in ISO if f'/{k}.' in '/' + path.split('/')[-1] or path.split('/')[-1].startswith(k))
    iso, name = ISO[key]
    _, meta = pyreadstat.read_dta(path, metadataonly=True)
    ycol = 'year' if 'year' in meta.column_names else 'date'
    cols = [ycol, 'WTIND'] + [q for q in ITEMS.values() if q in meta.column_names]
    df, _ = pyreadstat.read_dta(path, usecols=cols)
    for year, g in sorted(df.groupby(ycol)):
        row = {'iso3': iso, 'name': name, 'year': int(year)}
        for col, q in ITEMS.items():
            if q not in g:
                row[col] = row[col + '_moe'] = ''
                continue
            v, w = g[q], g['WTIND']
            ok = v.isin([1, 2, 3])
            row[col] = '' if ok.sum() < MIN_N else f'{100 * w[ok & (v == 3)].sum() / w[ok].sum():.4f}'
            row[col + '_moe'] = share_moe(row[col], w[ok]) if row[col] else ''
        rows.append(row)

keys = ['iso3', 'name', 'year'] + list(ITEMS) + [c + '_moe' for c in ITEMS]
print(','.join(keys))
for r in rows:
    print(','.join(str(r[k]) for k in keys))
